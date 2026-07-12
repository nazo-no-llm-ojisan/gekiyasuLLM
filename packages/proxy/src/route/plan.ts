import type {
  HardConstraints,
  RoutePlan,
  SoftPreferences,
} from "@gekiyasu/schema";

/**
 * Candidate after hard filter, before / for scoring.
 * Subset of Offering fields needed for MVP routing.
 */
export type RouteCandidate = {
  id: string;
  providerId: string;
  /** Used later by executor catalog; plan itself only needs id. */
  baseUrl?: string;
  tools?: boolean;
  vision?: boolean;
  streaming?: boolean;
  contextWindow?: number;
  allowsPrivateCode?: boolean;
  free?: boolean;
  inputPerMillion?: number;
  editorialRankInfluence?: "none" | string;
};

export type PlanInput = {
  /** Preferred. At least one of candidates or soleOfferingId required. */
  candidates?: RouteCandidate[];
  constraints?: HardConstraints;
  preferences?: SoftPreferences;
  /**
   * @deprecated Prefer `candidates: [{ id }]`. Kept for older tests/callers.
   */
  soleOfferingId?: string;
};

export type FilterResult = {
  eligible: RouteCandidate[];
  rejected: { id: string; reason: string }[];
};

/** Hard constraints only — no ranking. */
export function filterCandidates(
  candidates: RouteCandidate[],
  constraints: HardConstraints = {},
): FilterResult {
  const rejected: { id: string; reason: string }[] = [];
  const eligible: RouteCandidate[] = [];

  for (const c of candidates) {
    const reason = hardRejectReason(c, constraints);
    if (reason) {
      rejected.push({ id: c.id, reason });
    } else {
      eligible.push(c);
    }
  }
  return { eligible, rejected };
}

function hardRejectReason(
  c: RouteCandidate,
  constraints: HardConstraints,
): string | null {
  if (constraints.denylistOfferingIds?.includes(c.id)) {
    return "denylist_offering";
  }
  if (
    constraints.allowlistOfferingIds &&
    constraints.allowlistOfferingIds.length > 0 &&
    !constraints.allowlistOfferingIds.includes(c.id)
  ) {
    return "not_in_offering_allowlist";
  }
  if (constraints.denylistProviderIds?.includes(c.providerId)) {
    return "denylist_provider";
  }
  if (
    constraints.allowlistProviderIds &&
    constraints.allowlistProviderIds.length > 0 &&
    !constraints.allowlistProviderIds.includes(c.providerId)
  ) {
    return "not_in_provider_allowlist";
  }
  if (constraints.requireTools && c.tools !== true) {
    return "require_tools";
  }
  if (constraints.requireVision && c.vision !== true) {
    return "require_vision";
  }
  if (constraints.requireStreaming && c.streaming === false) {
    return "require_streaming";
  }
  if (
    constraints.minContextWindow != null &&
    (c.contextWindow == null || c.contextWindow < constraints.minContextWindow)
  ) {
    return "min_context_window";
  }
  if (constraints.privateMode && c.allowsPrivateCode !== true) {
    return "private_mode";
  }
  if (
    constraints.requireEditorialRankNone !== false &&
    c.editorialRankInfluence != null &&
    c.editorialRankInfluence !== "none"
  ) {
    // Default: block non-none rank influence when field is present and not none
    return "editorial_rank_influence";
  }
  if (
    constraints.requireEditorialRankNone === true &&
    c.editorialRankInfluence !== "none" &&
    c.editorialRankInfluence != null
  ) {
    return "editorial_rank_influence";
  }
  if (
    constraints.maxCostPerRequest != null &&
    c.inputPerMillion != null &&
    c.inputPerMillion > constraints.maxCostPerRequest
  ) {
    // crude proxy for "too expensive per M input" when used as budget stand-in
    return "max_cost_per_request";
  }
  return null;
}

/** Soft preferences: stable sort. */
export function rankCandidates(
  eligible: RouteCandidate[],
  preferences: SoftPreferences = {},
): RouteCandidate[] {
  return [...eligible].sort((a, b) => {
    if (preferences.preferFree) {
      const af = a.free ? 0 : 1;
      const bf = b.free ? 0 : 1;
      if (af !== bf) return af - bf;
    }
    if (preferences.preferLowCachePrice || true) {
      // default cost-ish: lower inputPerMillion first; unknown last
      const ap = a.inputPerMillion ?? Number.POSITIVE_INFINITY;
      const bp = b.inputPerMillion ?? Number.POSITIVE_INFINITY;
      if (ap !== bp) return ap - bp;
    }
    return a.id.localeCompare(b.id);
  });
}

/**
 * CandidateFilter → CandidateScorer → RoutePlan (no HTTP).
 */
export function buildRoutePlan(input: PlanInput): RoutePlan {
  let candidates = input.candidates;
  if ((!candidates || candidates.length === 0) && input.soleOfferingId) {
    candidates = [
      {
        id: input.soleOfferingId,
        providerId: "unknown",
      },
    ];
  }
  if (!candidates || candidates.length === 0) {
    throw new Error("No candidates for route plan");
  }

  const constraints = input.constraints ?? {};
  const preferences = input.preferences ?? { preferFree: true };

  const { eligible, rejected } = filterCandidates(candidates, constraints);
  if (eligible.length === 0) {
    const detail = rejected.map((r) => `${r.id}:${r.reason}`).join("; ");
    throw new Error(`No eligible offerings after hard filter (${detail})`);
  }

  const ranked = rankCandidates(eligible, preferences);
  const primary = ranked[0]!.id;
  const fallbacks = ranked.slice(1).map((c) => c.id);

  const reason: string[] = [
    `eligible=${eligible.length}`,
    `rejected=${rejected.length}`,
    `primary=${primary}`,
  ];
  if (preferences.preferFree) reason.push("prefer_free=true");
  if (constraints.requireTools) reason.push("require_tools=true");
  if (constraints.privateMode) reason.push("private_mode=true");
  for (const r of rejected.slice(0, 5)) {
    reason.push(`reject:${r.id}=${r.reason}`);
  }

  return {
    primary,
    fallbacks,
    reason,
    generatedAt: new Date().toISOString(),
  };
}
