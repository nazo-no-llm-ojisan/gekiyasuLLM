import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { parseOfferingJson } from "./parse-offering.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(here, "../../../fixtures/offerings/one-fixed-price.json");

describe("parseOfferingJson", () => {
  it("parses one fixed-price offering from fixture", () => {
    const raw = JSON.parse(readFileSync(fixturePath, "utf8")) as unknown;
    const offering = parseOfferingJson(raw);

    assert.equal(offering.id, "example:gpt-mini:fixed");
    assert.equal(offering.modelId, "example/gpt-mini");
    assert.equal(offering.providerId, "example");
    assert.equal(offering.endpointId, "example:api");
    assert.equal(offering.upstreamModelId, "gpt-mini");

    assert.ok(offering.pricing);
    assert.equal(offering.pricing.currency.normalized, "USD");
    assert.equal(offering.pricing.inputPerMillion?.normalized, 0.15);
    assert.equal(offering.pricing.outputPerMillion?.normalized, 0.6);

    assert.equal(offering.relationships.sponsored, false);
    assert.equal(offering.relationships.affiliate, false);
    assert.equal(offering.relationships.editorial_rank_influence, "none");
  });

  it("rejects missing pricing", () => {
    assert.throws(
      () =>
        parseOfferingJson({
          id: "x",
          modelId: "m",
          providerId: "p",
          endpointId: "e",
          upstreamModelId: "u",
          declaredCapabilities: {},
          relationships: {
            sponsored: false,
            affiliate: false,
            editorial_rank_influence: "none",
          },
        }),
      /pricing/,
    );
  });
});
