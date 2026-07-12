import http from "node:http";
import type { ProxyConfig } from "./config.js";
import {
  buildOfferingCatalog,
  candidatesFromCatalog,
} from "./route/catalog.js";
import { createCircuitBreaker } from "./route/circuit.js";
import { describeExecution, executeRoutePlan } from "./route/executor.js";
import { buildRoutePlan } from "./route/plan.js";
import { extractRequestFacts } from "./route/request-facts.js";
import { checkProxyToken, describeAuthShape } from "./security.js";
import {
  createJsonlStatsStore,
  createNullStatsStore,
  type StatsStore,
} from "./stats/store.js";
import { tryServeDashboard } from "./static-dashboard.js";
import { readBody } from "./upstream.js";

export type RunningServer = {
  server: http.Server;
  url: string;
  close: () => Promise<void>;
};

function buildCorsHeaders(allowlist: string[]): (req?: http.IncomingMessage) => Record<string, string> {
  // T-047 / issue #3: fail-closed CORS. The proxy only emits permissive
  // CORS headers when the request's Origin exactly matches an entry in
  // `allowlist` (loaded from GEKIYASU_CORS_ALLOWLIST). The default is
  // empty, which means no Access-Control-Allow-Origin / -Credentials /
  // -Private-Network headers are emitted, even for preflight. `*` is not
  // supported on purpose: any browser access must be explicit.
  return (req) => {
    const origin = req?.headers.origin;
    const allowed = typeof origin === "string" && allowlist.includes(origin) ? origin : undefined;
    if (!allowed) {
      return {} as Record<string, string>;
    }
    return {
      "access-control-allow-origin": allowed,
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers":
        "authorization,content-type,x-gekiyasu-token,openai-organization,openai-project",
      "access-control-expose-headers":
        "x-gekiyasu-route-plan,x-gekiyasu-offering,x-gekiyasu-attempts,x-gekiyasu-fallback",
      "access-control-allow-credentials": "true",
      "access-control-allow-private-network": "true",
      vary: "Origin",
    } as Record<string, string>;
  };
}

function buildStatsStore(config: ProxyConfig): StatsStore {
  if (!config.statsFile) return createNullStatsStore();
  return createJsonlStatsStore(config.statsFile);
}

async function recordRouteStat(
  stats: StatsStore,
  input: {
    method: string;
    path: string;
    startedMs: number;
    offeringId?: string;
    attempts: string[];
    status: number;
    errorCode?: string;
  },
): Promise<void> {
  const status = input.status > 0 ? input.status : 0;
  try {
    await stats.record({
      ts: new Date().toISOString(),
      method: input.method,
      path: input.path,
      offeringId: input.offeringId,
      attempts: input.attempts,
      status,
      latencyMs: Math.max(0, Date.now() - input.startedMs),
      ok: status >= 200 && status < 400,
      errorCode: input.errorCode,
    });
  } catch {
    // Stats must never break the request path
  }
}

