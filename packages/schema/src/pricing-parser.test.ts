import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { parseOpenAIPricingHtml } from "./pricing-parser.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(
  here,
  "../../../fixtures/pricing/openai-official/2026-07-13.html",
);

describe("parseOpenAIPricingHtml", () => {
  it("parses all four models from the fixture", () => {
    const html = readFileSync(fixturePath, "utf8");
    const result = parseOpenAIPricingHtml(html, "2026-07-13");

    assert.equal(result.length, 4);

    // gpt-4o
    const gpt4o = result.find((r) => r.modelId === "gpt-4o");
    assert.ok(gpt4o, "gpt-4o should be present");
    assert.equal(gpt4o.inputPerMillion, 2.5);
    assert.equal(gpt4o.outputPerMillion, 10);
    assert.equal(gpt4o.cachedInputPerMillion, 1.25);
    assert.equal(gpt4o.asOf, "2026-07-13");

    // gpt-4o-mini
    const gpt4oMini = result.find((r) => r.modelId === "gpt-4o-mini");
    assert.ok(gpt4oMini, "gpt-4o-mini should be present");
    assert.equal(gpt4oMini.inputPerMillion, 0.15);
    assert.equal(gpt4oMini.outputPerMillion, 0.6);
    assert.equal(gpt4oMini.cachedInputPerMillion, 0.075);

    // gpt-4-turbo — cached is "—" so should be undefined
    const gpt4Turbo = result.find((r) => r.modelId === "gpt-4-turbo");
    assert.ok(gpt4Turbo, "gpt-4-turbo should be present");
    assert.equal(gpt4Turbo.inputPerMillion, 10);
    assert.equal(gpt4Turbo.outputPerMillion, 30);
    assert.equal(gpt4Turbo.cachedInputPerMillion, undefined);

    // o1
    const o1 = result.find((r) => r.modelId === "o1");
    assert.ok(o1, "o1 should be present");
    assert.equal(o1.inputPerMillion, 15);
    assert.equal(o1.outputPerMillion, 60);
    assert.equal(o1.cachedInputPerMillion, 7.5);
  });

  it("returns empty array for HTML with no pricing table", () => {
    const result = parseOpenAIPricingHtml(
      "<html><body><p>No pricing here</p></body></html>",
      "2026-07-13",
    );
    assert.equal(result.length, 0);
  });
});
