import assert from "node:assert/strict";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createServer } from "node:http";
import { Readable } from "node:stream";
import { Writable } from "node:stream";
import { describe, it } from "node:test";
import type { RoutePlan } from "@gekiyasu/schema";
import type { ProxyConfig } from "../config.js";
import type { OfferingTarget } from "./catalog.js";
import {
  describeExecution,
  executeRoutePlan,
  orderedOfferingIds,
  resolveAuthForAttempt,
  resolvePrimaryTarget,
  resolveTarget,
  shouldFallbackForAttempt,
  shouldFallbackHttpStatus,
  type AttemptFn,
  type AttemptResult,
} from "./executor.js";
import { createCircuitBreaker } from "./circuit.js";
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
  return { ...p, primary, fallbacks };
}

function baseConfig(overrides: Partial<ProxyConfig> = {}): ProxyConfig {
  return {
    host: "127.0.0.1",
    port: 16191,
    upstreamBaseUrl: "https://api.openai.com/v1",
    allowedUpstreamHosts: ["a.example", "b.example", "api.openai.com"],
    upstreamApiKey: undefined,
    proxyToken: undefined,
    maxBodyBytes: 1_000_000,
    upstreamTimeoutMs: 5000,
    allowPlaceholderApiKeySwap: true,
    providerApiKeys: {},
    statsFile: undefined,
    circuitFailureThreshold: 3,
    circuitOpenSeconds: 300,
    ...overrides,
  };
}

/** Finished request stream so readBody() can complete for POST/etc. */
function createMockReq(
  method: string,
  headers: Record<string, string> = {},
  body: string | Buffer | null = null,
): IncomingMessage {
  const chunks: Buffer[] =
    body === null || body === undefined
      ? []
      : [typeof body === "string" ? Buffer.from(body) : body];
  const req = Readable.from(chunks) as IncomingMessage;
  req.method = method;
  const lower: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    lower[k.toLowerCase()] = v;
  }
  req.headers = lower;
  return req;
}

type MockResState = {
  headersSent: boolean;
  writableFinished: boolean;
  destroyed: boolean;
  statusCode: number;
  body: string;
  headers: Map<string, string>;
};

type MockRes = ServerResponse & { resState: MockResState };

