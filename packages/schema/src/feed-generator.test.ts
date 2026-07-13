import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import {
  generateFeedFromFixtures,
  generateFeedFromManifest,
  defaultRepoRoot,
} from "./feed-generator.js";
import type { PricingManifest } from "./feed-generator.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = defaultRepoRoot(import.meta.url);
const manifestPath = join(repoRoot, "fixtures/pricing/manifest.json");

function loadManifestFromDisk(): PricingManifest {
  return JSON.parse(readFileSync(manifestPath, "utf8")) as PricingManifest;
}

describe("generateFeedFromManifest (Issue #13)", () => {
  it("produces a deterministic feed with both OpenAI and synthetic OpenRouter rows", () => {
    const m = loadManifestFromDisk();
    const feedA = generateFeedFromManifest(m, repoRoot);
    const feedB = generateFeedFromManifest(m, repoRoot);

    // Determinism: byte-equal JSON shape
    assert.equal(JSON.stringify(feedA), JSON.stringify(feedB));

    // Structure
    assert.equal(feedA.feed_version, "0.1.0");
    assert.equal(feedA.as_of, m.asOf);
    assert.equal(feedA.endpoints.length, 2);
    assert.equal(feedA.providers.length, 2);
    assert.equal(feedA.offerings.length, 2);

    // OpenAI row: real saved source, real prices, inferred trust
    const oaiOffering = feedA.offerings.find((o) => o.providerId === "openai-direct")!;
    assert.ok(oaiOffering, "openai-direct offering must exist");
    assert.equal(oaiOffering.modelId, "openai-direct/gpt-4o");
    assert.equal(oaiOffering.upstreamModelId, "gpt-4o");
    assert.equal(oaiOffering.pricing.inputPerMillion?.normalized, 2.5);
    assert.equal(oaiOffering.pricing.outputPerMillion?.normalized, 10);
    assert.equal(oaiOffering.pricing.currency.normalized, "USD");
    assert.equal(oaiOffering.pricing.evidence.parserId, "openai-pricing-html");
    assert.equal(oaiOffering.pricing.evidence.sourceType, "official");

    // OpenAI trust: NOT "confirmed" — only "inferred" without scoped ToS evidence
    const oaiProvider = feedA.providers.find((p) => p.id === "openai-direct")!;
    assert.equal(oaiProvider.trust?.allowsPrivateCode.value, true);
    assert.equal(
      oaiProvider.trust?.allowsPrivateCode.evidence.confidence,
      "inferred",
      "real provider trust must not be 'confirmed' from a generic policy URL",
    );

    // OpenRouter row: synthetic, must be labeled
    const orOffering = feedA.offerings.find((o) => o.providerId === "openrouter")!;
    assert.ok(orOffering, "openrouter offering must exist");
    assert.equal(orOffering.upstreamModelId, "openai/gpt-4o");
    assert.equal(orOffering.pricing.inputPerMillion?.normalized, 2.4);
    assert.equal(orOffering.pricing.outputPerMillion?.normalized, 9.6);

    const orProvider = feedA.providers.find((p) => p.id === "openrouter")!;
    assert.equal(orProvider.synthetic, true);
    assert.equal(orProvider.trust?.allowsPrivateCode.value, false);
  });

  it("preserves zero price and missing price as structurally distinct", async () => {
    const manifest: PricingManifest = {
      asOf: "2026-07-13",
      currency: "USD",
      providers: [
        {
          providerId: "p-free",
          displayName: "P Free",
          baseUrl: "https://api.p-free.example/v1",
          apiCompat: "openai_chat",
          endpointId: "p-free:api",
          pricingSource: {
            kind: "saved_json",
            path: "unused.json",
            sourceUrl: "https://p-free.example/pricing",
            sourceType: "manual",
            retrievedAt: "2026-07-13T00:00:00Z",
            parserId: "synthetic-json",
            synthetic: true,
          },
          offers: [
            {
              modelId: "p-free/m-zero",
              upstreamModelId: "m-zero",
              rowSelector: { upstreamModelId: "m-zero" },
              marketingName: "Zero-priced model",
              declaredCapabilities: { streaming: true, tools: true },
              accessVariant: "free",
            },
            {
              modelId: "p-free/m-missing",
              upstreamModelId: "m-missing",
              rowSelector: { upstreamModelId: "m-missing" },
              marketingName: "Output price missing model",
              declaredCapabilities: { streaming: true },
              accessVariant: "partial",
            },
          ],
        },
      ],
    };

    // Manually craft a synthetic source that distinguishes zero vs missing.
    // The generator reads the source via the path in pricingSource; we
    // patch the path to a temp file under repoRoot at call time.
    const tmpPath = join(repoRoot, "fixtures/pricing/zero-vs-missing.tmp.json");
    const { writeFileSync, unlinkSync } = await import("node:fs");
    writeFileSync(
      tmpPath,
      JSON.stringify({
        asOf: "2026-07-13",
        currency: "USD",
        rows: [
          { upstreamModelId: "m-zero", inputPerMillion: 0, outputPerMillion: 0 },
          { upstreamModelId: "m-missing", inputPerMillion: 0.5 },
        ],
      }),
      "utf8",
    );

    try {
      manifest.providers[0]!.pricingSource = {
        ...manifest.providers[0]!.pricingSource,
        path: tmpPath,
      };
      const feed = generateFeedFromManifest(manifest, repoRoot);
      const zero = feed.offerings.find((o) => o.upstreamModelId === "m-zero")!;
      const missing = feed.offerings.find((o) => o.upstreamModelId === "m-missing")!;

      // Zero-priced: inputPerMillion present with normalized=0
      assert.ok(zero.pricing.inputPerMillion, "zero-priced input must be present (not omitted)");
      assert.equal(zero.pricing.inputPerMillion!.normalized, 0);
      assert.equal(zero.pricing.outputPerMillion!.normalized, 0);

      // Missing/unparsed output: outputPerMillion field is omitted
      assert.equal(
        missing.pricing.outputPerMillion,
        undefined,
        "missing/unparsed price must be omitted, not zero",
      );
      assert.ok(
        missing.pricing.inputPerMillion,
        "present input price must still be present",
      );
      assert.equal(missing.pricing.inputPerMillion!.normalized, 0.5);

      // normalized snapshot distinguishes the two cases too
      assert.equal(zero.pricing.normalized!.inputPerMillion, 0);
      assert.equal(zero.pricing.normalized!.outputPerMillion, 0);
      assert.equal(
        missing.pricing.normalized!.outputPerMillion,
        undefined,
        "normalized snapshot must also omit the missing price",
      );
    } finally {
      unlinkSync(tmpPath);
    }
  });

  it("loadManifest + generateFeedFromFixtures round-trips to the same bytes as generateFeedFromManifest", () => {
    const viaLoader = generateFeedFromFixtures({
      repoRoot,
      manifestPath: "fixtures/pricing/manifest.json",
    });
    const viaManifest = generateFeedFromManifest(loadManifestFromDisk(), repoRoot);
    assert.equal(JSON.stringify(viaLoader), JSON.stringify(viaManifest));
  });
});

// ── Divergence / reproducibility check against the checked feed artifact ─────

describe("checked feed artifact matches the generator output", () => {
  it("the committed vertical-slice-2providers.json matches the generator output", () => {
    const feed = generateFeedFromManifest(loadManifestFromDisk(), repoRoot);
    const checkedPath = join(repoRoot, "fixtures/feeds/vertical-slice-2providers.json");
    const checkedRaw = readFileSync(checkedPath, "utf8");
    const checked = JSON.parse(checkedRaw);

    // The checked feed must be byte-equal to the generator output. This is
    // the divergence detector: any drift between the committed artifact
    // and the generated feed makes the test fail.
    assert.equal(
      JSON.stringify(checked),
      JSON.stringify(feed),
      "checked feed artifact diverges from generator output — regenerate via the feed generator",
    );
  });
});
