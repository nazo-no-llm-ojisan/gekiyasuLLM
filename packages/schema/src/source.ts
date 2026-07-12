import type { Evidence } from "./evidence.js";

/** Collectors pipeline: Fetcher → RawSnapshot → Parser → NormalizedRecord */

export type SourceAdapterKind =
  | "official_pricing_page"
  | "official_docs"
  | "json_api"
  | "provider_dashboard"
  | "manual_override"
  | "community_report";

export type RawSnapshot = {
  id: string;
  sourceUrl: string;
  retrievedAt: string;
  contentType: string;
  /** sha256 hex of body */
  hash: string;
  /** Relative path under fixtures/ or object storage key */
  bodyRef: string;
  adapterKind: SourceAdapterKind;
};

export type ParserMeta = {
  parserId: string;
  parserVersion: string;
};

export type NormalizedRecord = {
  /** Target entity path, e.g. offering pricing */
  subject: string;
  payload: unknown;
  evidence: Evidence;
  parser: ParserMeta;
  fromSnapshotId: string;
};