function createMockRes(): MockRes {
  const resState: MockResState = {
    headersSent: false,
    writableFinished: false,
    destroyed: false,
    statusCode: 0,
    body: "",
    headers: new Map<string, string>(),
  };
  const res = new Writable({
    write(chunk, _encoding, callback) {
      resState.body += chunk.toString();
      callback();
    },
    final(callback) {
      resState.writableFinished = true;
      callback();
    },
  }) as MockRes;

  Object.defineProperty(res, "headersSent", {
    get: () => resState.headersSent,
    configurable: true,
  });
  Object.defineProperty(res, "writableFinished", {
    get: () => resState.writableFinished,
    configurable: true,
  });
  Object.defineProperty(res, "destroyed", {
    get: () => resState.destroyed,
    set: (v: boolean) => {
      resState.destroyed = v;
    },
    configurable: true,
  });

  (res as Writable & ServerResponse).setHeader = (
    name: string,
    value: number | string | readonly string[],
  ) => {
    resState.headers.set(String(name).toLowerCase(), String(value));
    return res;
  };
  (res as Writable & ServerResponse).writeHead = ((
    status: number,
    headers?: Record<string, string | number | readonly string[]>,
  ) => {
    resState.headersSent = true;
    resState.statusCode = status;
    if (headers) {
      for (const [k, v] of Object.entries(headers)) {
        resState.headers.set(k.toLowerCase(), String(v));
      }
    }
    return res;
  }) as ServerResponse["writeHead"];
  const originalDestroy = res.destroy.bind(res);
  (res as Writable & ServerResponse).destroy = ((err?: Error) => {
    resState.destroyed = true;
    return originalDestroy(err);
  }) as ServerResponse["destroy"];

  res.resState = resState;
  return res;
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

describe("shouldFallbackForAttempt", () => {
  const retry = (
    code: string,
    status?: number,
  ): AttemptResult => ({
    kind: "retry",
    offeringId: "x",
    code,
    message: "m",
    status,
  });

  it("allows GET fallback on 5xx, 429, timeout, network", () => {
    assert.equal(shouldFallbackForAttempt("GET", retry("http_500", 500)), true);
    assert.equal(shouldFallbackForAttempt("GET", retry("http_429", 429)), true);
    assert.equal(
      shouldFallbackForAttempt("GET", retry("upstream_timeout")),
      true,
    );
    assert.equal(
      shouldFallbackForAttempt("GET", retry("upstream_unreachable")),
      true,
    );
  });

  it("blocks POST/PATCH/PUT/DELETE fallback on any retryable failure", () => {
    for (const method of ["POST", "PATCH", "PUT", "DELETE"]) {
      assert.equal(
        shouldFallbackForAttempt(method, retry("http_500", 500)),
        false,
        method,
      );
      assert.equal(
        shouldFallbackForAttempt(method, retry("http_429", 429)),
        false,
        method,
      );
      assert.equal(
        shouldFallbackForAttempt(method, retry("upstream_timeout")),
        false,
        method,
      );
      assert.equal(
        shouldFallbackForAttempt(method, retry("upstream_unreachable")),
        false,
        method,
      );
    }
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
    assert.equal(
      resolveTarget("other:offering", catalog).baseUrl,
      "https://other.example/v1",
    );
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

describe("resolveAuthForAttempt", () => {
  const configured: OfferingTarget = {
    id: "upstream_same",
    providerId: "openai",
    baseUrl: "https://api.openai.com/v1",
  };
  const otherA: OfferingTarget = {
    id: "first",
    providerId: "providerA",
    baseUrl: "https://a.example/v1",
  };
  const otherB: OfferingTarget = {
    id: "second",
    providerId: "providerB",
    baseUrl: "https://b.example/v1",
  };
  const sameAlienOrigin: OfferingTarget = {
    id: "also-a",
    providerId: "providerA2",
    baseUrl: "https://a.example/v1/other",
  };

  it("forwards client Authorization only for configured upstream origin", () => {
    const config = baseConfig();
    assert.equal(
      resolveAuthForAttempt(configured, "Bearer client-key", config),
      "Bearer client-key",
    );
    assert.equal(
      resolveAuthForAttempt(otherA, "Bearer client-key", config),
      undefined,
    );
  });

  it("uses provider local key on foreign origin; never client key", () => {
    const config = baseConfig({
      providerApiKeys: { providerA: "local-a", providerB: "local-b" },
    });
    assert.equal(
      resolveAuthForAttempt(otherA, "Bearer client-key", config),
      "Bearer local-a",
    );
    assert.equal(
      resolveAuthForAttempt(otherB, "Bearer client-key", config),
      "Bearer local-b",
    );
  });

  it("does not reuse client key when primary and fallback share a non-configured origin", () => {
    // Regression: previous bypass treated primaryOrigin match as safe.
    const config = baseConfig({
      providerApiKeys: { providerA2: "local-a2" },
    });
    assert.equal(
      resolveAuthForAttempt(otherA, "Bearer openai-looking-key", config),
      undefined,
    );
    assert.equal(
      resolveAuthForAttempt(sameAlienOrigin, "Bearer openai-looking-key", config),
      "Bearer local-a2",
    );
  });

  it("swaps placeholder only on configured upstream origin", () => {
    const config = baseConfig({
      upstreamApiKey: "real-global",
      providerApiKeys: { providerA: "local-a" },
    });
    assert.equal(
      resolveAuthForAttempt(configured, "Bearer sk-local", config),
      "Bearer real-global",
    );
    // Foreign origin: no placeholder/global key
    assert.equal(
      resolveAuthForAttempt(otherA, "Bearer sk-local", config),
      "Bearer local-a",
    );
    assert.equal(
      resolveAuthForAttempt(
        { ...otherB, providerId: "missing" },
        "Bearer sk-local",
        config,
      ),
      undefined,
    );
  });

  it("never sends global upstreamApiKey to foreign origin without provider key", () => {
    const config = baseConfig({ upstreamApiKey: "real-global" });
    assert.equal(
      resolveAuthForAttempt(otherA, undefined, config),
      undefined,
    );
    assert.equal(
      resolveAuthForAttempt(configured, undefined, config),
      "Bearer real-global",
    );
  });

  it("uses upstreamApiKey when Authorization carries only the proxy token", () => {
    const config = baseConfig({ upstreamApiKey: "real-global" });
    assert.equal(
      resolveAuthForAttempt(configured, "Bearer gekiyasu-proxy:proxy-token", config),
      "Bearer real-global",
    );
    assert.equal(
      resolveAuthForAttempt(
        configured,
        "Bearer Bearer gekiyasu-proxy:proxy-token",
        config,
      ),
      "Bearer real-global",
    );
  });

  it("uses upstreamApiKey when standard Bearer carries the proxy token", () => {
    const config = baseConfig({
      proxyToken: "proxy-token",
      upstreamApiKey: "real-global",
    });
    assert.equal(
      resolveAuthForAttempt(configured, "Bearer proxy-token", config),
      "Bearer real-global",
    );
  });
});

describe("executeRoutePlan fallback", () => {
  it("tries next offering after retryable failure on primary (GET)", async () => {
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
      return {
        kind: "ok",
        offeringId: "second",
        response: new Response(null, { status: 200 }),
      };
    };

    const res = createMockRes();
    const req = createMockReq("GET", { authorization: "Bearer sk-test" });
    const config = baseConfig({
      upstreamApiKey: "sk-test",
      providerApiKeys: { a: "sk-test", b: "sk-test" },
    });

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

describe("executeRoutePlan P0 credential isolation", () => {
  const catalog = new Map<string, OfferingTarget>([
    [
      "first",
      { id: "first", providerId: "providerA", baseUrl: "https://a.example/v1" },
    ],
    [
      "second",
      { id: "second", providerId: "providerB", baseUrl: "https://b.example/v1" },
    ],
    [
      "upstream_same",
      {
        id: "upstream_same",
        providerId: "openai",
        baseUrl: "https://api.openai.com/v1",
      },
    ],
    [
      "also_a",
      {
        id: "also_a",
        providerId: "providerA2",
        baseUrl: "https://a.example/v1",
      },
    ],
  ]);

  it("1: same origin as configured upstream → forwards client Authorization", async () => {
    const authSeen: Record<string, string> = {};
    const attempt: AttemptFn = async (target, ctx) => {
      authSeen[target.id] = ctx.auth;
      return {
        kind: "ok",
        offeringId: target.id,
        response: new Response(null, { status: 200 }),
      };
    };
    const res = createMockRes();
    const req = createMockReq("GET", {
      authorization: "Bearer client-key-same-origin",
    });
    const plan: RoutePlan = {
      primary: "upstream_same",
      fallbacks: [],
      reason: [],
      generatedAt: "",
    };

    await executeRoutePlan({
      plan,
      catalog,
      req,
      res,
      config: baseConfig(),
      pathWithQuery: "/v1/models",
      attempt,
    });
    assert.equal(authSeen["upstream_same"], "Bearer client-key-same-origin");
  });

  it("2: foreign primary without local key → credential_unavailable, no attempt", async () => {
    const attempted: string[] = [];
    const attempt: AttemptFn = async (target) => {
      attempted.push(target.id);
      return {
        kind: "ok",
        offeringId: target.id,
        response: new Response(null, { status: 200 }),
      };
    };
    const res = createMockRes();
    const req = createMockReq("GET", { authorization: "Bearer client-key" });
    const config = baseConfig({
      providerApiKeys: { providerB: "local-b" },
    });
    const plan: RoutePlan = {
      primary: "first",
      fallbacks: ["second"],
      reason: [],
      generatedAt: "",
    };

    const result = await executeRoutePlan({
      plan,
      catalog,
      req,
      res,
      config,
      pathWithQuery: "/v1/models",
      attempt,
    });

    assert.deepEqual(attempted, ["second"]);
    assert.equal(result.offeringId, "second");
    assert.deepEqual(result.attempts, [
      "first:credential_unavailable",
      "second:ok",
    ]);
  });

  it("3: foreign fallback never receives providerA client key", async () => {
    const authSeen: Record<string, string> = {};
    const attempt: AttemptFn = async (target, ctx) => {
      authSeen[target.id] = ctx.auth;
      if (target.id === "first") {
        return {
          kind: "retry",
          offeringId: "first",
          code: "http_503",
          message: "down",
          status: 503,
        };
      }
      return {
        kind: "ok",
        offeringId: "second",
        response: new Response(null, { status: 200 }),
      };
    };
    const res = createMockRes();
    const req = createMockReq("GET", {
      authorization: "Bearer client-key-for-provider-a",
    });
    const config = baseConfig({
      providerApiKeys: {
        providerA: "local-provider-a-key",
        providerB: "local-provider-b-key",
      },
    });
    const plan: RoutePlan = {
      primary: "first",
      fallbacks: ["second"],
      reason: [],
      generatedAt: "",
    };

    await executeRoutePlan({
      plan,
      catalog,
      req,
      res,
      config,
      pathWithQuery: "/v1/models",
      attempt,
    });

    assert.equal(authSeen["first"], "Bearer local-provider-a-key");
    assert.equal(authSeen["second"], "Bearer local-provider-b-key");
  });

  it("4: primary+fallback same alien origin must not forward client key (bypass regression)", async () => {
    const authSeen: Record<string, string> = {};
    const attempt: AttemptFn = async (target, ctx) => {
      authSeen[target.id] = ctx.auth;
      if (target.id === "first") {
        return {
          kind: "retry",
          offeringId: "first",
          code: "credential_unavailable",
          message: "skip",
        };
      }
      return {
        kind: "ok",
        offeringId: target.id,
        response: new Response(null, { status: 200 }),
      };
    };
    // Inject attempt that only runs if auth resolved — also test executor skip path
    const res = createMockRes();
    const req = createMockReq("GET", {
      authorization: "Bearer should-not-leak",
    });
    const config = baseConfig({
      // only also_a has a local key; first shares origin a.example but no key
      providerApiKeys: { providerA2: "local-a2-only" },
    });
    const plan: RoutePlan = {
      primary: "first",
      fallbacks: ["also_a"],
      reason: [],
      generatedAt: "",
    };

    const result = await executeRoutePlan({
      plan,
      catalog,
      req,
      res,
      config,
      pathWithQuery: "/v1/models",
      attempt,
    });

    assert.equal(result.attempts[0], "first:credential_unavailable");
    assert.equal(authSeen["also_a"], "Bearer local-a2-only");
    assert.equal(authSeen["first"], undefined);
  });

  it("5: placeholder swap only on configured upstream origin", async () => {
    const authSeen: Record<string, string> = {};
    const attempt: AttemptFn = async (target, ctx) => {
      authSeen[target.id] = ctx.auth;
      return {
        kind: "ok",
        offeringId: target.id,
        response: new Response(null, { status: 200 }),
      };
    };
    const res = createMockRes();
    const req = createMockReq("GET", { authorization: "Bearer sk-local" });
    const config = baseConfig({
      upstreamApiKey: "my-real-global-key",
      providerApiKeys: { providerB: "local-b" },
    });

    await executeRoutePlan({
      plan: {
        primary: "upstream_same",
        fallbacks: [],
        reason: [],
        generatedAt: "",
      },
      catalog,
      req,
      res,
      config,
      pathWithQuery: "/v1/models",
      attempt,
    });
    assert.equal(authSeen["upstream_same"], "Bearer my-real-global-key");

    const res2 = createMockRes();
    const req2 = createMockReq("GET", { authorization: "Bearer sk-local" });
    await executeRoutePlan({
      plan: {
        primary: "second",
        fallbacks: [],
        reason: [],
        generatedAt: "",
      },
      catalog,
      req: req2,
      res: res2,
      config,
      pathWithQuery: "/v1/models",
      attempt,
    });
    // foreign: local provider key only, not placeholder or global key
    assert.equal(authSeen["second"], "Bearer local-b");
  });

  it("6: real HTTP server does not receive secret client headers on foreign origin", async () => {
    const received: Record<string, string | string[] | undefined>[] = [];
    const server = createServer((req, res) => {
      received.push({ ...req.headers });
      res.writeHead(200, { "content-type": "application/json" });
      res.end("{}");
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const addr = server.address();
    assert.ok(addr && typeof addr === "object");
    const port = addr.port;
    const originBase = `http://127.0.0.1:${port}/v1`;

    try {
      const localCatalog = new Map<string, OfferingTarget>([
        [
          "local_foreign",
          {
            id: "local_foreign",
            providerId: "localprov",
            baseUrl: originBase,
          },
        ],
      ]);
      const config = baseConfig({
        upstreamBaseUrl: "https://api.openai.com/v1",
        allowedUpstreamHosts: ["127.0.0.1", "api.openai.com"],
        providerApiKeys: { localprov: "proxy-owned-key" },
      });
      const res = createMockRes();
      const req = createMockReq("GET", {
        authorization: "Bearer client-must-not-appear",
        cookie: "session=super-secret",
        "x-api-key": "client-x-api-key",
        "x-gekiyasu-token": "proxy-token-value",
        "proxy-authorization": "Basic Zm9vOmJhcg==",
        accept: "application/json",
      });

      // Use default attempt (real fetch) against local server
      const result = await executeRoutePlan({
        plan: {
          primary: "local_foreign",
          fallbacks: [],
          reason: [],
          generatedAt: "",
        },
        catalog: localCatalog,
        req,
        res,
        config,
        pathWithQuery: "/v1/models",
      });

      assert.equal(result.offeringId, "local_foreign");
      assert.equal(received.length, 1);
      const h = received[0]!;
      assert.equal(h.authorization, "Bearer proxy-owned-key");
      assert.equal(h.cookie, undefined);
      assert.equal(h["x-api-key"], undefined);
      assert.equal(h["x-gekiyasu-token"], undefined);
      assert.equal(h["proxy-authorization"], undefined);
      // client bearer must not appear anywhere
      const authVal = String(h.authorization ?? "");
      assert.ok(!authVal.includes("client-must-not-appear"));
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      );
    }
  });
});

describe("executeRoutePlan P1 non-idempotent fallback", () => {
  const catalog = new Map<string, OfferingTarget>([
    [
      "first",
      { id: "first", providerId: "providerA", baseUrl: "https://a.example/v1" },
    ],
    [
      "second",
      { id: "second", providerId: "providerB", baseUrl: "https://b.example/v1" },
    ],
  ]);

  const configWithKeys = baseConfig({
    providerApiKeys: {
      providerA: "key-a",
      providerB: "key-b",
    },
  });

  it("1: GET + 500 → fallback", async () => {
    const attempted: string[] = [];
    const attempt: AttemptFn = async (target) => {
      attempted.push(target.id);
      if (target.id === "first") {
        return {
          kind: "retry",
          offeringId: target.id,
          code: "http_500",
          message: "internal error",
          status: 500,
        };
      }
      return {
        kind: "ok",
        offeringId: target.id,
        response: new Response(null, { status: 200 }),
      };
    };
    const res = createMockRes();
    const req = createMockReq("GET");
    await executeRoutePlan({
      plan: {
        primary: "first",
        fallbacks: ["second"],
        reason: [],
        generatedAt: "",
      },
      catalog,
      req,
      res,
      config: configWithKeys,
      pathWithQuery: "/v1/models",
      attempt,
    });
    assert.deepEqual(attempted, ["first", "second"]);
  });

  it("2: GET + 429 → fallback", async () => {
    const attempted: string[] = [];
    const attempt: AttemptFn = async (target) => {
      attempted.push(target.id);
      if (target.id === "first") {
        return {
          kind: "retry",
          offeringId: target.id,
          code: "http_429",
          message: "rate limited",
          status: 429,
        };
      }
      return {
        kind: "ok",
        offeringId: target.id,
        response: new Response(null, { status: 200 }),
      };
    };
    const res = createMockRes();
    const req = createMockReq("GET");
    await executeRoutePlan({
      plan: {
        primary: "first",
        fallbacks: ["second"],
        reason: [],
        generatedAt: "",
      },
      catalog,
      req,
      res,
      config: configWithKeys,
      pathWithQuery: "/v1/models",
      attempt,
    });
    assert.deepEqual(attempted, ["first", "second"]);
  });

  it("3: POST + upstream 500 response → no fallback, status/body passthrough", async () => {
    const attempted: string[] = [];
    const attempt: AttemptFn = async (target) => {
      attempted.push(target.id);
      return {
        kind: "ok",
        offeringId: target.id,
        response: new Response(
          JSON.stringify({ error: { message: "upstream boom" } }),
          {
            status: 500,
            headers: {
              "content-type": "application/json",
              "x-request-id": "up-500",
            },
          },
        ),
      };
    };
    const res = createMockRes();
    const req = createMockReq(
      "POST",
      { authorization: "Bearer key", "content-type": "application/json" },
      JSON.stringify({ model: "test", messages: [] }),
    );
    const result = await executeRoutePlan({
      plan: {
        primary: "first",
        fallbacks: ["second"],
        reason: [],
        generatedAt: "",
      },
      catalog,
      req,
      res,
      config: configWithKeys,
      pathWithQuery: "/v1/chat/completions",
      attempt,
    });

    assert.deepEqual(attempted, ["first"]);
    assert.equal(result.offeringId, "first");
    assert.equal(res.resState.statusCode, 500);
    assert.equal(res.resState.headers.get("x-request-id"), "up-500");
    assert.equal(
      res.resState.headers.get("x-gekiyasu-fallback"),
      "skipped-non-idempotent",
    );
    assert.deepEqual(JSON.parse(res.resState.body), {
      error: { message: "upstream boom" },
    });
  });

  it("4: POST + upstream 429 response → no fallback, 429 passthrough", async () => {
    const attempted: string[] = [];
    const attempt: AttemptFn = async (target) => {
      attempted.push(target.id);
      return {
        kind: "ok",
        offeringId: target.id,
        response: new Response(
          JSON.stringify({ error: { message: "Too many requests" } }),
          {
            status: 429,
            headers: {
              "content-type": "application/json",
              "x-request-id": "req-123",
            },
          },
        ),
      };
    };
    const res = createMockRes();
    const req = createMockReq(
      "POST",
      { "content-type": "application/json" },
      "{}",
    );
    const result = await executeRoutePlan({
      plan: {
        primary: "first",
        fallbacks: ["second"],
        reason: [],
        generatedAt: "",
      },
      catalog,
      req,
      res,
      config: configWithKeys,
      pathWithQuery: "/v1/chat/completions",
      attempt,
    });

    assert.deepEqual(attempted, ["first"]);
    assert.equal(result.offeringId, "first");
    assert.equal(res.resState.statusCode, 429);
    assert.equal(res.resState.headers.get("x-request-id"), "req-123");
    assert.equal(
      res.resState.headers.get("x-gekiyasu-fallback"),
      "skipped-non-idempotent",
    );
    assert.deepEqual(JSON.parse(res.resState.body), {
      error: { message: "Too many requests" },
    });
  });

  it("5: POST + timeout / upstream_unreachable → no fallback", async () => {
    for (const code of ["upstream_timeout", "upstream_unreachable"] as const) {
      const attempted: string[] = [];
      const attempt: AttemptFn = async (target) => {
        attempted.push(target.id);
        return {
          kind: "retry",
          offeringId: target.id,
          code,
          message: code,
        };
      };
      const res = createMockRes();
      const req = createMockReq("POST", {}, "{}");
      const result = await executeRoutePlan({
        plan: {
          primary: "first",
          fallbacks: ["second"],
          reason: [],
          generatedAt: "",
        },
        catalog,
        req,
        res,
        config: configWithKeys,
        pathWithQuery: "/v1/chat/completions",
        attempt,
      });
      assert.deepEqual(attempted, ["first"], code);
      assert.equal(result.offeringId, "first", code);
      assert.ok(
        result.attempts.every((a) => !a.startsWith("second:")),
        code,
      );
      assert.equal(res.resState.statusCode, 502, code);
    }
  });

  it("6: POST fallback candidates never receive an attempt after primary failure", async () => {
    const attempted: string[] = [];
    const attempt: AttemptFn = async (target) => {
      attempted.push(target.id);
      return {
        kind: "retry",
        offeringId: target.id,
        code: "http_503",
        message: "down",
        status: 503,
      };
    };
    const res = createMockRes();
    const req = createMockReq("POST", {}, "{}");
    await executeRoutePlan({
      plan: {
        primary: "first",
        fallbacks: ["second"],
        reason: [],
        generatedAt: "",
      },
      catalog,
      req,
      res,
      config: configWithKeys,
      pathWithQuery: "/v1/chat/completions",
      attempt,
    });
    assert.deepEqual(attempted, ["first"]);
    assert.ok(!attempted.includes("second"));
  });
});

describe("response header hygiene after undici decompression", () => {
  it("strips content-encoding when rewriting /v1/models JSON body", async () => {
    // Node fetch/undici auto-decompresses bodies but may leave Content-Encoding
    // on the Response headers. Forwarding that with a plain JSON body breaks
    // aiohttp clients without brotli (e.g. OpenWebUI verify).
    const catalog = new Map<string, OfferingTarget>([
      [
        "primary",
        {
          id: "primary",
          providerId: "providerA",
          baseUrl: "https://a.example/v1",
        },
      ],
    ]);
    const attempt: AttemptFn = async (target) => ({
      kind: "ok",
      offeringId: target.id,
      response: new Response(
        JSON.stringify({
          data: [{ id: "model-a" }],
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
            "content-encoding": "br",
          },
        },
      ),
    });
    const res = createMockRes();
    const req = createMockReq("GET", { authorization: "Bearer sk-test" });
    const config = baseConfig({
      providerApiKeys: { providerA: "sk-test" },
    });

    const result = await executeRoutePlan({
      plan: {
        primary: "primary",
        fallbacks: [],
        reason: [],
        generatedAt: "",
      },
      catalog,
      req,
      res,
      config,
      pathWithQuery: "/v1/models",
      attempt,
    });

    assert.equal(result.offeringId, "primary");
    assert.equal(res.resState.statusCode, 200);
    assert.equal(res.resState.headers.get("content-encoding"), undefined);
    const body = JSON.parse(res.resState.body) as {
      object?: string;
      data?: { id: string; object?: string }[];
    };
    assert.equal(body.object, "list");
    assert.equal(body.data?.[0]?.id, "model-a");
  });

  it("strips content-encoding on streamed non-models responses", async () => {
    const catalog = new Map<string, OfferingTarget>([
      [
        "primary",
        {
          id: "primary",
          providerId: "providerA",
          baseUrl: "https://a.example/v1",
        },
      ],
    ]);
    const attempt: AttemptFn = async (target) => ({
      kind: "ok",
      offeringId: target.id,
      response: new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: {
          "content-type": "application/json",
          "content-encoding": "br",
        },
      }),
    });
    const res = createMockRes();
    const req = createMockReq("POST", { authorization: "Bearer sk-test" }, "{}");
    const config = baseConfig({
      providerApiKeys: { providerA: "sk-test" },
    });

    await executeRoutePlan({
      plan: {
        primary: "primary",
        fallbacks: [],
        reason: [],
        generatedAt: "",
      },
      catalog,
      req,
      res,
      config,
      pathWithQuery: "/v1/chat/completions",
      attempt,
    });

    assert.equal(res.resState.statusCode, 200);
    assert.equal(res.resState.headers.get("content-encoding"), undefined);
    assert.equal(JSON.parse(res.resState.body).ok, true);
  });
});

describe("executeRoutePlan request-aware routing (T-044)", () => {
  const requestedModelOnly = (
    candidates: { id: string; baseUrl: string; providerId: string; modelId?: string; aliases?: string[]; upstreamModelId?: string }[],
  ): Map<string, OfferingTarget> => {
    const m = new Map<string, OfferingTarget>();
    for (const c of candidates) {
      m.set(c.id, {
        id: c.id,
        providerId: c.providerId,
        baseUrl: c.baseUrl,
        modelId: c.modelId,
        aliases: c.aliases,
        upstreamModelId: c.upstreamModelId,
      });
    }
    return m;
  };

  it("1: an unrelated cheap offering is not chosen when requestedModel does not match", async () => {
    // Two offerings, both with provider keys. cheap-b is cheaper, but the
    // request asks for model "gpt-x" which only offering-a can serve.
    const catalog = requestedModelOnly([
      { id: "a", baseUrl: "https://a.example/v1", providerId: "pA", modelId: "gpt-x", upstreamModelId: "gpt-x-internal" },
      { id: "b", baseUrl: "https://b.example/v1", providerId: "pB", modelId: "gpt-y", upstreamModelId: "gpt-y-internal" },
    ]);
    const plan: RoutePlan = {
      primary: "a",
      fallbacks: ["b"],
      reason: [],
      generatedAt: "",
    };
    const tried: string[] = [];
    const attempt: AttemptFn = async (target) => {
      tried.push(target.id);
      return {
        kind: "ok",
        offeringId: target.id,
        response: new Response("{}", {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      };
    };
    const res = createMockRes();
    const req = createMockReq("GET", { authorization: "Bearer sk-test" });
    const config = baseConfig({
      upstreamApiKey: "sk-test",
      providerApiKeys: { pA: "k-a", pB: "k-b" },
    });
    await executeRoutePlan({
      plan,
      catalog,
      req,
      res,
      config,
      pathWithQuery: "/v1/chat/completions",
      attempt,
      prepared: { body: Buffer.from(""), facts: { requestedModel: "gpt-x" } },
    });
    assert.deepEqual(tried, ["a"], "only the matching offering is tried");
  });

  it("2: alias match rewrites the model to upstreamModelId for that offering", async () => {
    const catalog = requestedModelOnly([
      { id: "a", baseUrl: "https://a.example/v1", providerId: "pA", modelId: "minimax-m3", aliases: ["gpt-4o-mini"], upstreamModelId: "internal-mm-m3" },
    ]);
    const plan: RoutePlan = {
      primary: "a",
      fallbacks: [],
      reason: [],
      generatedAt: "",
    };
    const seen: { auth?: string; body?: Buffer } = {};
    const attempt: AttemptFn = async (target, ctx) => {
      seen.auth = ctx.auth;
      seen.body = ctx.body;
      return {
        kind: "ok",
        offeringId: target.id,
        response: new Response("{}", {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      };
    };
    const res = createMockRes();
    const req = createMockReq("POST", { authorization: "Bearer sk-test", "content-type": "application/json" });
    const config = baseConfig({ providerApiKeys: { pA: "k-a" } });
    const original = Buffer.from(
      JSON.stringify({ model: "gpt-4o-mini", messages: [{ role: "user", content: "hi" }] }),
      "utf8",
    );
    await executeRoutePlan({
      plan,
      catalog,
      req,
      res,
      config,
      pathWithQuery: "/v1/chat/completions",
      attempt,
      prepared: { body: original, facts: { requestedModel: "gpt-4o-mini" } },
    });
    assert.ok(seen.body, "attempt should receive a body");
    const parsed = JSON.parse(seen.body!.toString("utf8"));
    assert.equal(parsed.model, "internal-mm-m3");
  });

  it("3: unknown requested model fails closed with no_matching_offering", async () => {
    const catalog = requestedModelOnly([
      { id: "a", baseUrl: "https://a.example/v1", providerId: "pA", modelId: "gpt-x", upstreamModelId: "gpt-x-internal" },
    ]);
    const plan: RoutePlan = {
      primary: "a",
      fallbacks: [],
      reason: [],
      generatedAt: "",
    };
    const tried: string[] = [];
    const attempt: AttemptFn = async (target) => {
      tried.push(target.id);
      return {
        kind: "ok",
        offeringId: target.id,
        response: new Response("{}", { status: 200, headers: { "content-type": "application/json" } }),
      };
    };
    const res = createMockRes();
    const req = createMockReq("GET", { authorization: "Bearer sk-test" });
    const config = baseConfig({ providerApiKeys: { pA: "k-a" } });
    await executeRoutePlan({
      plan,
      catalog,
      req,
      res,
      config,
      pathWithQuery: "/v1/chat/completions",
      attempt,
      prepared: { body: Buffer.from(""), facts: { requestedModel: "no-such-model" } },
    });
    assert.deepEqual(tried, [], "no offering should be tried for an unknown model");
    assert.equal(res.resState.statusCode, 400);
    const err = JSON.parse(res.resState.body);
    assert.equal(err.error.code, "no_matching_offering");
  });

  it("4: original body Buffer is not mutated; per-attempt bodies are distinct", async () => {
    const catalog = requestedModelOnly([
      { id: "a", baseUrl: "https://a.example/v1", providerId: "pA", modelId: "gpt-x", upstreamModelId: "MODEL_A" },
      { id: "b", baseUrl: "https://b.example/v1", providerId: "pB", modelId: "gpt-x", upstreamModelId: "MODEL_B" },
    ]);
    const plan: RoutePlan = {
      primary: "a",
      fallbacks: ["b"],
      reason: [],
      generatedAt: "",
    };
    const seen: Buffer[] = [];
    const attempt: AttemptFn = async (target, ctx) => {
      seen.push(Buffer.from(ctx.body!));
      if (target.id === "a") {
        return { kind: "retry", offeringId: target.id, code: "http_503", message: "down", status: 503 };
      }
      return {
        kind: "ok",
        offeringId: target.id,
        response: new Response("{}", { status: 200, headers: { "content-type": "application/json" } }),
      };
    };
    const res = createMockRes();
    // GET so that 503 on `a` triggers the P1 fallback path to `b`.
    const req = createMockReq("GET", { authorization: "Bearer sk-test" });
    const config = baseConfig({ providerApiKeys: { pA: "k-a", pB: "k-b" } });
    const original = Buffer.from(
      JSON.stringify({ model: "gpt-x", messages: [] }),
      "utf8",
    );
    const originalSnapshot = Buffer.from(original);
    await executeRoutePlan({
      plan,
      catalog,
      req,
      res,
      config,
      pathWithQuery: "/v1/chat/completions",
      attempt,
      prepared: { body: original, facts: { requestedModel: "gpt-x" } },
    });
    assert.equal(original.equals(originalSnapshot), true, "original Buffer must not be mutated");
    assert.equal(seen.length, 2);
    assert.equal(JSON.parse(seen[0]!.toString("utf8")).model, "MODEL_A");
    assert.equal(JSON.parse(seen[1]!.toString("utf8")).model, "MODEL_B");
    assert.notEqual(seen[0], seen[1], "per-attempt bodies are different Buffer instances");
  });

  it("6: after request-aware narrowing, retry walks the NEXT eligibleId (issue #4)", async () => {
    // Plan ids: [a, b, c]. requestedModel matches a and c only.
    // eligibleIds = [a, c]. a returns a retryable 503 on GET; the
    // executor must walk eligibleIds[1] = c, not the un-matching b.
    // Before the fix, hasMore was derived from ids.length, so the
    // intent (walk eligible fallbacks) was fragile under refactors.
    const catalog = requestedModelOnly([
      { id: "a", baseUrl: "https://a.example/v1", providerId: "pA", modelId: "gpt-x", upstreamModelId: "MODEL_A" },
      { id: "b", baseUrl: "https://b.example/v1", providerId: "pB", modelId: "gpt-y", upstreamModelId: "MODEL_B" },
      { id: "c", baseUrl: "https://c.example/v1", providerId: "pC", modelId: "gpt-x", upstreamModelId: "MODEL_C" },
    ]);
    const plan: RoutePlan = {
      primary: "a",
      fallbacks: ["b", "c"],
      reason: [],
      generatedAt: "",
    };
    const tried: string[] = [];
    const seenModelByTarget: Record<string, string> = {};
    const attempt: AttemptFn = async (target, ctx) => {
      tried.push(target.id);
      const bodyStr = ctx.body?.toString("utf8") ?? "{}";
      seenModelByTarget[target.id] = JSON.parse(bodyStr).model as string;
      if (target.id === "a") {
        return { kind: "retry", offeringId: target.id, code: "http_503", message: "down", status: 503 };
      }
      return {
        kind: "ok",
        offeringId: target.id,
        response: new Response("{}", { status: 200, headers: { "content-type": "application/json" } }),
      };
    };
    const res = createMockRes();
    const req = createMockReq("GET", { authorization: "Bearer sk-test" });
    const config = baseConfig({ providerApiKeys: { pA: "k-a", pB: "k-b", pC: "k-c" } });
    const original = Buffer.from(JSON.stringify({ model: "gpt-x", messages: [] }), "utf8");
    const result = await executeRoutePlan({
      plan,
      catalog,
      req,
      res,
      config,
      pathWithQuery: "/v1/chat/completions",
      attempt,
      prepared: { body: original, facts: { requestedModel: "gpt-x" } },
    });
    assert.deepEqual(tried, ["a", "c"], "fallback must skip un-matching b and pick c");
    assert.equal(result.offeringId, "c");
    assert.equal(seenModelByTarget["a"], "MODEL_A");
    assert.equal(seenModelByTarget["c"], "MODEL_C");
    // No phantom b entry in the attempt log.
    assert.ok(
      !result.attempts.some((a) => a.startsWith("b:")),
      `unexpected attempts: ${result.attempts.join(",")}`,
    );
  });

  it("5: when PreparedRequest is given, the request stream is not re-read", async () => {
    // Create a req with NO body (Readable.from([])). If the executor tried
    // to readBody, the call would either hang or reject. The test passes
    // only because the prepared body is used directly.
    const catalog = requestedModelOnly([
      { id: "a", baseUrl: "https://a.example/v1", providerId: "pA", modelId: "gpt-x", upstreamModelId: "gpt-x-internal" },
    ]);
    const plan: RoutePlan = {
      primary: "a",
      fallbacks: [],
      reason: [],
      generatedAt: "",
    };
    const attempt: AttemptFn = async (target, ctx) => {
      // If body was re-read from the empty stream, ctx.body would be
      // undefined (or the call would hang). We rely on the prepared body.
      assert.ok(ctx.body, "ctx.body must come from prepared, not from re-read");
      return {
        kind: "ok",
        offeringId: target.id,
        response: new Response("{}", { status: 200, headers: { "content-type": "application/json" } }),
      };
    };
    const res = createMockRes();
    const req = createMockReq("POST", { authorization: "Bearer sk-test", "content-type": "application/json" }, null);
    const config = baseConfig({ providerApiKeys: { pA: "k-a" } });
    await executeRoutePlan({
      plan,
      catalog,
      req,
      res,
      config,
      pathWithQuery: "/v1/chat/completions",
      attempt,
      prepared: {
        body: Buffer.from(JSON.stringify({ model: "gpt-x", messages: [] }), "utf8"),
        facts: { requestedModel: "gpt-x" },
      },
    });
  });
});

describe("executeRoutePlan circuit breaker (T-036)", () => {
  const catalog = new Map<string, OfferingTarget>([
    ["first", { id: "first", providerId: "a", baseUrl: "https://a.example/v1" }],
    ["second", { id: "second", providerId: "b", baseUrl: "https://b.example/v1" }],
  ]);

  it("skips a circuit-open primary and uses the fallback", async () => {
    const circuit = createCircuitBreaker({ failureThreshold: 1, openSeconds: 300 });
    circuit.recordFailure("first");

    const tried: string[] = [];
    const attempt: AttemptFn = async (target) => {
      tried.push(target.id);
      return {
        kind: "ok",
        offeringId: target.id,
        response: new Response("{}", {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      };
    };

    const res = createMockRes();
    const req = createMockReq("GET", { authorization: "Bearer sk-test" });
    const config = baseConfig({
      upstreamApiKey: "sk-test",
      providerApiKeys: { a: "k-a", b: "k-b" },
    });

    const result = await executeRoutePlan({
      plan: { primary: "first", fallbacks: ["second"], reason: [], generatedAt: "" },
      catalog,
      req,
      res,
      config,
      pathWithQuery: "/v1/chat/completions",
      circuit,
      attempt,
    });

    assert.deepEqual(tried, ["second"]);
    assert.equal(result.offeringId, "second");
    assert.ok(result.attempts.some((a) => a.startsWith("first:circuit_open")));
  });

  it("does not skip an offering when the circuit is closed", async () => {
    const circuit = createCircuitBreaker({ failureThreshold: 3, openSeconds: 300 });

    const tried: string[] = [];
    const attempt: AttemptFn = async (target) => {
      tried.push(target.id);
      return {
        kind: "ok",
        offeringId: target.id,
        response: new Response("{}", {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      };
    };

    const res = createMockRes();
    const req = createMockReq("GET", { authorization: "Bearer sk-test" });
    const config = baseConfig({
      upstreamApiKey: "sk-test",
      providerApiKeys: { a: "k-a", b: "k-b" },
    });

    const result = await executeRoutePlan({
      plan: { primary: "first", fallbacks: ["second"], reason: [], generatedAt: "" },
      catalog,
      req,
      res,
      config,
      pathWithQuery: "/v1/chat/completions",
      circuit,
      attempt,
    });

    assert.deepEqual(tried, ["first"]);
    assert.equal(result.offeringId, "first");
    assert.deepEqual(result.attempts, ["first:ok"]);
  });

  it("records failures and opens the circuit so the next request skips", async () => {
    const circuit = createCircuitBreaker({ failureThreshold: 2, openSeconds: 300 });
    const catalogLocal = new Map<string, OfferingTarget>([
      ["first", { id: "first", providerId: "a", baseUrl: "https://a.example/v1" }],
      ["second", { id: "second", providerId: "b", baseUrl: "https://b.example/v1" }],
    ]);

    const failingAttempt: AttemptFn = async (target) => ({
      kind: "retry",
      offeringId: target.id,
      code: "upstream_unreachable",
      message: "down",
    });

    const res1 = createMockRes();
    const req1 = createMockReq("GET", { authorization: "Bearer sk-test" });
    const config = baseConfig({
      upstreamApiKey: "sk-test",
      providerApiKeys: { a: "k-a", b: "k-b" },
    });

    // Two GET failures on primary → threshold 2 opens circuit
    await executeRoutePlan({
      plan: { primary: "first", fallbacks: [], reason: [], generatedAt: "" },
      catalog: catalogLocal,
      req: req1,
      res: res1,
      config,
      pathWithQuery: "/v1/models",
      circuit,
      attempt: failingAttempt,
    });
    const res2 = createMockRes();
    await executeRoutePlan({
      plan: { primary: "first", fallbacks: [], reason: [], generatedAt: "" },
      catalog: catalogLocal,
      req: createMockReq("GET", { authorization: "Bearer sk-test" }),
      res: res2,
      config,
      pathWithQuery: "/v1/models",
      circuit,
      attempt: failingAttempt,
    });
    assert.equal(circuit.isOpen("first"), true);

    const tried: string[] = [];
    const res3 = createMockRes();
    const result = await executeRoutePlan({
      plan: { primary: "first", fallbacks: ["second"], reason: [], generatedAt: "" },
      catalog: catalogLocal,
      req: createMockReq("GET", { authorization: "Bearer sk-test" }),
      res: res3,
      config,
      pathWithQuery: "/v1/chat/completions",
      circuit,
      attempt: async (target) => {
        tried.push(target.id);
        return {
          kind: "ok",
          offeringId: target.id,
          response: new Response("{}", {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
        };
      },
    });

    assert.deepEqual(tried, ["second"]);
    assert.ok(result.attempts.some((a) => a.startsWith("first:circuit_open")));
  });
});
