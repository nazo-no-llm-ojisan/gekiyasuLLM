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
  /**
   * If undefined, trust is unknown. T-046 / T-044-prep:
   * privateMode=true なら unknown は fail-closed で除外する。
   * privateMode=false なら unknown でも許容（現状動作を維持）。
   */
  allowsPrivateCode?: boolean;
  /**
   * Upstream API shape offered by this endpoint. Catalog populates this from
   * the feed (or hard-codes "openai_chat" for the passthrough target).
   * Used by T-045 to fail-closed on non-openai_chat in MVP.
   */
  apiCompat?: "openai_chat" | "openai_responses" | "anthropic_messages" | "gemini" | "other";
  /**
   * Logical model id (canonical, e.g. "provider-a/model-x"). Used by T-044
   * for strict-match against `RequestFacts.requestedModel`. Free of any
   * alias / upstream-specific naming. Catalog may also set `aliases`.
   */
  modelId?: string;
  /** Optional alternate names for the same logical model (e.g. "gpt-4o-mini"). */
  aliases?: string[];
  /** What the upstream actually expects in the body `model` field. */
  upstreamModelId?: string;
  free?: boolean;
  inputPerMillion?: number;
  /** Estimated USD for this request (same unit as HardConstraints.maxCostPerRequest). */
  estimatedCostPerRequest?: number;
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
  // Hard constraints are fail-closed: require explicit true / known values.
  if (constraints.requireTools && c.tools !== true) {
    return "require_tools";
  }
  if (constraints.requireVision && c.vision !== true) {
    return "require_vision";
  }
  if (constraints.requireStreaming && c.streaming !== true) {
    return "require_streaming";
  }
  if (
    constraints.minContextWindow != null &&
    (c.contextWindow == null || c.contextWindow < constraints.minContextWindow)
  ) {
    return "min_context_window";
  }
  if (constraints.privateMode && c.allowsPrivateCode !== true) {
    // Fail-closed: `undefined` (unknown trust) is treated the same as `false`.
    return "private_mode";
  }
  if (constraints.requireEditorialRankNone === true) {
    if (c.editorialRankInfluence !== "none") {
      return "editorial_rank_influence";
    }
  } else if (
    c.editorialRankInfluence != null &&
    c.editorialRankInfluence !== "none"
  ) {
    // Explicit non-none influence always blocked when present
    return "editorial_rank_influence";
  }
  // maxCostPerRequest compares estimated USD per request only — never $/M tokens.
  if (constraints.maxCostPerRequest != null) {
    if (c.estimatedCostPerRequest == null) {
      return "max_cost_unknown";
    }
    if (c.estimatedCostPerRequest > constraints.maxCostPerRequest) {
      return "max_cost_per_request";
    }
  }
  return null;
}

/**
 * Soft preferences: stable sort.
 * Default strategy (after preferFree): lower inputPerMillion, then id.
 * preferLowCachePrice only affects order when both have cache prices later;
 * it must NOT be `|| true` (was a bug that always forced price sort under wrong name).
 */
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
    // Default cost ordering by input $/M (explicit product default, not tied to preferLowCachePrice)
    const ap = a.inputPerMillion ?? Number.POSITIVE_INFINITY;
    const bp = b.inputPerMillion ?? Number.POSITIVE_INFINITY;
    if (ap !== bp) return ap - bp;
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
