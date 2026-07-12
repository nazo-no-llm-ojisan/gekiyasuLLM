import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { RoutePlan } from "@gekiyasu/schema";
import { buildRoutePlan } from "./plan.js";
import {
  describeExecution,
  resolvePrimaryTarget,
} from "./executor.js";
import type { OfferingTarget } from "./catalog.js";

function planFor(primary: string): RoutePlan {
  return buildRoutePlan({ soleOfferingId: primary });
}

describe("resolvePrimaryTarget", () => {
  it("uses plan.primary from the catalog (not a side path)", () => {
    const catalog = new Map<string, OfferingTarget>([
      [
        "passthrough:default",
        { id: "passthrough:default", baseUrl: "https://api.openai.com/v1" },
      ],
      [
        "other:offering",
        { id: "other:offering", baseUrl: "https://other.example/v1" },
      ],
    ]);
    const plan = planFor("other:offering");
    const target = resolvePrimaryTarget(plan, catalog);
    assert.equal(target.id, "other:offering");
    assert.equal(target.baseUrl, "https://other.example/v1");
    assert.equal(plan.primary, "other:offering");
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
