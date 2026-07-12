import type { HardConstraints, RoutePlan, SoftPreferences } from "@gekiyasu/schema";

/**
 * CandidateFilter → CandidateScorer → RoutePlan (no HTTP).
 * MVP: caller supplies the sole already-eligible offering id (hard-filter stub).
 * Result: primary = that id, fallbacks = [] (no ranked alternatives yet).
 */
export type PlanInput = {
  /**
   * Sole eligible offering id after hard constraints (filter stub).
   * Until feed-driven routing exists, this is passthrough selection.
   */
  soleOfferingId: string;
  constraints?: HardConstraints;
  preferences?: SoftPreferences;
};

export function buildRoutePlan(input: PlanInput): RoutePlan {
  // Sole eligible offering → primary; no fallbacks until multi-candidate ranking exists.
  const primary = input.soleOfferingId;
  const reason: string[] = [
    "eligible_sole=true",
    `offering=${primary}`,
  ];
  if (input.constraints?.privateMode) {
    reason.push("private_mode=true");
  }
  if (input.preferences?.preferFree) {
    reason.push("prefer_free=true");
  }

  return {
    primary,
    fallbacks: [],
    reason,
    generatedAt: new Date().toISOString(),
  };
}
