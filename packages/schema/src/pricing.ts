import type { Evidence, TrackedValue } from "./evidence.js";

export type CurrencyCode = "USD" | "JPY" | "CNY";

/** Internal unified pricing unit: amounts per 1M tokens unless noted. */
export type NormalizedPricing = {
  currency: CurrencyCode;
  inputPerMillion?: number;
  cachedInputPerMillion?: number;
  cacheWritePerMillion?: number;
  outputPerMillion?: number;
  perRequest?: number;
  minimumCharge?: number;
  asOf: string;
};

export type PricingRecord = {
  /** Fully traced fields preferred over bare numbers. */
  inputPerMillion?: TrackedValue<number>;
  cachedInputPerMillion?: TrackedValue<number>;
  cacheWritePerMillion?: TrackedValue<number>;
  outputPerMillion?: TrackedValue<number>;
  perRequest?: TrackedValue<number>;
  minimumCharge?: TrackedValue<number>;
  currency: TrackedValue<CurrencyCode>;
  asOf: string;
  /** Convenience snapshot for routers; recompute from tracked fields when unsure. */
  normalized?: NormalizedPricing;
  evidence?: Evidence;
};

export type UsageEstimate = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  requestCount?: number;
};

/** Free balance / credits — not part of model list price. */
export type AccountCredit = {
  providerId: string;
  accountKey?: string;
  remaining?: number;
  currency?: CurrencyCode;
  expiresAt?: string;
  verifiedAt?: string;
  evidence?: Evidence;
};

export type AccountState = {
  providerId: string;
  credits?: AccountCredit[];
  /** User-declared or unknown remaining free quota */
  freeRemainingUnknown?: boolean;
};

export type CostEstimate = {
  currency: CurrencyCode;
  estimatedCharge: number;
  /** 0 when covered by free credit (if known) */
  effectiveCharge: number;
  breakdown: {
    input?: number;
    output?: number;
    cacheRead?: number;
    cacheWrite?: number;
    perRequest?: number;
    minimumApplied?: number;
    freeCreditApplied?: number;
  };
  confidence: "high" | "medium" | "low";
  notes?: string[];
};
