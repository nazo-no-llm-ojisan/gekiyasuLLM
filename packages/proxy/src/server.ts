import http from "node:http";
import type { ProxyConfig } from "./config.js";
import {
  buildOfferingCatalog,
  candidatesFromCatalog,
} from "./route/catalog.js";
import { describeExecution, executeRoutePlan } from "./route/executor.js";
import { buildRoutePlan } from "./route/plan.js";
import { checkProxyToken } from "./security.js";
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

export function createServer(config: ProxyConfig): http.Server {
  const catalog = buildOfferingCatalog(config);

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
        return;
      }

      res.setHeader("x-gekiyasu-route-plan", describeExecution({ plan }));
      res.setHeader("x-gekiyasu-offering", plan.primary);

      try {
        await executeRoutePlan({
          plan,
          catalog,
          req,
          res,
          config,
          pathWithQuery,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (!res.headersSent) {
          const code = message.startsWith("Unknown offering")
            ? "unknown_offering"
            : "internal_error";
          sendJson(res, 500, {
            error: { message, type: "proxy_error", code },
          });
        }
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
