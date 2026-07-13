import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, before, after } from "node:test";
import { generateDataJs } from "./generate-catalog.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const SOURCE_FEED_REL = "fixtures/feeds/vertical-slice-2providers.json";
const sourceFeedPath = resolve(repoRoot, SOURCE_FEED_REL);
const catalogDataPath = resolve(repoRoot, "docs/catalog/data.js");
const feed = JSON.parse(readFileSync(sourceFeedPath, "utf8"));

describe("catalog stale check", () => {
  it("docs/catalog/data.js is in sync with source feed", () => {
    const expected = generateDataJs(feed, SOURCE_FEED_REL);
    const actual = readFileSync(catalogDataPath, "utf8");
    assert.strictEqual(
      actual,
      expected,
      "data.js is out of sync with source feed. Regenerate: node scripts/generate-catalog.mjs",
    );
  });
});

describe("catalog stale detection round-trip", () => {
  let tmpDir;
  let tmpFeedPath;
  let tmpOutputPath;

  before(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "gekiyasu-catalog-test-"));
    tmpFeedPath = join(tmpDir, "feed.json");
    tmpOutputPath = join(tmpDir, "data.js");
  });

  after(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("detects stale output when feed changes, and passes after regeneration", () => {
    // Setup: write feed, generate output
    writeFileSync(tmpFeedPath, JSON.stringify(feed), "utf8");
    const generated = generateDataJs(feed, "test-feed.json");
    writeFileSync(tmpOutputPath, generated, "utf8");

    // Initially in sync
    assert.strictEqual(
      readFileSync(tmpOutputPath, "utf8"),
      generated,
      "fresh generation should be in sync",
    );

    // Modify feed: add a new offering
    const modifiedFeed = JSON.parse(JSON.stringify(feed));
    modifiedFeed.offerings.push({
      id: "test:new:offering",
      modelId: "test/new",
      providerId: "openai-direct",
      endpointId: "openai-direct:api",
      upstreamModelId: "new-model",
      marketingName: "New Test Model",
      declaredCapabilities: { streaming: true },
      status: "active",
      relationships: {
        sponsored: false,
        affiliate: false,
        editorial_rank_influence: "none",
      },
      pricing: {
        currency: { normalized: "USD" },
        asOf: "2026-07-13",
        inputPerMillion: { normalized: 1 },
        outputPerMillion: { normalized: 2 },
      },
    });
    writeFileSync(tmpFeedPath, JSON.stringify(modifiedFeed), "utf8");

    // Stale detected: artifact doesn't match regeneration from modified feed
    const regenerated = generateDataJs(modifiedFeed, "test-feed.json");
    assert.notStrictEqual(
      readFileSync(tmpOutputPath, "utf8"),
      regenerated,
      "stale artifact should be detected after feed change",
    );

    // After regeneration, back in sync
    writeFileSync(tmpOutputPath, regenerated, "utf8");
    assert.strictEqual(
      readFileSync(tmpOutputPath, "utf8"),
      regenerated,
      "should be in sync after regeneration",
    );
  });

  it("produces deterministic output (no timestamps in generated content)", () => {
    const first = generateDataJs(feed, SOURCE_FEED_REL);
    const second = generateDataJs(feed, SOURCE_FEED_REL);
    assert.strictEqual(first, second, "generator must be deterministic");
  });
});
