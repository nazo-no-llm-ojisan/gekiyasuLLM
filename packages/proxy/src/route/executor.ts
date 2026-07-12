import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { RoutePlan } from "@gekiyasu/schema";
import type { ProxyConfig } from "../config.js";
import { normalizeModelsResponseJson } from "../models-response.js";
import {
  extractBearerValue,
  isProxyAuthorization,
  PLACEHOLDER_BEARERS,
  safeEqualString,
} from "../security.js";
import {
  buildUpstreamHeaders,
  fetchUpstream,
  readBody,
  resolveUpstreamUrl,
} from "../upstream.js";
import type { OfferingTarget } from "./catalog.js";

export type ExecutionContext = {
  plan: RoutePlan;
};

export function describeExecution(ctx: ExecutionContext): string {
  return `primary=${ctx.plan.primary}; fallbacks=${ctx.plan.fallbacks.join(",") || "-"}`;
}

/** primary then fallbacks (deduped). */
export function orderedOfferingIds(plan: RoutePlan): string[] {
  const ids = [plan.primary, ...plan.fallbacks];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export function resolveTarget(
  offeringId: string,
  catalog: Map<string, OfferingTarget>,
): OfferingTarget {
  const target = catalog.get(offeringId);
  if (!target) {
    throw new Error(`Unknown offering: ${offeringId}`);
  }
  return target;
}

/** @deprecated use resolveTarget(plan.primary, catalog) */
export function resolvePrimaryTarget(
  plan: RoutePlan,
  catalog: Map<string, OfferingTarget>,
): OfferingTarget {
  return resolveTarget(plan.primary, catalog);
}

export function getOrigin(urlStr: string): string {
  try {
    const url = new URL(urlStr);
    return url.origin;
  } catch {
    return urlStr;
  }
}

export function isProxyToken(auth: string): boolean {
  return isProxyAuthorization(auth);
}

export function isProxyBearer(auth: string, config: ProxyConfig): boolean {
  const bearer = extractBearerValue(auth);
  return Boolean(
    bearer && config.proxyToken && safeEqualString(bearer, config.proxyToken),
  );
}

export function isPlaceholderApiKey(auth: string): boolean {
  return PLACEHOLDER_BEARERS.has(auth);
}

/**
 * Resolve Authorization for one offering attempt.
 *
 * Client Authorization may be forwarded only when the target origin is the
 * exact origin of `config.upstreamBaseUrl`. Matching primary/fallback origins
 * alone is never enough — that would leak a client key to an unrelated host
 * that shares an origin with a skipped primary.
 *
 * Other origins: only proxy-owned `providerApiKeys[providerId]` (never the
 * client key, never global upstreamApiKey / placeholders).
 */
export function resolveAuthForAttempt(
  offering: OfferingTarget,
  clientAuth: string | undefined,
  config: ProxyConfig,
): string | undefined {
  const localProviderKey = config.providerApiKeys[offering.providerId];
  const targetOrigin = getOrigin(offering.baseUrl);
  const configuredUpstreamOrigin = getOrigin(config.upstreamBaseUrl);
  const sameConfiguredOrigin = targetOrigin === configuredUpstreamOrigin;

  if (sameConfiguredOrigin) {
    if (clientAuth && !isProxyToken(clientAuth) && !isProxyBearer(clientAuth, config)) {
      if (
        config.allowPlaceholderApiKeySwap &&
        isPlaceholderApiKey(clientAuth)
      ) {
        const resolvedKey = localProviderKey || config.upstreamApiKey;
        return resolvedKey ? `Bearer ${resolvedKey}` : undefined;
      }
      return clientAuth;
    }
    const resolvedKey = localProviderKey || config.upstreamApiKey;
    return resolvedKey ? `Bearer ${resolvedKey}` : undefined;
  }

  // Different origin than configured upstream: never use client credentials.
  if (localProviderKey) {
    return `Bearer ${localProviderKey}`;
  }
  return undefined;
}

/**
 * Whether a failed attempt may try the next offering.
 * Non-idempotent methods (POST/PATCH/PUT/DELETE/…) never fallback —
 * avoids double execution / double billing.
 */
export function shouldFallbackForAttempt(
  method: string,
  result: AttemptResult,
): boolean {
  if (method !== "GET" && method !== "HEAD") {
    return false;
  }

  if (result.kind !== "retry") {
    return false;
  }

  if (
    result.code === "upstream_unreachable" ||
    result.code === "upstream_not_allowed" ||
    result.code === "unknown_offering" ||
    result.code === "credential_unavailable" ||
    result.code === "upstream_timeout"
  ) {
    return true;
  }

  const status = result.status;
  if (!status) return true;

  if (status === 408 || status === 429) {
    return true;
  }

  if (status >= 500 && status <= 599) {
    return true;
  }

  return false;
}

/** Whether this HTTP status should try the next fallback. */
export function shouldFallbackHttpStatus(status: number): boolean {
  return status === 408 || status === 429 || (status >= 500 && status <= 599);
}

export type AttemptOk = {
  kind: "ok";
  offeringId: string;
  response: Response;
};

export type AttemptRetry = {
  kind: "retry";
  offeringId: string;
  code: string;
  message: string;
  status?: number;
};

export type AttemptFatal = {
  kind: "fatal";
  offeringId?: string;
  code: string;
  message: string;
  status: number;
};

export type AttemptResult = AttemptOk | AttemptRetry | AttemptFatal;

export type AttemptContext = {
  req: IncomingMessage;
  config: ProxyConfig;
  pathWithQuery: string;
  auth: string;
  method: string;
  body: Buffer | undefined;
  signal: AbortSignal;
};

export type AttemptFn = (
  target: OfferingTarget,
  ctx: AttemptContext,
) => Promise<AttemptResult>;

export async function defaultAttemptUpstream(
  target: OfferingTarget,
  ctx: AttemptContext,
): Promise<AttemptResult> {
  let url: string;
  try {
    url = resolveUpstreamUrl(ctx.config, ctx.pathWithQuery, target.baseUrl);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      kind: "retry",
      offeringId: target.id,
      code: "upstream_not_allowed",
      message,
    };
  }

  const headers = buildUpstreamHeaders(ctx.req, ctx.config);
  headers.set("authorization", ctx.auth);
  if (ctx.body && ctx.body.length > 0 && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  try {
    const response = await fetchUpstream(url, {
      method: ctx.method,
      headers,
      body: ctx.body && ctx.body.length > 0 ? Uint8Array.from(ctx.body) : undefined,
      signal: ctx.signal,
      allowedHosts: ctx.config.allowedUpstreamHosts,
    });

    const isIdempotent = ctx.method === "GET" || ctx.method === "HEAD";
    if (isIdempotent && shouldFallbackHttpStatus(response.status)) {
      // Consume body so connection can close before next attempt
      try {
        await response.arrayBuffer();
      } catch {
        /* ignore */
      }
      return {
        kind: "retry",
        offeringId: target.id,
        code: `http_${response.status}`,
        message: `Upstream returned ${response.status}`,
        status: response.status,
      };
    }

    return { kind: "ok", offeringId: target.id, response };
  } catch (err) {
    const aborted =
      err instanceof Error &&
      (err.name === "AbortError" || err.message.includes("abort"));
    if (aborted && ctx.signal.aborted) {
      return {
        kind: "fatal",
        offeringId: target.id,
        code: "client_aborted",
        message: "Client disconnected",
        status: 499,
      };
    }
    const message = err instanceof Error ? err.message : String(err);
    const forbidden =
      message.includes("not in the allowlist") ||
      message.includes("private") ||
      message.includes("Refusing HTTPS");
    return {
      kind: "retry",
      offeringId: target.id,
      code: aborted
        ? "upstream_timeout"
        : forbidden
          ? "upstream_not_allowed"
          : "upstream_unreachable",
      message: aborted
        ? `Upstream timeout after ${ctx.config.upstreamTimeoutMs}ms`
        : message,
    };
  }
}

export type ExecutePlanInput = {
  plan: RoutePlan;
  catalog: Map<string, OfferingTarget>;
  req: IncomingMessage;
  res: ServerResponse;
  config: ProxyConfig;
  pathWithQuery: string;
  attempt?: AttemptFn;
};

/**
 * Try plan.primary then each fallback until success or non-retryable failure.
 * Request body is buffered once and reused.
 */
export async function executeRoutePlan(
  input: ExecutePlanInput,
): Promise<{ offeringId: string; attempts: string[] }> {
  const attempt = input.attempt ?? defaultAttemptUpstream;
  const { req, res, config, pathWithQuery, plan, catalog } = input;

  const rawClientAuth = req.headers.authorization;
  const hasAnyKey =
    (rawClientAuth && rawClientAuth.length > 0) ||
    config.upstreamApiKey ||
    Object.keys(config.providerApiKeys).length > 0;

  if (!hasAnyKey) {
    writeJson(res, 401, {
      error: {
        message:
          "No upstream API key available. Set GEKIYASU_UPSTREAM_API_KEY, provider keys, or send Authorization header.",
        type: "invalid_request_error",
        code: "missing_api_key",
      },
    });
    return { offeringId: plan.primary, attempts: [] };
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
      writeJson(res, code === "body_too_large" ? 413 : 400, {
        error: { message, type: "invalid_request_error", code },
      });
      return { offeringId: plan.primary, attempts: [] };
    }
  }

  const ids = orderedOfferingIds(plan);
  const attemptLog: string[] = [];
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), config.upstreamTimeoutMs);
  const onClientGone = () => {
    if (!res.writableFinished) ac.abort();
  };
  req.on("aborted", onClientGone);
  res.on("close", onClientGone);

  try {
    let lastRetry: AttemptRetry | undefined;

    for (let i = 0; i < ids.length; i++) {
      const id = ids[i]!;
      let target: OfferingTarget;
      try {
        target = resolveTarget(id, catalog);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        attemptLog.push(`${id}:unknown`);
        lastRetry = {
          kind: "retry",
          offeringId: id,
          code: "unknown_offering",
          message,
        };
        continue;
      }

      const auth = resolveAuthForAttempt(target, rawClientAuth, config);
      const hasMore = i < ids.length - 1;

      if (!auth) {
        // Pre-send skip: no upstream call was made, so walking to the next
        // offering is not double-execution (applies to POST as well).
        attemptLog.push(`${id}:credential_unavailable`);
        lastRetry = {
          kind: "retry",
          offeringId: id,
          code: "credential_unavailable",
          message: `No API key available for provider ${target.providerId}`,
        };

        if (!hasMore) {
          if (!res.headersSent) {
            writeJson(res, 401, {
              error: {
                message: lastRetry.message,
                type: "proxy_error",
                code: lastRetry.code,
                attempts: attemptLog,
              },
            });
          }
          return { offeringId: lastRetry.offeringId, attempts: attemptLog };
        }
        continue;
      }

      const ctx: AttemptContext = {
        req,
        config,
        pathWithQuery,
        auth,
        method,
        body,
        signal: ac.signal,
      };

      const result = await attempt(target, ctx);
      attemptLog.push(`${id}:${result.kind === "ok" ? "ok" : result.code}`);

      if (result.kind === "ok") {
        res.setHeader("x-gekiyasu-offering", result.offeringId);
        res.setHeader("x-gekiyasu-attempts", attemptLog.join(","));

        // Non-idempotent error response: surface that we did not walk fallbacks
        if (
          method !== "GET" &&
          method !== "HEAD" &&
          result.response.status >= 400
        ) {
          res.setHeader("x-gekiyasu-fallback", "skipped-non-idempotent");
        }

        if (isModelsListRequest(pathWithQuery)) {
          await pipeModelsResponse(result.response, res);
        } else {
          await pipeResponse(result.response, res, ac);
        }
        return { offeringId: result.offeringId, attempts: attemptLog };
      }

      if (result.kind === "fatal") {
        if (!res.headersSent) {
          writeJson(res, result.status >= 100 ? result.status : 502, {
            error: {
              message: result.message,
              type: "proxy_error",
              code: result.code,
              attempts: attemptLog,
            },
          });
        }
        return { offeringId: result.offeringId ?? id, attempts: attemptLog };
      }

      // retry
      lastRetry = result;

      const canFallback = shouldFallbackForAttempt(method, result);
      if (!canFallback || !hasMore) {
        if (!res.headersSent) {
          const responseStatus =
            lastRetry.status && lastRetry.status >= 400 ? lastRetry.status : 502;
          writeJson(res, responseStatus, {
            error: {
              message: lastRetry.message,
              type: "proxy_error",
              code: lastRetry.code,
              attempts: attemptLog,
            },
          });
        }
        return { offeringId: lastRetry.offeringId, attempts: attemptLog };
      }
      // else continue to next fallback
    }

    if (!res.headersSent) {
      writeJson(res, 502, {
        error: {
          message: lastRetry?.message ?? "No offerings attempted",
          type: "proxy_error",
          code: lastRetry?.code ?? "no_attempt",
          attempts: attemptLog,
        },
      });
    }
    return { offeringId: plan.primary, attempts: attemptLog };
  } finally {
    clearTimeout(timer);
    req.off("aborted", onClientGone);
    res.off("close", onClientGone);
  }
}

