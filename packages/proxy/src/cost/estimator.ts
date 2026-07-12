import type { PricingRecord, UsageEstimate, CostEstimate, CurrencyCode } from "@gekiyasu/schema";

// Helper to avoid floating point errors like 2.1599999999999997
const roundCost = (v: number): number => {
  return Math.round(v * 1e10) / 1e10;
};

/**
 * Estimate the cost of an LLM request based on the pricing record and usage.
 * L9 focus: input/output token count estimation.
 */
export function estimateCost(
  pricing: PricingRecord | undefined,
  usage: UsageEstimate,
): CostEstimate {
  // 1. Currency fallback
  let currency: CurrencyCode = "USD";
  if (pricing?.currency?.normalized) {
    currency = pricing.currency.normalized;
  } else if (pricing?.normalized?.currency) {
    currency = pricing.normalized.currency;
  }

  // 2. Unit extraction helper (extracts normalized value from TrackedValue or snapshot)
  const extractUnit = (
    field: "inputPerMillion" | "outputPerMillion" | "cachedInputPerMillion" | "cacheWritePerMillion" | "perRequest" | "minimumCharge",
  ): number => {
    if (pricing?.[field]?.normalized != null) {
      return pricing[field].normalized as number;
    }
    if (pricing?.normalized?.[field] != null) {
      return pricing.normalized[field] as number;
    }
    return 0;
  };

  const inputPerMillion = extractUnit("inputPerMillion");
  const outputPerMillion = extractUnit("outputPerMillion");
  const cachedInputPerMillion = extractUnit("cachedInputPerMillion");
  const cacheWritePerMillion = extractUnit("cacheWritePerMillion");
  const perRequest = extractUnit("perRequest");
  const minimumCharge = extractUnit("minimumCharge");

  // 3. Cost calculations
  const inputCost = roundCost((usage.inputTokens / 1_000_000) * inputPerMillion);
  const outputCost = roundCost((usage.outputTokens / 1_000_000) * outputPerMillion);
  const cacheReadCost = roundCost(((usage.cacheReadTokens ?? 0) / 1_000_000) * cachedInputPerMillion);
  const cacheWriteCost = roundCost(((usage.cacheWriteTokens ?? 0) / 1_000_000) * cacheWritePerMillion);
  const perRequestCost = roundCost((usage.requestCount ?? 1) * perRequest);

  const totalBaseCost = roundCost(inputCost + outputCost + cacheReadCost + cacheWriteCost + perRequestCost);

  // 4. Minimum charge application
  let minimumApplied = 0;
  let estimatedCharge = totalBaseCost;
  const notes: string[] = [];

  if (minimumCharge > 0 && totalBaseCost < minimumCharge) {
    estimatedCharge = minimumCharge;
    minimumApplied = roundCost(minimumCharge - totalBaseCost);
    notes.push(`Minimum charge of ${minimumCharge} ${currency} applied (base cost: ${totalBaseCost.toFixed(6)})`);
  }

  // 5. Confidence determination
  let confidence: "high" | "medium" | "low" = "low";
  if (pricing) {
    const evidenceConfidence = pricing.evidence?.confidence;
    if (evidenceConfidence === "confirmed") {
      confidence = "high";
    } else if (evidenceConfidence === "inferred") {
      confidence = "medium";
    } else {
      confidence = "low";
    }
  }

  return {
    currency,
    estimatedCharge,
    effectiveCharge: estimatedCharge,
    breakdown: {
      input: inputCost,
      output: outputCost,
      cacheRead: cacheReadCost > 0 ? cacheReadCost : undefined,
      cacheWrite: cacheWriteCost > 0 ? cacheWriteCost : undefined,
      perRequest: perRequestCost > 0 ? perRequestCost : undefined,
      minimumApplied: minimumApplied > 0 ? minimumApplied : undefined,
    },
    confidence,
    notes: notes.length > 0 ? notes : undefined,
  };
}
