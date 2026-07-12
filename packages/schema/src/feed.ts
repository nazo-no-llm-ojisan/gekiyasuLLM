import type { Endpoint, Provider } from "./entities.js";
import type { ParsedOffering } from "./parse-offering.js";
import { parseOfferingJson } from "./parse-offering.js";

export type GekiyasuFeed = {
  feed_version: string;
  as_of: string;
  providers?: Provider[];
  endpoints: Endpoint[];
  offerings: ParsedOffering[];
  corrections?: unknown[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(obj: Record<string, unknown>, key: string, path: string): string {
  const v = obj[key];
  if (typeof v !== "string" || v.length === 0) {
    throw new Error(`${path}.${key} must be a non-empty string`);
  }
  return v;
}

export function parseFeedJson(input: unknown): GekiyasuFeed {
  if (!isRecord(input)) {
    throw new Error("Feed JSON must be an object");
  }

  const feed_version = requireString(input, "feed_version", "feed");
  const as_of = requireString(input, "as_of", "feed");

  if (!Array.isArray(input.endpoints)) {
    throw new Error("feed.endpoints must be an array");
  }
  if (!Array.isArray(input.offerings)) {
    throw new Error("feed.offerings must be an array");
  }

  const endpoints = input.endpoints.map((ep: unknown, i: number) => {
    if (!isRecord(ep)) {
      throw new Error(`feed.endpoints[${i}] must be an object`);
    }
    const id = requireString(ep, "id", `feed.endpoints[${i}]`);
    const providerId = requireString(ep, "providerId", `feed.endpoints[${i}]`);
    const baseUrl = requireString(ep, "baseUrl", `feed.endpoints[${i}]`);
    const apiCompat = requireString(ep, "apiCompat", `feed.endpoints[${i}]`);

    const validCompat = ["openai_chat", "openai_responses", "anthropic_messages", "gemini", "other"];
    if (!validCompat.includes(apiCompat)) {
      throw new Error(`feed.endpoints[${i}].apiCompat must be one of ${validCompat.join(", ")}`);
    }

    const endpoint: Endpoint = {
      id,
      providerId,
      baseUrl,
      apiCompat: apiCompat as any,
    };

    if (Array.isArray(ep.regions)) {
      endpoint.regions = ep.regions.map(String);
    }
    return endpoint;
  });

  const offerings = input.offerings.map((off: unknown, i: number) => {
    try {
      return parseOfferingJson(off);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`feed.offerings[${i}] invalid: ${msg}`);
    }
  });

  let providers: Provider[] | undefined;
  if (input.providers !== undefined) {
    if (!Array.isArray(input.providers)) {
      throw new Error("feed.providers must be an array");
    }
    providers = input.providers.map((p: unknown, i: number) => {
      if (!isRecord(p)) {
        throw new Error(`feed.providers[${i}] must be an object`);
      }
      const id = requireString(p, "id", `feed.providers[${i}]`);
      const displayName = requireString(p, "displayName", `feed.providers[${i}]`);
      
      const relationships = p.relationships;
      if (!isRecord(relationships)) {
        throw new Error(`feed.providers[${i}].relationships must be an object`);
      }
      const sponsored = typeof relationships.sponsored === "boolean" ? relationships.sponsored : false;
      const affiliate = typeof relationships.affiliate === "boolean" ? relationships.affiliate : false;
      const rank = relationships.editorial_rank_influence;
      if (rank !== undefined && rank !== "none") {
        throw new Error(`feed.providers[${i}].relationships.editorial_rank_influence must be "none"`);
      }

      let trust: Provider["trust"];
      if (p.trust !== undefined) {
        if (!isRecord(p.trust)) {
          throw new Error(`feed.providers[${i}].trust must be an object`);
        }
        trust = {};
        if (p.trust.allowsPrivateCode !== undefined) {
          if (!isRecord(p.trust.allowsPrivateCode)) {
            throw new Error(`feed.providers[${i}].trust.allowsPrivateCode must be an object`);
          }
          const val = p.trust.allowsPrivateCode.value;
          if (typeof val !== "boolean") {
            throw new Error(`feed.providers[${i}].trust.allowsPrivateCode.value must be a boolean`);
          }
          trust.allowsPrivateCode = p.trust.allowsPrivateCode as any;
        }
      }

      return {
        id,
        displayName,
        relationships: {
          sponsored,
          affiliate,
          editorial_rank_influence: "none"
        },
        trust,
      } as Provider;
    });
  }

  return {
    feed_version,
    as_of,
    endpoints,
    offerings,
    providers,
    corrections: Array.isArray(input.corrections) ? input.corrections : [],
  };
}
