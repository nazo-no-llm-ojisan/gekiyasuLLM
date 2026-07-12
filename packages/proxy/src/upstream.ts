/**
 * OpenAI-compatible UpstreamAdapter (MVP).
 * Will move under upstream/openai-compatible.ts; keep vendor-neutral
 * InternalChatRequest types in @gekiyasu/schema — do not treat OpenAI as the only shape.
 */
import type { IncomingMessage } from "node:http";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ProxyConfig } from "./config.js";
import { assertSafeUpstreamUrl } from "./security.js";
import { joinUpstreamUrl } from "./url-join.js";

const MAX_REDIRECTS = 5;

/** Origin (scheme+host+port) of a URL string, or the raw string on parse error. */
function getOrigin(urlStr: string): string {
  try {
    return new URL(urlStr).origin;
  } catch {
    return urlStr;
  }
}

/** Dropped on cross-origin redirects (credentials / session material). */
const SENSITIVE_REQUEST_HEADERS = [
  "authorization",
  "cookie",
  "x-api-key",
  "x-gekiyasu-token",
  "proxy-authorization",
];

/**
 * Client request headers allowed on upstream calls (allowlist).
 * Secrets (authorization, cookie, x-api-key, proxy token, proxy-authorization)
 * are never copied from the client — callers set Authorization explicitly.
 *
 * Tenant / correlation headers below are NOT API keys (P0 credential isolation
 * is already origin-scoped for Authorization). Residual risk: they can identify
 * a tenant or request and today are forwarded to any offering origin.
 *
 * Future (same bundle as endpoint/origin credential mapping — not urgent P0):
 *   - forward openai-organization / openai-project / idempotency-key only when
 *     target origin === configured upstreamBaseUrl origin
 *   - never send them to feed-driven foreign origins
 * idempotency-key is optional while POST auto-fallback remains disabled.
 */
const UPSTREAM_REQUEST_HEADER_ALLOWLIST = new Set([
  "content-type",
  "accept",
  "accept-language",
  "user-agent",
  "openai-organization",
  "openai-project",
  "idempotency-key",
]);

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
  // undici fetch auto-decompresses; never advertise encoding of the raw wire body
  "content-encoding",
]);

/**
 * Build upstream request headers from the client request using an allowlist.
 * Does not set Authorization — callers must set the resolved credential explicitly
 * (see `executor.resolveAuthForAttempt` for the route-plan path; the old
 * single-upstream `proxyRequest` is gone — server.ts now goes through
 * `executeRoutePlan` even when the plan has a single primary).
 *
 * Tenant / correlation headers (openai-organization / openai-project /
 * idempotency-key) are NOT API keys, but can identify a tenant or request.
 * They are forwarded only when the resolved target origin equals the configured
 * upstream origin (T-031) so they are never leaked to foreign offering origins.
 */
const TENANT_HEADERS = new Set([
  "openai-organization",
  "openai-project",
  "idempotency-key",
]);

export type BuildUpstreamHeadersOpts = {
  /** Resolved target base URL; tenant headers forwarded only when its origin matches configured upstream origin. */
  targetBaseUrl?: string;
};

export function buildUpstreamHeaders(
  req: IncomingMessage,
  config?: ProxyConfig,
  opts: BuildUpstreamHeadersOpts = {},
): Headers {
  const forwardTenant =
    opts.targetBaseUrl !== undefined &&
    config !== undefined &&
    getOrigin(config.upstreamBaseUrl) === getOrigin(opts.targetBaseUrl);

  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    const lower = key.toLowerCase();
    if (HOP_BY_HOP.has(lower)) continue;
    if (!UPSTREAM_REQUEST_HEADER_ALLOWLIST.has(lower)) continue;
    if (TENANT_HEADERS.has(lower) && !forwardTenant) continue;
    if (Array.isArray(value)) {
      for (const v of value) headers.append(key, v);
    } else {
      headers.set(key, value);
    }
  }
  // Never forward client compression prefs; Node fetch handles decoding.
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
    body?: BodyInit | null;
    signal: AbortSignal;
    allowedHosts: string[];
  },
): Promise<Response> {
  let url = initialUrl;
  let method = init.method;
  let headers = new Headers(init.headers);
  let body: BodyInit | null | undefined = init.body;
  const initialOrigin = new URL(initialUrl).origin;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    assertSafeUpstreamUrl(url, { allowedHosts: init.allowedHosts });

    const res = await fetch(url, {
      method,
      headers,
      body: body ?? undefined,
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

/**
 * Buffer request body once (for retry/fallback reuse later).
 * On overflow: pause and reject with body_too_large — do NOT destroy before
 * the caller can write HTTP 413.
 */
export function readBody(
  req: IncomingMessage,
  maxBytes: number,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    let settled = false;

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      fn();
    };

    const onData = (c: Buffer) => {
      total += c.length;
      if (total > maxBytes) {
        req.pause();
        req.removeListener("data", onData);
        // Drain remaining so socket can stay usable for error response
        req.resume();
        const err = new Error(
          `Request body exceeds max ${maxBytes} bytes`,
        ) as Error & { code: string };
        err.code = "body_too_large";
        finish(() => reject(err));
        return;
      }
      chunks.push(c);
    };

    const onEnd = () => finish(() => resolve(Buffer.concat(chunks)));
    const onError = (e: Error) => finish(() => reject(e));

    const cleanup = () => {
      req.removeListener("data", onData);
      req.removeListener("end", onEnd);
      req.removeListener("error", onError);
    };

    req.on("data", onData);
    req.on("end", onEnd);
    req.on("error", onError);
  });
}
