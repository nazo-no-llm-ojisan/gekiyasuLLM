/**
 * Vertical slice integration test (T-050).
 *
 * Demonstrates end-to-end: feed -> catalog -> plan -> body rewrite.
 * One logical model (gpt-4o) offered via two providers at different prices.
 * The proxy must pick the cheapest, rewrite the body, and produce the correct
 * upstreamModelId for the chosen provider.
 */
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import type { ProxyConfig } from "../config.js";
import { createServer } from "../server.js";
import {
  buildOfferingCatalog,
  candidatesFromCatalog,
} from "./catalog.js";
import {
  selectCandidatesForRequestedModel,
  buildRoutePlan,
} from "./plan.js";
import { rewriteModelForOffering } from "./body-rewrite.js";
import type { AttemptFn } from "./executor.js";

const here = dirname(fileURLToPath(import.meta.url));
const verticalSliceFeedPath = join(
  here,
  "../../../../fixtures/feeds/vertical-slice-2providers.json",
);

/**
 * Helper: load catalog from the vertical slice fixture.
 */
function loadVerticalSliceCatalog() {
  const config = {
    upstreamBaseUrl: "https://api.openai.com/v1",
    allowedUpstreamHosts: ["api.openai.com"],
    feedFile: verticalSliceFeedPath,
  } as unknown as ProxyConfig;
  return buildOfferingCatalog(config);
}

function verticalSliceServerConfig(): ProxyConfig {
  return {
    host: "127.0.0.1",
    port: 0,
    upstreamBaseUrl: "https://api.openai.com/v1",
    allowedUpstreamHosts: ["api.openai.com"],
    upstreamApiKey: "offline-openai-key",
    proxyToken: "proxy-token",
    maxBodyBytes: 1_000_000,
    upstreamTimeoutMs: 1_000,
    allowPlaceholderApiKeySwap: true,
    providerApiKeys: { openrouter: "offline-openrouter-key" },
    statsFile: undefined,
    circuitFailureThreshold: 3,
    circuitOpenSeconds: 300,
    corsAllowlist: [],
    feedFile: verticalSliceFeedPath,
  };
}

