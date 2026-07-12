import type { Evidence, Provenanced } from "./evidence.js";
import type { PricingRecord } from "./pricing.js";
import type { CommercialRelationship } from "./coi.js";

export type ApiCompat =
  | "openai_chat"
  | "openai_responses"
  | "anthropic_messages"
  | "gemini"
  | "other";

export type ModelCapabilities = {
  tools?: boolean;
  streaming?: boolean;
  vision?: boolean;
  jsonMode?: boolean;
  reasoning?: boolean;
};

export type Model = {
  /** Canonical id, e.g. "minimax/minimax-m3" */
  id: string;
  displayName: string;
  declaredCapabilities: ModelCapabilities;
  contextWindow?: Provenanced<number>;
};

export type Provider = {
  id: string;
  displayName: string;
  homepage?: string;
  relationships: CommercialRelationship;
  trust?: {
    score?: Provenanced<number>;
    allowsPrivateCode?: Provenanced<boolean>;
    dataRetentionNotes?: Provenanced<string>;
    trainingUseNotes?: Provenanced<string>;
  };
};

export type Endpoint = {
  id: string;
  providerId: string;
  baseUrl: string;
  apiCompat: ApiCompat;
  regions?: string[];
};

/**
 * A concrete way to call a model: endpoint + upstream model id + pricing path.
 * Same logical Model can have many Offerings (official, aggregator, free campaign).
 */
export type Offering = {
  /** Primary key for routing, e.g. "openrouter:minimax/minimax-m3:free" */
  id: string;
  modelId: string;
  providerId: string;
  endpointId: string;
  /** String sent as `model` to upstream */
  upstreamModelId: string;
  marketingName?: string;
  aliases?: string[];
  pricing?: PricingRecord;
  campaignId?: string;
  /** Catalog / marketing claims */
  declaredCapabilities: ModelCapabilities;
  /** From probes / traffic — never overwrite declared */
  observedCapabilities?: ModelCapabilities;
  status?: "active" | "degraded" | "discontinued" | "unknown";
  evidence?: Evidence[];
};

export type Campaign = {
  id: string;
  offeringIds: string[];
  title: string;
  startsAt?: string;
  endsAt?: string;
  termsUrl?: string;
  riskNotes?: string;
  evidence?: Evidence;
};
