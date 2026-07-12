import { readFileSync, existsSync } from "node:fs";
import { parseFeedJson } from "@gekiyasu/schema";
import type { ProxyConfig } from "../config.js";
import type { RouteCandidate } from "./plan.js";
import { hostFromBaseUrl } from "../security.js";

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

  if (config.feedFile) {
    if (!existsSync(config.feedFile)) {
      throw new Error(`Feed file not found: ${config.feedFile}`);
    }
    const raw = JSON.parse(readFileSync(config.feedFile, "utf8"));
    const feed = parseFeedJson(raw);

    const endpointMap = new Map(feed.endpoints.map((e) => [e.id, e]));
    const providerMap = new Map(feed.providers?.map((p) => [p.id, p]) || []);
    const allowedHostsSet = new Set(config.allowedUpstreamHosts);

    for (const off of feed.offerings) {
      const ep = endpointMap.get(off.endpointId);
      if (!ep) {
        throw new Error(`Endpoint not found: ${off.endpointId} for offering ${off.id}`);
      }

      try {
        const host = hostFromBaseUrl(ep.baseUrl);
        allowedHostsSet.add(host);
      } catch (err) {
        throw new Error(`Invalid baseUrl in endpoint ${ep.id}: ${ep.baseUrl}`);
      }

      const provider = providerMap.get(off.providerId);
      const allowsPrivateCode = provider?.trust?.allowsPrivateCode?.value ?? true;

      const inputCost = off.pricing?.inputPerMillion?.normalized ?? 0;
      const outputCost = off.pricing?.outputPerMillion?.normalized ?? 0;
      const isFree = inputCost === 0 && outputCost === 0;

      map.set(off.id, {
        id: off.id,
        providerId: off.providerId,
        baseUrl: ep.baseUrl,
        upstreamModelId: off.upstreamModelId,
        tools: off.declaredCapabilities.tools ?? false,
        vision: off.declaredCapabilities.vision ?? false,
        streaming: off.declaredCapabilities.streaming ?? false,
        allowsPrivateCode,
        free: isFree,
        inputPerMillion: inputCost,
        editorialRankInfluence: off.relationships.editorial_rank_influence,
      });
    }

    config.allowedUpstreamHosts = [...allowedHostsSet];
  }

  return map;
}

/** Catalog values as route candidates (for plan input). */
export function candidatesFromCatalog(
  catalog: Map<string, OfferingTarget>,
): RouteCandidate[] {
  return [...catalog.values()];
}
