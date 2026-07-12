import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildRoutePlan,
  filterCandidates,
  rankCandidates,
  type RouteCandidate,
} from "./plan.js";

const A: RouteCandidate = {
  id: "paid:tools",
  providerId: "official",
  tools: true,
  free: false,
  inputPerMillion: 1,
  allowsPrivateCode: true,
  editorialRankInfluence: "none",
  contextWindow: 128_000,
};

const B: RouteCandidate = {
  id: "free:no-tools",
  providerId: "gateway",
  tools: false,
  free: true,
  inputPerMillion: 0,
  allowsPrivateCode: false,
  editorialRankInfluence: "none",
  contextWindow: 32_000,
};

describe("filterCandidates", () => {
  it("drops candidates that fail requireTools", () => {
    const { eligible, rejected } = filterCandidates([A, B], {
      requireTools: true,
    });
    assert.deepEqual(
      eligible.map((c) => c.id),
      ["paid:tools"],
    );
    assert.equal(rejected[0]?.reason, "require_tools");
  });

  it("privateMode requires allowsPrivateCode", () => {
    const { eligible } = filterCandidates([A, B], { privateMode: true });
    assert.deepEqual(
      eligible.map((c) => c.id),
      ["paid:tools"],
    );
  });
});

describe("rankCandidates", () => {
  it("preferFree puts free first", () => {
    const ranked = rankCandidates([A, B], { preferFree: true });
    assert.equal(ranked[0]?.id, "free:no-tools");
  });
});

describe("buildRoutePlan", () => {
  it("selects the sole eligible offering as primary with empty fallbacks", () => {
    const plan = buildRoutePlan({ soleOfferingId: "openrouter:minimax/minimax-m3:free" });
    assert.equal(plan.primary, "openrouter:minimax/minimax-m3:free");
    assert.deepEqual(plan.fallbacks, []);
  });

  it("two candidates: free primary, paid fallback when tools not required", () => {
    const plan = buildRoutePlan({
      candidates: [A, B],
      preferences: { preferFree: true },
    });
    assert.equal(plan.primary, "free:no-tools");
    assert.deepEqual(plan.fallbacks, ["paid:tools"]);
  });

  it("two candidates: requireTools leaves paid primary only", () => {
    const plan = buildRoutePlan({
      candidates: [A, B],
      constraints: { requireTools: true },
      preferences: { preferFree: true },
    });
    assert.equal(plan.primary, "paid:tools");
    assert.deepEqual(plan.fallbacks, []);
  });

  it("throws when nothing eligible", () => {
    assert.throws(
      () =>
        buildRoutePlan({
          candidates: [B],
          constraints: { requireTools: true },
        }),
      /No eligible offerings/,
    );
  });
});
