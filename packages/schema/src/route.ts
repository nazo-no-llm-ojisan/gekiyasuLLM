/**
 * Routing produces a plan first; execution is separate (testable without HTTP).
 */

/**
 * Lightweight, proxy-agnostic summary of what the client asked for.
 * Extracted once in the request-handling layer (server.ts or
 * request-facts.ts) and consumed downstream by the router. Keeping this
 * here means `plan.ts` and `executor.ts` never have to read HTTP / body
 * themselves (T-044-prep).
 */
export type RequestFacts = {
  /** client body の model、または X-Gekiyasu-Model 等で上書きされた値。 */
  requestedModel?: string;
  /** client が `stream: true` を期待しているか（true のとき streaming 必須） */
  streaming?: boolean;
  /** body の `tools` 配列が非空か。空/undefined のときは制約を課さない */
  requiresTools?: boolean;
  /** body の `messages[*].content` に image / `image_url` が含まれるか */
  requiresVision?: boolean;
};

export type RouteReason = string;

export type RoutePlan = {
  /** Offering ids */
  primary: string;
  fallbacks: string[];
  reason: RouteReason[];
  /** Optional structured estimates */
  estimatedCost?: {
    offeringId: string;
    effectiveCharge: number;
    currency: string;
  }[];
  generatedAt: string;
};

export type HardConstraints = {
  requireTools?: boolean;
  requireVision?: boolean;
  requireStreaming?: boolean;
  minContextWindow?: number;
  maxCostPerRequest?: number;
  privateMode?: boolean;
  allowlistOfferingIds?: string[];
  denylistOfferingIds?: string[];
  allowlistProviderIds?: string[];
  denylistProviderIds?: string[];
  requireEditorialRankNone?: boolean;
};

export type SoftPreferences = {
  preferFree?: boolean;
  preferLowTtft?: boolean;
  preferLowCachePrice?: boolean;
  preferHighAvailability?: boolean;
};
