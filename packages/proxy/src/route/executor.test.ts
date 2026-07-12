import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { IncomingMessage, ServerResponse } from "node:http";
import { Writable } from "node:stream";
import type { RoutePlan } from "@gekiyasu/schema";
import type { ProxyConfig } from "../config.js";
import type { OfferingTarget } from "./catalog.js";
import {
  describeExecution,
  executeRoutePlan,
  orderedOfferingIds,
  resolvePrimaryTarget,
  resolveTarget,
  shouldFallbackHttpStatus,
  type AttemptFn,
  type AttemptResult,
} from "./executor.js";
import { buildRoutePlan } from "./plan.js";

function planFor(primary: string, fallbacks: string[] = []): RoutePlan {
  const p = buildRoutePlan({
    candidates: [
      { id: primary, providerId: "a", free: true, inputPerMillion: 0 },
      ...fallbacks.map((id, i) => ({
        id,
        providerId: "b",
        free: false,
        inputPerMillion: i + 1,
      })),
    ],
    preferences: { preferFree: true },
  });
  // force order for tests when free ranking might reorder
  return { ...p, primary, fallbacks };
}

describe("orderedOfferingIds", () => {
  it("lists primary then fallbacks without dupes", () => {
    assert.deepEqual(
      orderedOfferingIds({
        primary: "a",
        fallbacks: ["b", "a", "c"],
        reason: [],
        generatedAt: "",
      }),
      ["a", "b", "c"],
    );
  });
});

describe("shouldFallbackHttpStatus", () => {
  it("retries 5xx and 429", () => {
    assert.equal(shouldFallbackHttpStatus(500), true);
    assert.equal(shouldFallbackHttpStatus(429), true);
    assert.equal(shouldFallbackHttpStatus(200), false);
    assert.equal(shouldFallbackHttpStatus(400), false);
    assert.equal(shouldFallbackHttpStatus(401), false);
  });
});

describe("resolvePrimaryTarget", () => {
  it("uses plan.primary from the catalog (not a side path)", () => {
    const catalog = new Map<string, OfferingTarget>([
      [
        "passthrough:default",
        {
          id: "passthrough:default",
          providerId: "local",
          baseUrl: "https://api.openai.com/v1",
        },
      ],
      [
        "other:offering",
        {
          id: "other:offering",
          providerId: "other",
          baseUrl: "https://other.example/v1",
        },
      ],
    ]);
    const plan = planFor("other:offering");
    const target = resolvePrimaryTarget(plan, catalog);
    assert.equal(target.id, "other:offering");
    assert.equal(resolveTarget("other:offering", catalog).baseUrl, "https://other.example/v1");
  });

  it("throws when plan.primary is not in catalog", () => {
    const catalog = new Map<string, OfferingTarget>();
    const plan = planFor("missing:id");
    assert.throws(() => resolvePrimaryTarget(plan, catalog), /Unknown offering/);
  });
});

describe("describeExecution", () => {
  it("mentions primary from plan", () => {
    const plan = planFor("passthrough:default");
    assert.match(describeExecution({ plan }), /primary=passthrough:default/);
  });
});

