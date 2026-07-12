/**
 * Routing produces a plan first; execution is separate (testable without HTTP).
 */

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
