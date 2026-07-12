import http from "node:http";
import type { ProxyConfig } from "./config.js";
import {
  buildOfferingCatalog,
  candidatesFromCatalog,
} from "./route/catalog.js";
import { describeExecution, executeRoutePlan } from "./route/executor.js";
import { buildRoutePlan } from "./route/plan.js";
import { checkProxyToken } from "./security.js";
import {
  createJsonlStatsStore,
  createNullStatsStore,
  type StatsStore,
} from "./stats/store.js";
import { tryServeDashboard } from "./static-dashboard.js";

export type RunningServer = {
  server: http.Server;
  url: string;
  close: () => Promise<void>;
};

function sendJson(
  res: http.ServerResponse,
  status: number,
  body: unknown,
): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
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
  const stats = buildStatsStore(config);

  return http.createServer(async (req, res) => {
    const host = req.headers.host ?? `${config.host}:${config.port}`;
    const url = new URL(req.url ?? "/", `http://${host}`);
    const path = url.pathname;

    if (path === "/health" || path === "/healthz") {
      sendJson(res, 200, {
        ok: true,
        service: "gekiyasuLLMProxy",
        upstream: config.upstreamBaseUrl,
        proxyTokenRequired: Boolean(config.proxyToken),
        statsEnabled: Boolean(config.statsFile),
      });
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
        sendJson(res, 401, {
          error: {
            message:
              tokenCheck.code === "missing_proxy_token"
                ? "Missing proxy token. Send header X-Gekiyasu-Token (or Authorization: Bearer gekiyasu-proxy:<token>)."
                : "Invalid proxy token.",
            type: "invalid_request_error",
            code: tokenCheck.code,
          },
        });
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
        });
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

      try {
        const result = await executeRoutePlan({
          plan,
          catalog,
          req,
          res,
          config,
          pathWithQuery,
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
          });
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
    });
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
