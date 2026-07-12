import type { HardConstraints, RoutePlan, SoftPreferences } from "@gekiyasu/schema";

/**
 * CandidateFilter → CandidateScorer → RoutePlan (no HTTP).
 * MVP: single fixed offering; real scoring lands later.
 */
export type PlanInput = {
  /** Temporary: single passthrough offering id until feed-driven routing exists */
  soleOfferingId: string;
  constraints?: HardConstraints;
  preferences?: SoftPreferences;
};

export function buildRoutePlan(input: PlanInput): RoutePlan {
  const reason: string[] = ["mvp_passthrough=true", `offering=${input.soleOfferingId}`];
  if (input.constraints?.privateMode) {
    reason.push("private_mode=true");
  }
  if (input.preferences?.preferFree) {
    reason.push("prefer_free=true");
  }

  return {
    primary: input.soleOfferingId,
    fallbacks: [],
    reason,
    generatedAt: new Date().toISOString(),
  };
}
