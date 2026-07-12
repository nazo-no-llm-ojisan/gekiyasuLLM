/**
 * OpenAI-compatible UpstreamAdapter (MVP).
 * Will move under upstream/openai-compatible.ts; keep vendor-neutral
 * InternalChatRequest types in @gekiyasu/schema — do not treat OpenAI as the only shape.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import type { ProxyConfig } from "./config.js";

const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
  "host",
  "content-length",
]);

function pickAuthHeader(
  req: IncomingMessage,
  config: ProxyConfig,
): string | undefined {
  const fromClient = req.headers.authorization;
  if (typeof fromClient === "string" && fromClient.length > 0) {
    // If client sent a local placeholder and we have an env key, prefer env
    // for the common "local proxy holds the real key" setup.
    if (
      config.upstreamApiKey &&
      (fromClient === "Bearer local" ||
        fromClient === "Bearer gekiyasu" ||
        fromClient === "Bearer sk-local")
    ) {
      return `Bearer ${config.upstreamApiKey}`;
    }
    return fromClient;
  }
  if (config.upstreamApiKey) {
    return `Bearer ${config.upstreamApiKey}`;
  }
  return undefined;
}

function buildUpstreamHeaders(
  req: IncomingMessage,
  config: ProxyConfig,
): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    const lower = key.toLowerCase();
    if (HOP_BY_HOP.has(lower)) continue;
    if (lower === "authorization") continue;
    if (Array.isArray(value)) {
      for (const v of value) headers.append(key, v);
    } else {
      headers.set(key, value);
    }
  }
  const auth = pickAuthHeader(req, config);
  if (auth) headers.set("authorization", auth);
  // Avoid compressed body surprises when piping
  headers.delete("accept-encoding");
  return headers;
}

export async function proxyRequest(
  req: IncomingMessage,
  res: ServerResponse,
  config: ProxyConfig,
  pathWithQuery: string,
): Promise<void> {
  const auth = pickAuthHeader(req, config);
  if (!auth) {
    res.writeHead(401, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        error: {
          message:
            "No API key. Set OPENAI_API_KEY / GEKIYASU_UPSTREAM_API_KEY, or send Authorization: Bearer <key>.",
          type: "invalid_request_error",
          code: "missing_api_key",
        },
      }),
    );
    return;
  }

  const url = `${config.upstreamBaseUrl}${pathWithQuery.startsWith("/") ? "" : "/"}${pathWithQuery}`;
  const method = req.method ?? "GET";

  let body: Buffer | undefined;
  if (method !== "GET" && method !== "HEAD") {
    body = await readBody(req);
  }

  const headers = buildUpstreamHeaders(req, config);
  // Re-apply auth after header copy
  headers.set("authorization", auth);
  if (body && body.length > 0 && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  let upstream: Response;
  try {
    upstream = await fetch(url, {
      method,
      headers,
      body: body && body.length > 0 ? new Uint8Array(body) : undefined,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.writeHead(502, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        error: {
          message: `Upstream fetch failed: ${message}`,
          type: "proxy_error",
          code: "upstream_unreachable",
        },
      }),
    );
    return;
  }

  const outHeaders: Record<string, string> = {};
  upstream.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (HOP_BY_HOP.has(lower)) return;
    outHeaders[key] = value;
  });

  res.writeHead(upstream.status, outHeaders);

  if (!upstream.body) {
    res.end();
    return;
  }

  const reader = upstream.body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        res.write(Buffer.from(value));
      }
    }
    res.end();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!res.headersSent) {
      res.writeHead(502, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { message, type: "proxy_error" } }));
    } else {
      res.destroy(err instanceof Error ? err : undefined);
    }
  }
}

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}