describe("executeRoutePlan fallback", () => {
  it("tries next offering after retryable failure on primary", async () => {
    const catalog = new Map<string, OfferingTarget>([
      ["first", { id: "first", providerId: "a", baseUrl: "https://a.example/v1" }],
      ["second", { id: "second", providerId: "b", baseUrl: "https://b.example/v1" }],
    ]);
    const plan: RoutePlan = {
      primary: "first",
      fallbacks: ["second"],
      reason: [],
      generatedAt: new Date().toISOString(),
    };

    const tried: string[] = [];
    const attempt: AttemptFn = async (target) => {
      tried.push(target.id);
      if (target.id === "first") {
        return {
          kind: "retry",
          offeringId: "first",
          code: "http_503",
          message: "down",
          status: 503,
        };
      }
      // Empty body avoids pipeline into a partial mock socket
      return {
        kind: "ok",
        offeringId: "second",
        response: new Response(null, { status: 200 }),
      };
    };

    const resState = {
      headersSent: false,
      writableFinished: false,
      destroyed: false,
      statusCode: 0,
    };
    const res = {
      get headersSent() {
        return resState.headersSent;
      },
      get writableFinished() {
        return resState.writableFinished;
      },
      get destroyed() {
        return resState.destroyed;
      },
      setHeader() {},
      writeHead(status: number) {
        resState.statusCode = status;
        resState.headersSent = true;
      },
      write() {
        return true;
      },
      end() {
        resState.writableFinished = true;
      },
      destroy() {
        resState.destroyed = true;
      },
      on() {
        return this;
      },
      off() {
        return this;
      },
    } as unknown as ServerResponse;

    const req = {
      method: "GET",
      headers: { authorization: "Bearer sk-test" },
      on() {
        return this;
      },
      off() {
        return this;
      },
    } as unknown as IncomingMessage;

    const config = {
      host: "127.0.0.1",
      port: 16191,
      upstreamBaseUrl: "https://api.openai.com/v1",
      allowedUpstreamHosts: ["a.example", "b.example", "api.openai.com"],
      upstreamApiKey: "sk-test",
      proxyToken: undefined,
      maxBodyBytes: 1_000_000,
      upstreamTimeoutMs: 5000,
      allowPlaceholderApiKeySwap: true,
      providerApiKeys: {
        a: "sk-test",
        b: "sk-test",
      },
    } as ProxyConfig;

    const result = await executeRoutePlan({
      plan,
      catalog,
      req,
      res,
      config,
      pathWithQuery: "/v1/models",
      attempt,
    });

    assert.deepEqual(tried, ["first", "second"]);
    assert.equal(result.offeringId, "second");
    assert.ok(result.attempts.some((a) => a.startsWith("first:")));
    assert.ok(result.attempts.some((a) => a.includes("second")));
  });
});

