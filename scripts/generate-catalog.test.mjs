import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, before, after } from "node:test";
import { runInNewContext } from "node:vm";
import { generateDataJs } from "./generate-catalog.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const SOURCE_FEED_REL = "fixtures/feeds/vertical-slice-2providers.json";
const sourceFeedPath = resolve(repoRoot, SOURCE_FEED_REL);
const catalogDataPath = resolve(repoRoot, "docs/catalog/data.js");
const feed = JSON.parse(readFileSync(sourceFeedPath, "utf8"));

function renderCatalog(testFeed) {
  const html = readFileSync(resolve(repoRoot, "docs/catalog/index.html"), "utf8");
  const script = html.match(/<script>\s*([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script, "catalog inline script must exist");

  function createElement(tagName) {
    return {
      tagName: tagName.toUpperCase(),
      children: [],
      textContent: "",
      appendChild(child) {
        this.children.push(child);
        return child;
      },
    };
  }

  const meta = createElement("div");
  const tbody = createElement("tbody");
  const document = {
    getElementById(id) {
      if (id === "meta") return meta;
      if (id === "catalog-body") return tbody;
      return null;
    },
    createElement,
  };

  runInNewContext(script, { document, FEED_DATA: testFeed, URL });
  return { meta, tbody };
}

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

describe("catalog rendering", () => {
  it("renders missing optional prices as unavailable", () => {
    const { tbody } = renderCatalog({
      feed_version: "test",
      as_of: "2026-07-13",
      providers: [],
      offerings: [{
        id: "test:missing-price",
        modelId: "test/missing-price",
        providerId: "test",
        endpointId: "test:api",
        upstreamModelId: "missing-price",
        status: "active",
        declaredCapabilities: {},
        pricing: {
          currency: { normalized: "USD" },
          asOf: "2026-07-13",
        },
      }],
    });

    assert.equal(tbody.children.length, 1);
    assert.equal(tbody.children[0].children[2].textContent, "-");
    assert.equal(tbody.children[0].children[3].textContent, "-");
  });

  it("does not link evidence URLs with an unsafe protocol", () => {
    const unsafeUrl = "javascript:alert('catalog')";
    const { tbody } = renderCatalog({
      feed_version: "test",
      as_of: "2026-07-13",
      providers: [],
      offerings: [{
        id: "test:unsafe-evidence",
        modelId: "test/unsafe-evidence",
        providerId: "test",
        endpointId: "test:api",
        upstreamModelId: "unsafe-evidence",
        status: "active",
        declaredCapabilities: {},
        pricing: {
          currency: { normalized: "USD" },
          asOf: "2026-07-13",
          evidence: { sourceUrl: unsafeUrl },
        },
      }],
    });

    const evidenceCell = tbody.children[0].children[7];
    assert.equal(evidenceCell.children.length, 0);
    assert.equal(evidenceCell.textContent, unsafeUrl);
  });

  it("links HTTP evidence URLs", () => {
    const sourceUrl = "https://evidence.example/source";
    const { tbody } = renderCatalog({
      feed_version: "test",
      as_of: "2026-07-13",
      providers: [],
      offerings: [{
        id: "test:safe-evidence",
        modelId: "test/safe-evidence",
        providerId: "test",
        endpointId: "test:api",
        upstreamModelId: "safe-evidence",
        status: "active",
        declaredCapabilities: {},
        pricing: {
          currency: { normalized: "USD" },
          asOf: "2026-07-13",
          evidence: { sourceUrl },
        },
      }],
    });

    const evidenceCell = tbody.children[0].children[7];
    const link = evidenceCell.children[0].children[0];
    assert.equal(link.tagName, "A");
    assert.equal(link.href, sourceUrl);
  });
});