export function createServer(config: ProxyConfig): http.Server {
  const catalog = buildOfferingCatalog(config);
  const circuit = createCircuitBreaker({
    failureThreshold: config.circuitFailureThreshold,
    openSeconds: config.circuitOpenSeconds,
  });
  const stats = buildStatsStore(config);
  const cors = buildCorsHeaders(config.corsAllowlist);

  const sendJson = (
    res: http.ServerResponse,
    status: number,
    body: unknown,
    req?: http.IncomingMessage,
  ): void => {
    res.writeHead(status, {
      ...cors(req),
      "content-type": "application/json",
    });
    res.end(JSON.stringify(body));
  };

  const sendOptions = (req: http.IncomingMessage, res: http.ServerResponse): void => {
    res.writeHead(204, cors(req));
    res.end();
  };

  return http.createServer(async (req, res) => {
    const host = req.headers.host ?? `${config.host}:${config.port}`;
    const url = new URL(req.url ?? "/", `http://${host}`);
    const path = url.pathname;

    if (req.method === "OPTIONS") {
      sendOptions(req, res);
      return;
    }

    if (path === "/health" || path === "/healthz") {
      sendJson(res, 200, {
        ok: true,
        service: "gekiyasuLLMProxy",
        upstream: config.upstreamBaseUrl,
        proxyTokenRequired: Boolean(config.proxyToken),
        statsEnabled: Boolean(config.statsFile),
      }, req);
      return;
    }

    // Static dashboard (no proxy token; local demo UI only)
    if (tryServeDashboard(req, res, path)) {
      return;
    }

    if (
      path === "/v1/models" ||
      path.startsWith("/v1/models/") ||
      path === "/v1/chat/completions" ||
      path === "/v1/completions" ||
      path === "/v1/embeddings" ||
      path === "/v1/responses"
    ) {
      const tokenCheck = checkProxyToken(req.headers, config.proxyToken);
      if (!tokenCheck.ok) {
        console.warn(
          JSON.stringify({
            level: "warn",
            event: "proxy_token_rejected",
            code: tokenCheck.code,
            method: req.method ?? "GET",
            path,
            authShape: describeAuthShape(req.headers),
          }),
        );
        await recordRouteStat(stats, {
          method: req.method ?? "GET",
          path,
          startedMs: Date.now(),
          attempts: [],
          status: 401,
          errorCode: tokenCheck.code,
        });
        sendJson(res, 401, {
          error: {
            message:
              tokenCheck.code === "missing_proxy_token"
                ? "Missing proxy token. Send X-Gekiyasu-Token, or use API key gekiyasu-proxy:<token>."
                : "Invalid proxy token.",
            type: "invalid_request_error",
            code: tokenCheck.code,
          },
        }, req);
        return;
      }

      const pathWithQuery = path + url.search;
      const startedMs = Date.now();
      const method = req.method ?? "GET";

      let plan;
      try {
        plan = buildRoutePlan({
          candidates: candidatesFromCatalog(catalog),
          preferences: { preferFree: true },
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        sendJson(res, 503, {
          error: {
            message,
            type: "proxy_error",
            code: "no_eligible_offering",
          },
        }, req);
        await recordRouteStat(stats, {
          method,
          path,
          startedMs,
          attempts: [],
          status: 503,
          errorCode: "no_eligible_offering",
        });
        return;
      }

      res.setHeader("x-gekiyasu-route-plan", describeExecution({ plan }));

      // T-044 / issue #2: buffer the body once in the request layer and
      // pass it through to the executor as `PreparedRequest`. The executor
      // will not re-read from `req` (executor.prepared.body is checked
      // before readBody). Body ownership is here, not inside the executor.
      let body: Buffer | undefined;
      if (method !== "GET" && method !== "HEAD") {
        try {
          body = await readBody(req, config.maxBodyBytes);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          const code =
            err instanceof Error && "code" in err
              ? String((err as { code?: string }).code)
              : "body_error";
          sendJson(res, code === "body_too_large" ? 413 : 400, {
            error: { message, type: "invalid_request_error", code },
          }, req);
          await recordRouteStat(stats, {
            method,
            path,
            startedMs,
            attempts: [],
            status: code === "body_too_large" ? 413 : 400,
            errorCode: code,
          });
          return;
        }
      }
      const contentType = req.headers["content-type"];
      const facts = extractRequestFacts({
        method,
        path,
        contentType: typeof contentType === "string" ? contentType : undefined,
        body,
      });

      try {
        const result = await executeRoutePlan({
          plan,
          catalog,
          req,
          res,
          config,
          pathWithQuery,
          circuit,
          prepared: { body, facts },
        });
        await recordRouteStat(stats, {
          method,
          path,
          startedMs,
          offeringId: result.offeringId,
          attempts: result.attempts,
          status: res.statusCode,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (!res.headersSent) {
          sendJson(res, 500, {
            error: { message, type: "proxy_error", code: "internal_error" },
          }, req);
        }
        await recordRouteStat(stats, {
          method,
          path,
          startedMs,
          attempts: [],
          status: res.statusCode || 500,
          errorCode: "internal_error",
        });
      }
      return;
    }

    sendJson(res, 404, {
      error: {
        message: `Unknown path: ${path}. Try /v1/chat/completions or /health.`,
        type: "invalid_request_error",
        code: "not_found",
      },
    }, req);
  });
}

export function listen(config: ProxyConfig): Promise<RunningServer> {
  const server = createServer(config);
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(config.port, config.host, () => {
      const url = `http://${config.host}:${config.port}`;
      resolve({
        server,
        url,
        close: () =>
          new Promise((res, rej) => {
            server.close((err) => (err ? rej(err) : res()));
          }),
      });
    });
  });
}
