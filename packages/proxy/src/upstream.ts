/**
 * OpenAI-compatible UpstreamAdapter (MVP).
 * Will move under upstream/openai-compatible.ts; keep vendor-neutral
 * InternalChatRequest types in @gekiyasu/schema — do not treat OpenAI as the only shape.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import type { ProxyConfig } from "./config.js";
import { assertSafeUpstreamUrl, PLACEHOLDER_BEARERS } from "./security.js";
import { joinUpstreamUrl } from "./url-join.js";

const MAX_REDIRECTS = 5;
const SENSITIVE_REQUEST_HEADERS = [
  "authorization",
  "cookie",
  "x-api-key",
  "x-gekiyasu-token",
];

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

export function pickAuthHeader(
  req: IncomingMessage,
  config: ProxyConfig,
): string | undefined {
  const fromClient = req.headers.authorization;
  if (typeof fromClient === "string" && fromClient.length > 0) {
    // Do not treat proxy-token Authorization form as upstream key
    if (fromClient.startsWith("Bearer gekiyasu-proxy:")) {
      if (config.upstreamApiKey) {
        return `Bearer ${config.upstreamApiKey}`;
      }
      return undefined;
    }
    if (
      config.allowPlaceholderApiKeySwap &&
      config.upstreamApiKey &&
      PLACEHOLDER_BEARERS.has(fromClient)
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
    if (lower === "x-gekiyasu-token") continue;
    if (Array.isArray(value)) {
      for (const v of value) headers.append(key, v);
    } else {
      headers.set(key, value);
    }
  }
  const auth = pickAuthHeader(req, config);
  if (auth) headers.set("authorization", auth);
  headers.delete("accept-encoding");
  return headers;
}

/**
 * Resolve and validate the absolute upstream URL for this request.
 * Call this for every fetch — including future feed-driven base_url overrides.
 */
export function resolveUpstreamUrl(
  config: ProxyConfig,
  pathWithQuery: string,
  baseUrlOverride?: string,
): string {
  const base = (baseUrlOverride ?? config.upstreamBaseUrl).replace(/\/+$/, "");
  const absolute = joinUpstreamUrl(base, pathWithQuery);
  assertSafeUpstreamUrl(absolute, {
    allowedHosts: config.allowedUpstreamHosts,
  });
  return absolute;
}

function stripSensitiveHeaders(headers: Headers): void {
  for (const h of SENSITIVE_REQUEST_HEADERS) {
    headers.delete(h);
  }
}

/**
 * fetch with redirect: manual, re-validate each Location against allowlist.
 * Blocks open redirect / SSRF via 30x to private or non-allowlisted hosts.
 */
export async function fetchUpstream(
  initialUrl: string,
  init: {
    method: string;
    headers: Headers;
    body?: Uint8Array;
    signal: AbortSignal;
    allowedHosts: string[];
  },
): Promise<Response> {
  let url = initialUrl;
  let method = init.method;
  let headers = new Headers(init.headers);
  let body: Uint8Array | undefined = init.body;
  const initialOrigin = new URL(initialUrl).origin;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    assertSafeUpstreamUrl(url, { allowedHosts: init.allowedHosts });

    const res = await fetch(url, {
      method,
      headers,
      body:
        body && body.length > 0
          ? Buffer.from(body.buffer, body.byteOffset, body.byteLength)
          : undefined,
      signal: init.signal,
      redirect: "manual",
    });

    if (res.status < 300 || res.status >= 400) {
      return res;
    }

    const location = res.headers.get("location");
    if (!location) {
      return res;
    }

    const next = new URL(location, url).href;
    const nextUrl = new URL(next);

    // No HTTPS → HTTP downgrade
    if (url.startsWith("https:") && nextUrl.protocol === "http:") {
      throw new Error(`Refusing HTTPS to HTTP redirect: ${next}`);
    }

    assertSafeUpstreamUrl(next, { allowedHosts: init.allowedHosts });

    // Cross-origin: drop credentials / sensitive headers
    if (nextUrl.origin !== initialOrigin) {
      headers = new Headers(headers);
      stripSensitiveHeaders(headers);
    }

    // 303: switch to GET without body. 301/302 historically browsers use GET for POST.
    if (
      res.status === 303 ||
      ((res.status === 301 || res.status === 302) && method !== "GET" && method !== "HEAD")
    ) {
      method = "GET";
      body = undefined;
      headers.delete("content-length");
      headers.delete("content-type");
    }

    url = next;
    if (hop === MAX_REDIRECTS) {
      throw new Error(`Too many redirects (>${MAX_REDIRECTS})`);
    }
  }

  throw new Error("Redirect loop guard failed");
}

export async function proxyRequest(
  req: IncomingMessage,
  res: ServerResponse,
  config: ProxyConfig,
  pathWithQuery: string,
  baseUrlOverride?: string,
): Promise<void> {
  const auth = pickAuthHeader(req, config);
  if (!auth) {
    res.writeHead(401, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        error: {
          message:
            "No upstream API key. Set OPENAI_API_KEY / GEKIYASU_UPSTREAM_API_KEY, or send Authorization: Bearer <key>.",
          type: "invalid_request_error",
          code: "missing_api_key",
        },
      }),
    );
    return;
  }

  let url: string;
  try {
    url = resolveUpstreamUrl(config, pathWithQuery, baseUrlOverride);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.writeHead(403, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        error: {
          message,
          type: "proxy_error",
          code: "upstream_not_allowed",
        },
      }),
    );
    return;
  }

  const method = req.method ?? "GET";

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
      res.writeHead(code === "body_too_large" ? 413 : 400, {
        "content-type": "application/json",
      });
      res.end(
        JSON.stringify({
          error: { message, type: "invalid_request_error", code },
        }),
      );
      return;
    }
  }

  const headers = buildUpstreamHeaders(req, config);
  headers.set("authorization", auth);
  if (body && body.length > 0 && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), config.upstreamTimeoutMs);

  let upstream: Response;
  try {
    upstream = await fetchUpstream(url, {
      method,
      headers,
      body: body && body.length > 0 ? new Uint8Array(body) : undefined,
      signal: ac.signal,
      allowedHosts: config.allowedUpstreamHosts,
    });
  } catch (err) {
    clearTimeout(timer);
    const aborted =
      err instanceof Error &&
      (err.name === "AbortError" || err.message.includes("abort"));
    const message = err instanceof Error ? err.message : String(err);
    const forbidden =
      err instanceof Error &&
      (message.includes("not in the allowlist") ||
        message.includes("private") ||
        message.includes("Refusing HTTPS"));
    res.writeHead(aborted ? 504 : forbidden ? 403 : 502, {
      "content-type": "application/json",
    });
    res.end(
      JSON.stringify({
        error: {
          message: aborted
            ? `Upstream timeout after ${config.upstreamTimeoutMs}ms`
            : `Upstream fetch failed: ${message}`,
          type: "proxy_error",
          code: aborted
            ? "upstream_timeout"
            : forbidden
              ? "upstream_not_allowed"
              : "upstream_unreachable",
        },
      }),
    );
    return;
  }
  clearTimeout(timer);

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

export function readBody(
  req: IncomingMessage,
  maxBytes: number,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    req.on("data", (c: Buffer) => {
      total += c.length;
      if (total > maxBytes) {
        req.destroy();
        const err = new Error(
          `Request body exceeds max ${maxBytes} bytes`,
        ) as Error & { code: string };
        err.code = "body_too_large";
        reject(err);
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}
