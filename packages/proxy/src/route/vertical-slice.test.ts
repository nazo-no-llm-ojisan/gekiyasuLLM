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
import {
  buildOfferingCatalog,
  candidatesFromCatalog,
} from "./catalog.js";
import {
  selectCandidatesForRequestedModel,
  buildRoutePlan,
} from "./plan.js";
import { rewriteModelForOffering } from "./body-rewrite.js";

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

describe("vertical slice: gpt-4o via 2 providers (T-050)", () => {
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

  it("when privateMode=true, openrouter is rejected and openai-direct wins", () => {
    const catalog = loadVerticalSliceCatalog();
    const allCandidates = candidatesFromCatalog(catalog);
    const gpt4oCandidates = selectCandidatesForRequestedModel(
      allCandidates,
      "gpt-4o",
    );

    const plan = buildRoutePlan({
      candidates: gpt4oCandidates,
      constraints: { privateMode: true },
      preferences: { preferFree: true },
    });

    // openrouter has allowsPrivateCode=false, so it's rejected in privateMode
    // openai-direct has allowsPrivateCode=true, so it wins
    assert.equal(plan.primary, "openai-direct:gpt-4o:standard");
    assert.deepEqual(plan.fallbacks, []);

    // Body rewrite should use openai-direct's upstreamModelId
    const chosen = catalog.get(plan.primary)!;
    const clientBody = Buffer.from(
      JSON.stringify({
        model: "gpt-4o",
        messages: [{ role: "user", content: "Hello" }],
      }),
      "utf8",
    );
    const rewritten = rewriteModelForOffering(clientBody, {
      upstreamModelId: chosen.upstreamModelId!,
    });
    const parsed = JSON.parse(rewritten.toString("utf8"));
    // Upstream should receive "gpt-4o" (OpenAI direct model id)
    assert.equal(parsed.model, "gpt-4o");
  });
});
