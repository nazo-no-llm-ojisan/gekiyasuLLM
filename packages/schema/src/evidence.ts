/**
 * Provenance / evidence for any field that can be wrong later.
 * Attach to pricing, context length, free tier, ToS notes, etc.
 */

export type SourceType =
  | "official"
  | "provider_api"
  | "manual"
  | "observed"
  | "community";

export type Confidence = "confirmed" | "inferred" | "unverified";

export type Evidence = {
  sourceUrl: string;
  retrievedAt: string;
  sourceType: SourceType;
  rawSnapshotHash?: string;
  parserId?: string;
  parserVersion?: string;
  confidence: Confidence;
  notes?: string;
};

/**
 * A value with raw form, normalized form, and conversion trail.
 * Normalization bugs are the highest-risk class of feed errors.
 */
export type TrackedValue<TNormalized, TRaw = string> = {
  raw: TRaw;
  normalized: TNormalized;
  /** e.g. "per_1k_to_per_million", "jpy_to_usd@rate=..." */
  conversionFormula?: string;
  evidence: Evidence;
  parserId?: string;
  parserVersion?: string;
};

export type Provenanced<T> = {
  value: T;
  evidence: Evidence;
};