function isModelsListRequest(pathWithQuery: string): boolean {
  const path = pathWithQuery.split("?")[0] ?? pathWithQuery;
  return path === "/v1/models";
}

async function pipeModelsResponse(
  upstream: Response,
  res: ServerResponse,
): Promise<void> {
  const headers = copyResponseHeaders(upstream);
  const contentType = upstream.headers.get("content-type") ?? "";
  if (
    upstream.status !== 200 ||
    !contentType.toLowerCase().includes("application/json")
  ) {
    res.writeHead(upstream.status, headers);
    res.end(await upstream.text());
    return;
  }

  let body: unknown;
  try {
    body = JSON.parse(await upstream.text());
  } catch {
    res.writeHead(upstream.status, headers);
    res.end("");
    return;
  }

  delete headers["content-length"];
  headers["content-type"] = "application/json";
  res.writeHead(upstream.status, headers);
  res.end(JSON.stringify(normalizeModelsResponseJson(body)));
}

async function pipeResponse(
  upstream: Response,
  res: ServerResponse,
  ac: AbortController,
): Promise<void> {
  const outHeaders = copyResponseHeaders(upstream);
  res.writeHead(upstream.status, outHeaders);

  if (!upstream.body) {
    res.end();
    return;
  }

  try {
    const nodeIn = Readable.fromWeb(
      upstream.body as import("node:stream/web").ReadableStream,
    );
    await pipeline(nodeIn, res, { signal: ac.signal });
  } catch (err) {
    if (!res.headersSent) {
      const message = err instanceof Error ? err.message : String(err);
      writeJson(res, 502, {
        error: { message, type: "proxy_error", code: "stream_error" },
      });
    } else if (!res.destroyed) {
      res.destroy(err instanceof Error ? err : undefined);
    }
  }
}

function copyResponseHeaders(upstream: Response): Record<string, string> {
  const outHeaders: Record<string, string> = {};
  upstream.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (
      lower === "connection" ||
      lower === "keep-alive" ||
      lower === "transfer-encoding" ||
      lower === "content-length" ||
      // Node fetch/undici already decodes compressed bodies; keep Content-Encoding
      // and clients (e.g. aiohttp without brotli) try to decompress plain JSON.
      lower === "content-encoding"
    ) {
      return;
    }
    outHeaders[key] = value;
  });
  return outHeaders;
}

function writeJson(
  res: ServerResponse,
  status: number,
  body: unknown,
): void {
  if (res.headersSent) return;
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}
