import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import type { ProxyConfig } from "../config.js";
import { buildOfferingCatalog, candidatesFromCatalog } from "./catalog.js";
import { buildRoutePlan } from "./plan.js";

const here = dirname(fileURLToPath(import.meta.url));
const sampleFeedPath = join(here, "../../../../fixtures/feeds/sample-feed.json");
const verticalSliceFeedPath = join(
  here,
  "../../../../fixtures/feeds/vertical-slice-2providers.json",
);

function withTemporaryFeed<T>(feed: unknown, fn: (feedFile: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), "gekiyasu-private-trust-"));
  const feedFile = join(dir, "feed.json");
  writeFileSync(feedFile, JSON.stringify(feed), "utf8");
  try {
    return fn(feedFile);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("buildOfferingCatalog", () => {
  it("builds catalog with passthrough only when feedFile is not set", () => {
    const config = {
      upstreamBaseUrl: "https://api.openai.com/v1",
      allowedUpstreamHosts: ["api.openai.com"],
      feedFile: undefined,
    } as unknown as ProxyConfig;

    const catalog = buildOfferingCatalog(config);
    assert.equal(catalog.size, 1);
    assert.ok(catalog.has("passthrough:default"));
    assert.deepEqual(config.allowedUpstreamHosts, ["api.openai.com"]);
  });

  it("loads offerings from feed file and updates allowed hosts", () => {
    const config = {
      upstreamBaseUrl: "https://api.openai.com/v1",
      allowedUpstreamHosts: ["api.openai.com"],
      feedFile: sampleFeedPath,
    } as unknown as ProxyConfig;

    const catalog = buildOfferingCatalog(config);

    assert.ok(catalog.size > 1);
    assert.ok(catalog.has("passthrough:default"));
    assert.ok(catalog.has("provider-a:model-x:fixed"));
    assert.ok(catalog.has("provider-b:model-x:free"));

    const offA = catalog.get("provider-a:model-x:fixed")!;
    assert.equal(offA.providerId, "provider-a");
    assert.equal(offA.baseUrl, "https://api.provider-a.example/v1");
    assert.equal(offA.free, false);
    assert.equal(offA.allowsPrivateCode, true);
    assert.equal(offA.tools, true);

    const offB = catalog.get("provider-b:model-x:free")!;
    assert.equal(offB.providerId, "provider-b");
    assert.equal(offB.baseUrl, "https://api.provider-b.example/v1");
    assert.equal(offB.free, true);
    assert.equal(offB.allowsPrivateCode, false);
    assert.equal(offB.tools, false);

    assert.ok(config.allowedUpstreamHosts.includes("api.openai.com"));
    assert.ok(config.allowedUpstreamHosts.includes("api.provider-a.example"));
    assert.ok(config.allowedUpstreamHosts.includes("api.provider-b.example"));
  });

  it("preserves missing provider private-code trust as unknown", () => {
    const config = {
      upstreamBaseUrl: "https://api.openai.com/v1",
      allowedUpstreamHosts: ["api.openai.com"],
      feedFile: verticalSliceFeedPath,
    } as unknown as ProxyConfig;

    const catalog = buildOfferingCatalog(config);

    assert.equal(
      catalog.get("openai-direct:gpt-4o:standard")!.allowsPrivateCode,
      undefined,
    );
    assert.equal(
      catalog.get("openrouter:gpt-4o:discount")!.allowsPrivateCode,
      false,
    );
    assert.equal(catalog.get("passthrough:default")!.allowsPrivateCode, true);
  });

  it("keeps an explicitly trusted synthetic provider eligible in private mode", () => {
    withTemporaryFeed(
      {
        feed_version: "test-0.1.0",
        as_of: "2026-07-13T00:00:00Z",
        endpoints: [{
          id: "synthetic:api",
          providerId: "synthetic",
          baseUrl: "https://synthetic.example/v1",
          apiCompat: "openai_chat",
        }],
        providers: [{
          id: "synthetic",
          displayName: "Synthetic trusted provider",
          relationships: {
            sponsored: false,
            affiliate: false,
            editorial_rank_influence: "none",
          },
          trust: {
            allowsPrivateCode: {
              value: true,
              evidence: {
                sourceUrl: "https://synthetic.example/trust",
                retrievedAt: "2026-07-13T00:00:00Z",
                sourceType: "manual",
                confidence: "inferred",
              },
            },
          },
        }],
        offerings: [{
          id: "synthetic:model:trusted",
          modelId: "synthetic/model",
          providerId: "synthetic",
          endpointId: "synthetic:api",
          upstreamModelId: "synthetic-model",
          declaredCapabilities: {},
          relationships: {
            sponsored: false,
            affiliate: false,
            editorial_rank_influence: "none",
          },
          pricing: {
            currency: { normalized: "USD" },
            asOf: "2026-07-13",
            inputPerMillion: { normalized: 1 },
            outputPerMillion: { normalized: 1 },
          },
        }],
      },
      (feedFile) => {
        const config = {
          upstreamBaseUrl: "https://api.openai.com/v1",
          allowedUpstreamHosts: ["api.openai.com"],
          feedFile,
        } as unknown as ProxyConfig;
        const catalog = buildOfferingCatalog(config);
        const plan = buildRoutePlan({
          candidates: candidatesFromCatalog(catalog).filter(
            (candidate) => candidate.id === "synthetic:model:trusted",
          ),
          constraints: { privateMode: true },
        });

        assert.equal(
          catalog.get("synthetic:model:trusted")!.allowsPrivateCode,
          true,
        );
        assert.equal(plan.primary, "synthetic:model:trusted");
        assert.deepEqual(plan.fallbacks, []);
      },
    );
  });

  it("throws error when feed file does not exist", () => {
    const config = {
      upstreamBaseUrl: "https://api.openai.com/v1",
      allowedUpstreamHosts: ["api.openai.com"],
      feedFile: "non-existent-file.json",
    } as unknown as ProxyConfig;

    assert.throws(() => buildOfferingCatalog(config), /Feed file not found/);
  });
});
