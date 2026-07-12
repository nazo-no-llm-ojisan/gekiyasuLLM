import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildRoutePlan,
  filterCandidates,
  rankCandidates,
  selectCandidatesForRequestedModel,
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

describe("apiCompat fail-closed (T-045)", () => {
  it("rejects offerings whose apiCompat is not openai_chat", () => {
    const candidates: RouteCandidate[] = [
      { id: "ok", providerId: "p1", apiCompat: "openai_chat" },
      { id: "anthropic", providerId: "p2", apiCompat: "anthropic_messages" },
      { id: "responses", providerId: "p3", apiCompat: "openai_responses" },
      { id: "gemini", providerId: "p4", apiCompat: "gemini" },
      { id: "other", providerId: "p5", apiCompat: "other" },
    ];
    const { eligible, rejected } = filterCandidates(candidates, {});
    assert.deepEqual(
      eligible.map((c) => c.id),
      ["ok"],
    );
    const byId = new Map(rejected.map((r) => [r.id, r.reason]));
    for (const id of ["anthropic", "responses", "gemini", "other"]) {
      assert.equal(byId.get(id), "api_compat_unsupported", id);
    }
  });

  it("passes offerings with undefined apiCompat (passthrough + legacy)", () => {
    const candidates: RouteCandidate[] = [
      { id: "passthrough", providerId: "local-config" },
      { id: "legacy", providerId: "p2" },
    ];
    const { eligible, rejected } = filterCandidates(candidates, {});
    assert.equal(rejected.length, 0);
    assert.deepEqual(
      eligible.map((c) => c.id),
      ["passthrough", "legacy"],
    );
  });
});

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

describe("selectCandidatesForRequestedModel (T-044)", () => {
  it("returns only candidates whose modelId matches the requested one", () => {
    const out = selectCandidatesForRequestedModel(
      [
        { id: "a", providerId: "p1", modelId: "gpt-4o-mini" },
        { id: "b", providerId: "p2", modelId: "other-model" },
        { id: "c", providerId: "p3", modelId: "gpt-4o-mini" },
      ],
      "gpt-4o-mini",
    );
    assert.deepEqual(
      out.map((c) => c.id),
      ["a", "c"],
    );
  });

  it("includes candidates whose aliases list contains the requested model", () => {
    const out = selectCandidatesForRequestedModel(
      [
        { id: "a", providerId: "p1", modelId: "minimax-m3", aliases: ["gpt-4o-mini"] },
        { id: "b", providerId: "p2", modelId: "other-model" },
      ],
      "gpt-4o-mini",
    );
    assert.deepEqual(
      out.map((c) => c.id),
      ["a"],
    );
  });

  it("drops candidates with neither modelId nor aliases", () => {
    const out = selectCandidatesForRequestedModel(
      [
        { id: "a", providerId: "p1" },
        { id: "b", providerId: "p2", modelId: "x" },
      ],
      "x",
    );
    assert.deepEqual(
      out.map((c) => c.id),
      ["b"],
    );
  });

  it("returns the input unchanged when requestedModel is undefined", () => {
    const candidates: RouteCandidate[] = [
      { id: "a", providerId: "p1" },
      { id: "b", providerId: "p2" },
    ];
    const out = selectCandidatesForRequestedModel(candidates, undefined);
    assert.equal(out, candidates);
  });
});

describe("rankCandidates", () => {
  it("preferFree puts free first", () => {
    const ranked = rankCandidates([A, B], { preferFree: true });
    assert.equal(ranked[0]?.id, "free:no-tools");
  });

  it("defaults to lower inputPerMillion without preferLowCachePrice flag", () => {
    const ranked = rankCandidates([A, B], { preferFree: false });
    assert.equal(ranked[0]?.id, "free:no-tools"); // 0 < 1
    assert.equal(ranked[1]?.id, "paid:tools");
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
