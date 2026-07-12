import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { IncomingMessage, ServerResponse } from "node:http";
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
