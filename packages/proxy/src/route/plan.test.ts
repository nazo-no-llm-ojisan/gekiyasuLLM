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
  streaming: true,
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
  streaming: true,
  free: true,
  inputPerMillion: 0,
  allowsPrivateCode: false,
  editorialRankInfluence: "none",
  contextWindow: 32_000,
};

const C_unknown_stream: RouteCandidate = {
  id: "unknown-stream",
  providerId: "x",
  tools: true,
  // streaming intentionally undefined — requireStreaming must fail-closed
  free: false,
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

  it("requireStreaming fail-closed when streaming unknown", () => {
    const { eligible, rejected } = filterCandidates([C_unknown_stream], {
      requireStreaming: true,
    });
    assert.equal(eligible.length, 0);
    assert.equal(rejected[0]?.reason, "require_streaming");
  });

  it("maxCostPerRequest does not compare against $/M tokens", () => {
    const rich: RouteCandidate = {
      id: "rich",
      providerId: "p",
      tools: true,
      inputPerMillion: 100,
      estimatedCostPerRequest: 0.01,
    };
    const { eligible } = filterCandidates([rich], {
      maxCostPerRequest: 0.05,
    });
    assert.equal(eligible.length, 1);
    const { eligible: none } = filterCandidates(
      [{ ...rich, estimatedCostPerRequest: undefined }],
      { maxCostPerRequest: 0.05 },
    );
    assert.equal(none.length, 0);
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
