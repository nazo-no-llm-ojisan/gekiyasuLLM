import type { ProxyConfig } from "../config.js";

/** Resolved destination for one Offering id (feed later; static map for now). */
export type OfferingTarget = {
  id: string;
  baseUrl: string;
  upstreamModelId?: string;
};

/** MVP catalog: sole passthrough offering → configured upstream base. */
export const PASSTHROUGH_OFFERING_ID = "passthrough:default";

export function buildOfferingCatalog(config: ProxyConfig): Map<string, OfferingTarget> {
  const map = new Map<string, OfferingTarget>();
  map.set(PASSTHROUGH_OFFERING_ID, {
    id: PASSTHROUGH_OFFERING_ID,
    baseUrl: config.upstreamBaseUrl,
  });
  return map;
}
