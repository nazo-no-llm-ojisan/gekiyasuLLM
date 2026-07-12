import test from "node:test";
import assert from "node:assert";
import { estimateCost } from "./estimator.js";
import type { PricingRecord, UsageEstimate } from "@gekiyasu/schema";

test("estimateCost - basic input/output calculation with normalized pricing", () => {
  const pricing: PricingRecord = {
    currency: {
      raw: "USD",
      normalized: "USD",
      evidence: { sourceUrl: "", retrievedAt: "", sourceType: "manual", confidence: "confirmed" }
    },
    asOf: "2026-07-12",
    normalized: {
      currency: "USD",
      inputPerMillion: 10,
      outputPerMillion: 30,
      asOf: "2026-07-12"
    }
  };

  const usage: UsageEstimate = {
    inputTokens: 100_000,
    outputTokens: 200_000,
  };

  const res = estimateCost(pricing, usage);

  assert.strictEqual(res.currency, "USD");
  assert.strictEqual(res.estimatedCharge, 7.00);
  assert.strictEqual(res.effectiveCharge, 7.00);
  assert.strictEqual(res.breakdown.input, 1.00);
  assert.strictEqual(res.breakdown.output, 6.00);
  assert.strictEqual(res.confidence, "low");
});

test("estimateCost - calculation using TrackedValue fields", () => {
  const pricing: PricingRecord = {
    currency: {
      raw: "JPY",
      normalized: "JPY",
      evidence: { sourceUrl: "", retrievedAt: "", sourceType: "manual", confidence: "confirmed" }
    },
    asOf: "2026-07-12",
    inputPerMillion: {
      raw: "100",
      normalized: 100,
      evidence: { sourceUrl: "", retrievedAt: "", sourceType: "manual", confidence: "confirmed" }
    },
    outputPerMillion: {
      raw: "300",
      normalized: 300,
      evidence: { sourceUrl: "", retrievedAt: "", sourceType: "manual", confidence: "confirmed" }
    },
    evidence: {
      sourceUrl: "",
      retrievedAt: "",
      sourceType: "manual",
      confidence: "confirmed"
    }
  };

  const usage: UsageEstimate = {
    inputTokens: 50_000,
    outputTokens: 10_000,
  };

  const res = estimateCost(pricing, usage);

  assert.strictEqual(res.currency, "JPY");
  assert.strictEqual(res.estimatedCharge, 8);
  assert.strictEqual(res.effectiveCharge, 8);
  assert.strictEqual(res.breakdown.input, 5);
  assert.strictEqual(res.breakdown.output, 3);
  assert.strictEqual(res.confidence, "high");
});

test("estimateCost - free or undefined pricing", () => {
  const usage: UsageEstimate = {
    inputTokens: 100_000,
    outputTokens: 200_000,
  };

  const res = estimateCost(undefined, usage);

  assert.strictEqual(res.currency, "USD");
  assert.strictEqual(res.estimatedCharge, 0);
  assert.strictEqual(res.effectiveCharge, 0);
  assert.strictEqual(res.confidence, "low");
});

test("estimateCost - minimumCharge application", () => {
  const pricing: PricingRecord = {
    currency: {
      raw: "USD",
      normalized: "USD",
      evidence: { sourceUrl: "", retrievedAt: "", sourceType: "manual", confidence: "confirmed" }
    },
    asOf: "2026-07-12",
    normalized: {
      currency: "USD",
      inputPerMillion: 1,
      outputPerMillion: 2,
      minimumCharge: 0.50,
      asOf: "2026-07-12"
    }
  };

  const usage: UsageEstimate = {
    inputTokens: 50_000,
    outputTokens: 50_000,
  };

  const res = estimateCost(pricing, usage);

  assert.strictEqual(res.estimatedCharge, 0.50);
  assert.strictEqual(res.breakdown.minimumApplied, 0.35);
  assert.ok(res.notes && res.notes.length > 0);
});

test("estimateCost - request fee and cache charges", () => {
  const pricing: PricingRecord = {
    currency: {
      raw: "USD",
      normalized: "USD",
      evidence: { sourceUrl: "", retrievedAt: "", sourceType: "manual", confidence: "confirmed" }
    },
    asOf: "2026-07-12",
    normalized: {
      currency: "USD",
      inputPerMillion: 10,
      outputPerMillion: 20,
      cachedInputPerMillion: 2,
      cacheWritePerMillion: 5,
      perRequest: 0.01,
      asOf: "2026-07-12"
    }
  };

  const usage: UsageEstimate = {
    inputTokens: 100_000,
    outputTokens: 50_000,
    cacheReadTokens: 50_000,
    cacheWriteTokens: 10_000,
    requestCount: 1,
  };

  const res = estimateCost(pricing, usage);

  assert.strictEqual(res.estimatedCharge, 2.16);
  assert.strictEqual(res.breakdown.cacheRead, 0.10);
  assert.strictEqual(res.breakdown.cacheWrite, 0.05);
  assert.strictEqual(res.breakdown.perRequest, 0.01);
});
