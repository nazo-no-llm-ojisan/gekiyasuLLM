import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildRoutePlan } from "./plan.js";

describe("buildRoutePlan", () => {
  it("selects the sole eligible offering as primary with empty fallbacks", () => {
    // MVP: caller supplies the already-eligible sole offering id (hard filter stub).
    const eligibleId = "openrouter:minimax/minimax-m3:free";
    const plan = buildRoutePlan({ soleOfferingId: eligibleId });

    assert.equal(plan.primary, eligibleId);
    assert.deepEqual(plan.fallbacks, []);
    assert.ok(Array.isArray(plan.reason));
    assert.equal(typeof plan.generatedAt, "string");
  });
});