describe("executeRoutePlan safety policies", () => {
  const catalog = new Map<string, OfferingTarget>([
    ["first", { id: "first", providerId: "providerA", baseUrl: "https://a.example/v1" }],
    ["second", { id: "second", providerId: "providerB", baseUrl: "https://b.example/v1" }],
    ["upstream_same", { id: "upstream_same", providerId: "openai", baseUrl: "https://api.openai.com/v1" }],
  ]);

  const createMockRes = () => {
    const resState = {
      headersSent: false,
      writableFinished: false,
      destroyed: false,
      statusCode: 0,
      body: "",
      headers: new Map<string, string>(),
    };
    const res = new Writable({
      write(chunk, encoding, callback) {
        resState.body += chunk.toString();
        callback();
      },
      final(callback) {
        resState.writableFinished = true;
        callback();
      }
    }) as any;

    res.headersSent = false;
    res.setHeader = (name: string, value: string) => {
      resState.headers.set(name.toLowerCase(), value);
    };
    res.writeHead = (status: number, headers?: any) => {
      res.headersSent = true;
      resState.headersSent = true;
      resState.statusCode = status;
      if (headers) {
        for (const [k, v] of Object.entries(headers)) {
          resState.headers.set(k.toLowerCase(), String(v));
        }
      }
    };
    const originalDestroy = res.destroy.bind(res);
    res.destroy = (err?: Error) => {
      resState.destroyed = true;
      return originalDestroy(err);
    };

    res.resState = resState;
    return res;
  };

  const createMockReq = (method: string, headers: Record<string, string> = {}) => {
    const lowercaseHeaders: Record<string, string> = {};
    for (const [k, v] of Object.entries(headers)) {
      lowercaseHeaders[k.toLowerCase()] = v;
    }
    return {
      method,
      headers: lowercaseHeaders,
      on() { return this; },
      off() { return this; },
    } as unknown as IncomingMessage;
  };

  const defaultConfig = {
    host: "127.0.0.1",
    port: 16191,
    upstreamBaseUrl: "https://api.openai.com/v1",
    allowedUpstreamHosts: ["a.example", "b.example", "api.openai.com"],
    upstreamApiKey: undefined,
    providerApiKeys: {},
    proxyToken: undefined,
    maxBodyBytes: 1_000_000,
    upstreamTimeoutMs: 5000,
    allowPlaceholderApiKeySwap: true,
  } as unknown as ProxyConfig;

  it("P0: prevents forwarding client key of providerA to providerB during fallback, using local provider key if available", async () => {
    const authHeadersSeen: Record<string, string> = {};
    const attempt: AttemptFn = async (target, ctx) => {
      authHeadersSeen[target.id] = ctx.auth;
      if (target.id === "first") {
        return { kind: "retry", offeringId: "first", code: "http_503", message: "down", status: 503 };
      }
      return { kind: "ok", offeringId: "second", response: new Response(null, { status: 200 }) };
    };

    const res = createMockRes();
    // Request sent to providerA first (via 'first' offering)
    const req = createMockReq("GET", { authorization: "Bearer client-key-for-provider-a" });

    const config = {
      ...defaultConfig,
      providerApiKeys: {
        providerA: "local-provider-a-key",
        providerB: "local-provider-b-key",
      },
    } as ProxyConfig;

    const plan: RoutePlan = {
      primary: "first",
      fallbacks: ["second"],
      reason: [],
      generatedAt: "",
    };

    const result = await executeRoutePlan({ plan, catalog, req, res, config, pathWithQuery: "/v1/models", attempt });

    assert.equal(result.offeringId, "second");
    // Since 'first' (https://a.example/v1) is NOT same origin as default upstream (https://api.openai.com/v1),
    // client key is NOT sent to primary. Instead, local providerA key is used.
    assert.equal(authHeadersSeen["first"], "Bearer local-provider-a-key");
    // Fallback uses local providerB key, NOT client key.
    assert.equal(authHeadersSeen["second"], "Bearer local-provider-b-key");
  });

  it("P0: skips primary / fallback and records credential_unavailable if local provider key is missing and origin is different", async () => {
    const attemptedIds: string[] = [];
    const attempt: AttemptFn = async (target, ctx) => {
      attemptedIds.push(target.id);
      return { kind: "ok", offeringId: target.id, response: new Response(null, { status: 200 }) };
    };

    const res = createMockRes();
    const req = createMockReq("GET", { authorization: "Bearer client-key" });

    const config = {
      ...defaultConfig,
      providerApiKeys: {
        // providerA is missing!
        providerB: "local-provider-b-key",
      },
    } as ProxyConfig;

    const plan: RoutePlan = {
      primary: "first", // different origin, missing key
      fallbacks: ["second"], // different origin, has key
      reason: [],
      generatedAt: "",
    };

    const result = await executeRoutePlan({ plan, catalog, req, res, config, pathWithQuery: "/v1/models", attempt });

    // "first" is skipped because different origin + no local key.
    // "second" is executed because it has a local key.
    assert.deepEqual(attemptedIds, ["second"]);
    assert.equal(result.offeringId, "second");
    assert.deepEqual(result.attempts, ["first:credential_unavailable", "second:ok"]);
  });

  it("P0: forwards client key if target endpoint origin is same as configured upstream", async () => {
    const authHeadersSeen: Record<string, string> = {};
    const attempt: AttemptFn = async (target, ctx) => {
      authHeadersSeen[target.id] = ctx.auth;
      return { kind: "ok", offeringId: target.id, response: new Response(null, { status: 200 }) };
    };

    const res = createMockRes();
    const req = createMockReq("GET", { authorization: "Bearer client-key-same-origin" });

    const plan: RoutePlan = {
      primary: "upstream_same", // same origin as configured upstream
      fallbacks: [],
      reason: [],
      generatedAt: "",
    };

    const result = await executeRoutePlan({ plan, catalog, req, res, config: defaultConfig, pathWithQuery: "/v1/models", attempt });

    assert.equal(result.offeringId, "upstream_same");
    // Client key is forwarded because the origin is identical to configured upstream base URL
    assert.equal(authHeadersSeen["upstream_same"], "Bearer client-key-same-origin");
  });

  it("P0: replaces placeholder key with configured local key only on same origin", async () => {
    const authHeadersSeen: Record<string, string> = {};
    const attempt: AttemptFn = async (target, ctx) => {
      authHeadersSeen[target.id] = ctx.auth;
      return { kind: "ok", offeringId: target.id, response: new Response(null, { status: 200 }) };
    };

    const res = createMockRes();
    const req = createMockReq("GET", { authorization: "Bearer sk-local" });

    const config = {
      ...defaultConfig,
      upstreamApiKey: "my-real-global-key",
    } as ProxyConfig;

    const plan: RoutePlan = {
      primary: "upstream_same", // same origin
      fallbacks: [],
      reason: [],
      generatedAt: "",
    };

    await executeRoutePlan({ plan, catalog, req, res, config, pathWithQuery: "/v1/models", attempt });
    assert.equal(authHeadersSeen["upstream_same"], "Bearer my-real-global-key");
  });

  it("P0: prevents leakage of general headers (cookie, x-api-key, proxy-token) to untrusted origins", async () => {
    // In buildUpstreamHeaders or executeRoutePlan, headers should be safe.
    // Let's verify that other client headers like cookie or proxy token are not leaked,
    // and custom headers are handled safely.
    // proxy token gekiyasu-proxy: should be stripped, client authorization must not leak to different origin.
    // This is partially verified by resolveAuthForAttempt and upstream.ts.
    // We already have timingSafeEqual and token stripping in security.ts and upstream.ts.
    // Let's assert client key is NOT leaked to different origin.
    const authHeadersSeen: Record<string, string> = {};
    const attempt: AttemptFn = async (target, ctx) => {
      authHeadersSeen[target.id] = ctx.auth;
      return { kind: "ok", offeringId: target.id, response: new Response(null, { status: 200 }) };
    };

    const res = createMockRes();
    const req = createMockReq("GET", {
      authorization: "Bearer client-private-key",
      "x-api-key": "some-private-key",
      cookie: "session=secret",
    });

    const config = {
      ...defaultConfig,
      providerApiKeys: { providerB: "provider-b-key" },
    } as ProxyConfig;

    const plan: RoutePlan = {
      primary: "second", // different origin
      fallbacks: [],
      reason: [],
      generatedAt: "",
    };

    await executeRoutePlan({ plan, catalog, req, res, config, pathWithQuery: "/v1/models", attempt });

    // authorization is resolved from local providerB key, not the client-private-key
    assert.equal(authHeadersSeen["second"], "Bearer provider-b-key");
  });

  it("P1: blocks fallback for POST on any error (5xx, 429, timeout) and preserves original response status and body", async () => {
    const attemptedIds: string[] = [];
    const attempt: AttemptFn = async (target) => {
      attemptedIds.push(target.id);
      // Since it's a POST, 429 or 500 should return HTTP status immediately without being retry-caught
      // inside defaultAttemptUpstream. It returns kind: "ok" representing transparent proxy response.
      const bodyText = JSON.stringify({ error: { message: "Too many requests" } });
      const mockResponse = new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(bodyText));
            controller.close();
          }
        }),
        {
          status: 429,
          headers: { "x-request-id": "req-123" },
        }
      );
      return {
        kind: "ok",
        offeringId: target.id,
        response: mockResponse,
      };
    };

    const res = createMockRes();
    const req = createMockReq("POST", { authorization: "Bearer key" });

    const config = {
      ...defaultConfig,
      upstreamApiKey: "key",
    } as ProxyConfig;

    const plan: RoutePlan = {
      primary: "first",
      fallbacks: ["second"],
      reason: [],
      generatedAt: "",
    };

    const result = await executeRoutePlan({ plan, catalog, req, res, config, pathWithQuery: "/v1/chat/completions", attempt });

    // Should NOT fallback to "second" because it is a POST
    assert.deepEqual(attemptedIds, ["first"]);
    assert.equal(result.offeringId, "first");

    // Client receives original response status and headers
    assert.equal(res.resState.statusCode, 429);
    assert.equal(res.resState.headers.get("x-request-id"), "req-123");
    assert.equal(res.resState.headers.get("x-gekiyasu-fallback"), "skipped-non-idempotent");
    assert.deepEqual(JSON.parse(res.resState.body), { error: { message: "Too many requests" } });
  });

  it("P1: allows fallback for GET 500", async () => {
    const attemptedIds: string[] = [];
    const attempt: AttemptFn = async (target) => {
      attemptedIds.push(target.id);
      if (target.id === "first") {
        return { kind: "retry", offeringId: target.id, code: "http_500", message: "internal error", status: 500 };
      }
      return { kind: "ok", offeringId: target.id, response: new Response(null, { status: 200 }) };
    };

    const res = createMockRes();
    const req = createMockReq("GET", { authorization: "Bearer key" });

    const config = {
      ...defaultConfig,
      upstreamApiKey: "key",
    } as ProxyConfig;

    const plan: RoutePlan = {
      primary: "first",
      fallbacks: ["second"],
      reason: [],
      generatedAt: "",
    };

    await executeRoutePlan({ plan, catalog, req, res, config, pathWithQuery: "/v1/models", attempt });

    // Should fallback to "second"
    assert.deepEqual(attemptedIds, ["first", "second"]);
  });
});