async function withInjectedServer<T>(
  config: ProxyConfig,
  attempt: AttemptFn,
  fn: (baseUrl: string) => Promise<T>,
): Promise<T> {
  const server = createServer(config, { attempt });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  try {
    return await fn(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

function runPlannedRequest(
  makePlan: () => ReturnType<typeof buildRoutePlan>,
  execute: (plan: ReturnType<typeof buildRoutePlan>) => void,
): void {
  execute(makePlan());
}

describe("vertical slice: gpt-4o via 2 providers (T-050)", () => {
  it("routes generated-feed HTTP requests through the injected executor attempt", async () => {
    const observed: Array<{
      offeringId: string;
      baseUrl: string;
      auth: string;
      body: Buffer | undefined;
    }> = [];
    const attempt: AttemptFn = async (target, context) => {
      observed.push({
        offeringId: target.id,
        baseUrl: target.baseUrl,
        auth: context.auth,
        body: context.body,
      });
      return {
        kind: "ok",
        offeringId: target.id,
        response: new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      };
    };
    const originalBody = Buffer.from(JSON.stringify({
      model: "gpt-4o",
      messages: [{ role: "user", content: "offline proof" }],
    }));
    const originalSnapshot = Buffer.from(originalBody);

    await withInjectedServer(verticalSliceServerConfig(), attempt, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: {
          authorization: "Bearer proxy-token",
          "content-type": "application/json",
        },
        body: originalBody,
      });

      assert.equal(response.status, 200);
      assert.equal(observed.length, 1);
      assert.equal(observed[0]!.offeringId, "openrouter:gpt-4o:discount");
      assert.equal(observed[0]!.baseUrl, "https://openrouter.ai/api/v1");
      assert.equal(observed[0]!.auth, "Bearer offline-openrouter-key");
      assert.equal(
        (JSON.parse(observed[0]!.body!.toString("utf8")) as { model: string }).model,
        "openai/gpt-4o",
      );
      assert.deepEqual(originalBody, originalSnapshot);
    });
  });

  it("catalog loads both gpt-4o offerings from the fixture", () => {
    const catalog = loadVerticalSliceCatalog();
    // 3 entries: passthrough + 2 feed offerings
    assert.ok(catalog.has("passthrough:default"));
    assert.ok(catalog.has("openai-direct:gpt-4o:standard"));
    assert.ok(catalog.has("openrouter:gpt-4o:discount"));

    const direct = catalog.get("openai-direct:gpt-4o:standard")!;
    const router = catalog.get("openrouter:gpt-4o:discount")!;

    // Verify pricing is loaded correctly
    assert.equal(direct.inputPerMillion, 2.5);
    assert.equal(router.inputPerMillion, 2.4);
    // Verify upstreamModelId differs per provider
    assert.equal(direct.upstreamModelId, "gpt-4o");
    assert.equal(router.upstreamModelId, "openai/gpt-4o");
  });

  it("plan picks the cheaper provider (openrouter) for gpt-4o", () => {
    const catalog = loadVerticalSliceCatalog();
    const allCandidates = candidatesFromCatalog(catalog);

    // Narrow to gpt-4o via alias match
    const gpt4oCandidates = selectCandidatesForRequestedModel(
      allCandidates,
      "gpt-4o",
    );

    // Should include both feed offerings (passthrough has no alias "gpt-4o")
    assert.equal(gpt4oCandidates.length, 2);

    const plan = buildRoutePlan({
      candidates: gpt4oCandidates,
      preferences: { preferFree: true },
    });

    // openrouter ($2.40/M) should be cheaper than openai-direct ($2.50/M)
    assert.equal(plan.primary, "openrouter:gpt-4o:discount");
    assert.deepEqual(plan.fallbacks, ["openai-direct:gpt-4o:standard"]);
  });

  it("body rewrite produces correct upstreamModelId for the chosen provider", () => {
    const catalog = loadVerticalSliceCatalog();
    const allCandidates = candidatesFromCatalog(catalog);
    const gpt4oCandidates = selectCandidatesForRequestedModel(
      allCandidates,
      "gpt-4o",
    );
    const plan = buildRoutePlan({
      candidates: gpt4oCandidates,
      preferences: { preferFree: true },
    });

    // The primary offering is openrouter:gpt-4o:discount
    const chosen = catalog.get(plan.primary)!;
    assert.ok(chosen.upstreamModelId);

    // Simulate a client request body
    const clientBody = Buffer.from(
      JSON.stringify({
        model: "gpt-4o",
        messages: [{ role: "user", content: "Hello" }],
      }),
      "utf8",
    );

    // Rewrite body for the chosen offering
    const rewritten = rewriteModelForOffering(clientBody, {
      upstreamModelId: chosen.upstreamModelId!,
    });

    const parsed = JSON.parse(rewritten.toString("utf8"));
    // Upstream should receive "openai/gpt-4o" (OpenRouter's model id)
    assert.equal(parsed.model, "openai/gpt-4o");
    // Messages should be preserved
    assert.deepEqual(parsed.messages, [{ role: "user", content: "Hello" }]);
  });

  it("when privateMode=true, unknown and explicit false trust make no upstream attempt", () => {
    const catalog = loadVerticalSliceCatalog();
    const candidates = selectCandidatesForRequestedModel(
      candidatesFromCatalog(catalog),
      "gpt-4o",
    );
    let executorSpyCount = 0;

    assert.throws(
      () => runPlannedRequest(
        () => buildRoutePlan({
          candidates,
          constraints: { privateMode: true },
          preferences: { preferFree: true },
        }),
        () => {
          executorSpyCount += 1;
        },
      ),
      /No eligible offerings.*private_mode/,
    );
    assert.equal(executorSpyCount, 0);
  });
});
