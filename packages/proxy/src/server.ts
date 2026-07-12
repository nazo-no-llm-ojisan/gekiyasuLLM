import http from "node:http";
import type { ProxyConfig } from "./config.js";
import { proxyRequest } from "./upstream.js";

export type RunningServer = {
  server: http.Server;
  url: string;
  close: () => Promise<void>;
};

export function createServer(config: ProxyConfig): http.Server {
  return http.createServer(async (req, res) => {
    const host = req.headers.host ?? `${config.host}:${config.port}`;
    const url = new URL(req.url ?? "/", `http://${host}`);
    const path = url.pathname;

    // Health (local only)
    if (path === "/health" || path === "/healthz") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          ok: true,
          service: "gekiyasuLLMProxy",
          upstream: config.upstreamBaseUrl,
        }),
      );
      return;
    }

    // OpenAI-compatible surface (passthrough for MVP)
    if (
      path === "/v1/models" ||
      path.startsWith("/v1/models/") ||
      path === "/v1/chat/completions" ||
      path === "/v1/completions" ||
      path === "/v1/embeddings" ||
      path === "/v1/responses"
    ) {
      const pathWithQuery = path + url.search;
      try {
        await proxyRequest(req, res, config, pathWithQuery);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (!res.headersSent) {
          res.writeHead(500, { "content-type": "application/json" });
          res.end(
            JSON.stringify({
              error: { message, type: "proxy_error", code: "internal_error" },
            }),
          );
        }
      }
      return;
    }

    res.writeHead(404, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        error: {
          message: `Unknown path: ${path}. Try /v1/chat/completions or /health.`,
          type: "invalid_request_error",
          code: "not_found",
        },
      }),
    );
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
