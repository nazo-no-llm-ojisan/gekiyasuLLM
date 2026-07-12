import type { ProxyConfig } from "../config.js";
import type { RouteCandidate } from "./plan.js";

/** Resolved destination for one Offering id (feed later; static map for now). */
export type OfferingTarget = RouteCandidate & {
  baseUrl: string;
  upstreamModelId?: string;
};

/** MVP catalog: sole passthrough offering → configured upstream base. */
export const PASSTHROUGH_OFFERING_ID = "passthrough:default";

export function buildOfferingCatalog(
  config: ProxyConfig,
): Map<string, OfferingTarget> {
  const map = new Map<string, OfferingTarget>();
  map.set(PASSTHROUGH_OFFERING_ID, {
    id: PASSTHROUGH_OFFERING_ID,
    providerId: "local-config",
    baseUrl: config.upstreamBaseUrl,
    tools: true,
    streaming: true,
    free: false,
    allowsPrivateCode: true,
    editorialRankInfluence: "none",
  });
  return map;
}

/** Catalog values as route candidates (for plan input). */
export function candidatesFromCatalog(
  catalog: Map<string, OfferingTarget>,
): RouteCandidate[] {
  return [...catalog.values()];
}
