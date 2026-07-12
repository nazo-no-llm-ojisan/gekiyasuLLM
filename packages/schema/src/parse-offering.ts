import type { CommercialRelationship } from "./coi.js";
import type { Offering } from "./entities.js";
import type { PricingRecord } from "./pricing.js";

/**
 * Offering fixture / catalog JSON may carry COI fields required on public feeds.
 * (Provider already has `relationships`; offerings in fixtures use the same shape.)
 */
export type ParsedOffering = Offering & {
  relationships: CommercialRelationship;
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

function requireBoolean(obj: Record<string, unknown>, key: string, path: string): boolean {
  const v = obj[key];
  if (typeof v !== "boolean") {
    throw new Error(`${path}.${key} must be a boolean`);
  }
  return v;
}

function parseRelationships(value: unknown, path: string): CommercialRelationship {
  if (!isRecord(value)) {
    throw new Error(`${path} must be an object`);
  }
  const sponsored = requireBoolean(value, "sponsored", path);
  const affiliate = requireBoolean(value, "affiliate", path);
  const rank = value.editorial_rank_influence;
  if (rank !== "none") {
    throw new Error(`${path}.editorial_rank_influence must be "none"`);
  }
  return {
    sponsored,
    affiliate,
    editorial_rank_influence: "none",
    ...(typeof value.disclosure === "string" ? { disclosure: value.disclosure } : {}),
    ...(typeof value.disclosure_url === "string"
      ? { disclosure_url: value.disclosure_url }
      : {}),
    ...(typeof value.as_of === "string" ? { as_of: value.as_of } : {}),
  };
}

function parsePricing(value: unknown, path: string): PricingRecord {
  if (!isRecord(value)) {
    throw new Error(`${path} must be an object`);
  }
  if (typeof value.asOf !== "string" || value.asOf.length === 0) {
    throw new Error(`${path}.asOf must be a non-empty string`);
  }
  if (!isRecord(value.currency)) {
    throw new Error(`${path}.currency must be an object`);
  }
  if (value.currency.normalized !== "USD") {
    throw new Error(`${path}.currency.normalized must be "USD" for fixed-price fixture parse`);
  }
  if (!isRecord(value.inputPerMillion)) {
    throw new Error(`${path}.inputPerMillion must be present`);
  }
  if (typeof value.inputPerMillion.normalized !== "number") {
    throw new Error(`${path}.inputPerMillion.normalized must be a number`);
  }
  if (!isRecord(value.outputPerMillion)) {
    throw new Error(`${path}.outputPerMillion must be present`);
  }
  if (typeof value.outputPerMillion.normalized !== "number") {
    throw new Error(`${path}.outputPerMillion.normalized must be a number`);
  }

  // Structural check is enough for the fixture test; full TrackedValue/Evidence
  // deep validation can grow later without breaking callers.
  return value as PricingRecord;
}

/**
 * Parse and lightly validate one Offering-shaped JSON value
 * (fixed USD input/output per million + COI relationships).
 */
export function parseOfferingJson(input: unknown): ParsedOffering {
  if (!isRecord(input)) {
    throw new Error("offering JSON must be an object");
  }

  const id = requireString(input, "id", "offering");
  const modelId = requireString(input, "modelId", "offering");
  const providerId = requireString(input, "providerId", "offering");
  const endpointId = requireString(input, "endpointId", "offering");
  const upstreamModelId = requireString(input, "upstreamModelId", "offering");

  if (!isRecord(input.declaredCapabilities)) {
    throw new Error("offering.declaredCapabilities must be an object");
  }

  if (input.pricing === undefined) {
    throw new Error("offering.pricing is required for fixed-price parse");
  }
  const pricing = parsePricing(input.pricing, "offering.pricing");

  if (input.relationships === undefined) {
    throw new Error("offering.relationships (COI) is required");
  }
  const relationships = parseRelationships(input.relationships, "offering.relationships");

  const offering: ParsedOffering = {
    id,
    modelId,
    providerId,
    endpointId,
    upstreamModelId,
    declaredCapabilities: input.declaredCapabilities as Offering["declaredCapabilities"],
    pricing,
    relationships,
  };

  if (typeof input.marketingName === "string") {
    offering.marketingName = input.marketingName;
  }
  if (
    input.status === "active" ||
    input.status === "degraded" ||
    input.status === "discontinued" ||
    input.status === "unknown"
  ) {
    offering.status = input.status;
  }

  return offering;
}
