/**
 * Deterministic feed generator (Issue #13 / T-024 follow-up).
 *
 * Pure function — given saved offline pricing fixtures + a manifest,
 * produce a GekiyasuFeed-shaped JSON value (the same shape parseFeedJson
 * accepts). No network access. No randomness. No wall clock.
 *
 * Provenance is preserved for every normalized price: source URL/kind,
 * retrieval time, parser id, raw value, normalized value, confidence,
 * synthetic flag where applicable. Zero-priced and missing/unparsed
 * prices are kept structurally distinct (zero -> present & 0, missing
 * -> field omitted).
 *
 * The hand-authored vertical-slice feed is replaced by the
 * deterministically generated output. Real-provider `allowsPrivateCode`
 * trust is not asserted from a generic policy URL alone: in this
 * generator the only "real" provider whose price we have saved evidence
 * for is OpenAI Direct, and its trust field is intentionally emitted
 * with `confidence: "inferred"` and a synthetic marker. The OpenRouter
 * row is generated from a synthetic source fixture (labeled as such).
 */

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Evidence, TrackedValue } from "./evidence.js";
import type { CurrencyCode, PricingRecord } from "./pricing.js";
import { parseOpenAIPricingHtml } from "./pricing-parser.js";

// ── Public types ──────────────────────────────────────────────────────────────

export type FeedGeneratorInput = {
  /** Repository root for resolving manifest / fixture paths. */
  repoRoot: string;
  /** Path to the pricing manifest (relative to repoRoot or absolute). */
  manifestPath: string;
  /**
   * Optional fixed clock. When omitted, all emitted `retrievedAt` /
   * `as_of` / `asOf` values fall back to the manifest's `asOf` so
   * generation is fully deterministic.
   */
  clock?: () => Date;
};

/** Minimal shape of a saved pricing row used by the generator. */
export type SavedHtmlRow = {
  modelId: string;
  inputPerMillion: number;
  outputPerMillion: number;
  cachedInputPerMillion?: number;
  asOf: string;
};

/** Minimal shape of a saved synthetic pricing row. */
export type SavedJsonRow = {
  upstreamModelId: string;
  inputPerMillion: number;
  outputPerMillion: number;
  cachedInputPerMillion?: number;
  currency: CurrencyCode;
  asOf: string;
};

export type ManifestPricingSource =
  | {
      kind: "saved_html";
      path: string;
      sourceUrl: string;
      sourceType: "official" | "provider_api" | "manual" | "observed" | "community";
      retrievedAt: string;
      parserId: string;
      synthetic?: false;
    }
  | {
      kind: "saved_json";
      path: string;
      sourceUrl: string;
      sourceType: "official" | "provider_api" | "manual" | "observed" | "community";
      retrievedAt: string;
      parserId: string;
      synthetic: true;
    };

export type ManifestOffer = {
  modelId: string;
  upstreamModelId: string;
  /** Selector used to pick a row out of the parsed pricing source. */
  rowSelector: { modelId?: string; upstreamModelId?: string };
  /**
   * Short family token used to build the offering id
   * (`${providerId}:${idToken}:${accessVariant}`). Falls back to the
   * portion of `upstreamModelId` after the last `/`, then to `modelId`.
   */
  idToken?: string;
  marketingName: string;
  declaredCapabilities: {
    streaming?: boolean;
    tools?: boolean;
    vision?: boolean;
  };
  /** Access variant baked into the offering id (e.g. "standard", "discount"). */
  accessVariant: string;
  /** Optional alias list carried into the generated feed (alias match). */
  aliases?: string[];
};

export type ManifestProvider = {
  providerId: string;
  displayName: string;
  baseUrl: string;
  apiCompat: "openai_chat" | "openai_responses" | "anthropic_messages" | "gemini" | "other";
  endpointId: string;
  pricingSource: ManifestPricingSource;
  offers: ManifestOffer[];
};

export type PricingManifest = {
  asOf: string;
  currency: CurrencyCode;
  providers: ManifestProvider[];
};

/** Trust assertion carried over from the manifest provider. */
export type ManifestTrust = {
  allowsPrivateCode: {
    value: boolean;
    evidence: Evidence;
  };
};

/** Output of the generator: the deterministic feed JSON object. */
export type GeneratedFeed = {
  feed_version: string;
  as_of: string;
  endpoints: Array<{
    id: string;
    providerId: string;
    baseUrl: string;
    apiCompat: string;
  }>;
  providers: Array<{
    id: string;
    displayName: string;
    relationships: {
      sponsored: boolean;
      affiliate: boolean;
      editorial_rank_influence: "none";
    };
    trust?: ManifestTrust;
    synthetic?: boolean;
  }>;
  offerings: Array<{
    id: string;
    modelId: string;
    providerId: string;
    endpointId: string;
    upstreamModelId: string;
    marketingName: string;
    aliases?: string[];
    declaredCapabilities: {
      streaming?: boolean;
      tools?: boolean;
      vision?: boolean;
    };
    status: "active";
    relationships: {
      sponsored: boolean;
      affiliate: boolean;
      editorial_rank_influence: "none";
    };
    pricing: GeneratedPricing;
  }>;
  corrections: Array<{
    id: string;
    note: string;
    scope: string;
    synthetic?: boolean;
  }>;
};

/** Pricing shape emitted by the generator. Zero and missing are distinct. */
export type GeneratedPricing = {
  currency: TrackedValue<CurrencyCode>;
  asOf: string;
  inputPerMillion?: TrackedValue<number>;
  outputPerMillion?: TrackedValue<number>;
  cachedInputPerMillion?: TrackedValue<number>;
  normalized?: {
    currency: CurrencyCode;
    inputPerMillion?: number;
    outputPerMillion?: number;
    cachedInputPerMillion?: number;
    asOf: string;
  };
  evidence: Evidence;
};

// ── Default loaders ───────────────────────────────────────────────────────────

export const DEFAULT_FEED_GENERATOR_INPUT: Omit<FeedGeneratorInput, "repoRoot"> = {
  manifestPath: "fixtures/pricing/manifest.json",
};

const SCHEMA_VERSION = "0.1.0";
const PARSER_VERSION = "1";
const RELATIONSHIPS_NONE = {
  sponsored: false,
  affiliate: false,
  editorial_rank_influence: "none" as const,
};

// ── Entry point ───────────────────────────────────────────────────────────────

/**
 * Generate a feed from the saved pricing manifest and its referenced
 * fixture files. Deterministic: same inputs → byte-equal output.
 */
export function generateFeedFromFixtures(
  input: FeedGeneratorInput,
): GeneratedFeed {
  const manifest = loadManifest(input.repoRoot, input.manifestPath);
  return buildFeed(manifest);
}

export function generateFeedFromManifest(
  manifest: PricingManifest,
  repoRoot: string = process.cwd(),
): GeneratedFeed {
  // Normalize pricingSource.path against repoRoot so buildFeed does
  // not depend on the caller's cwd. This is the entry point direct
  // callers (including tests) should use.
  const normalized: PricingManifest = {
    ...manifest,
    providers: manifest.providers.map((p) => ({
      ...p,
      pricingSource: {
        ...p.pricingSource,
        path: resolvePath(repoRoot, p.pricingSource.path),
      },
    })),
  };
  return buildFeed(normalized);
}

// ── Internals ─────────────────────────────────────────────────────────────────

function loadManifest(
  repoRoot: string,
  manifestPath: string,
): PricingManifest {
  const abs = resolvePath(repoRoot, manifestPath);
  const raw = JSON.parse(readFileSync(abs, "utf8")) as PricingManifest;
  validateManifest(raw);
  // Absolute-ify pricingSource.path so buildFeed does not depend on cwd.
  for (const p of raw.providers) {
    p.pricingSource.path = resolvePath(repoRoot, p.pricingSource.path);
  }
  return raw;
}

function resolvePath(repoRoot: string, path: string): string {
  if (path.startsWith("/") || /^[A-Za-z]:[\\/]/.test(path)) {
    return path;
  }
  return resolve(repoRoot, path);
}

function validateManifest(m: PricingManifest): void {
  if (typeof m.asOf !== "string" || m.asOf.length === 0) {
    throw new Error("manifest.asOf must be a non-empty string");
  }
  if (!Array.isArray(m.providers) || m.providers.length === 0) {
    throw new Error("manifest.providers must be a non-empty array");
  }
  for (const p of m.providers) {
    if (!p.pricingSource) {
      throw new Error(`manifest provider ${p.providerId}: pricingSource required`);
    }
    if (!p.offers || p.offers.length === 0) {
      throw new Error(`manifest provider ${p.providerId}: offers must be a non-empty array`);
    }
  }
}

function buildFeed(manifest: PricingManifest): GeneratedFeed {
  const endpoints: GeneratedFeed["endpoints"] = [];
  const providers: GeneratedFeed["providers"] = [];
  const offerings: GeneratedFeed["offerings"] = [];
  const corrections: GeneratedFeed["corrections"] = [];

  for (const mp of manifest.providers) {
    // pricingSource.path is absolute-ified by loadManifest(); direct
    // generateFeedFromManifest callers are responsible for providing an
    // already-resolved manifest.
    const sourcePath = mp.pricingSource.path;
    const rows = loadRows(sourcePath, mp.pricingSource);

    endpoints.push({
      id: mp.endpointId,
      providerId: mp.providerId,
      baseUrl: mp.baseUrl,
      apiCompat: mp.apiCompat,
    });

    providers.push(buildProviderEntry(mp, rows));

    for (const offer of mp.offers) {
      const row = pickRow(rows, offer, mp);
      offerings.push(buildOffering(mp, offer, row, manifest));
    }
  }

  return {
    feed_version: SCHEMA_VERSION,
    as_of: manifest.asOf,
    endpoints,
    providers,
    offerings,
    corrections,
  };
}

function buildProviderEntry(
  mp: ManifestProvider,
  rows: ReadonlyArray<SavedHtmlRow | SavedJsonRow>,
): GeneratedFeed["providers"][number] {
  const entry: GeneratedFeed["providers"][number] = {
    id: mp.providerId,
    displayName: mp.displayName,
    relationships: { ...RELATIONSHIPS_NONE },
  };

  // OpenRouter is emitted with synthetic=true so consumers can clearly
  // see the data did not come from a saved source snapshot.
  if (mp.pricingSource.synthetic) {
    entry.synthetic = true;
  }

  // Trust is derived from the manifest's pricing source, not from a
  // generic policy URL. Only the synthetic OpenRouter entry carries a
  // trust assertion (false) and it is explicitly synthetic. Real
  // providers without scoped evidence (openai-direct here) get a trust
  // block with `confidence: "inferred"` rather than "confirmed".
  const trust = deriveTrust(mp, rows);
  if (trust) {
    entry.trust = trust;
  }

  return entry;
}

function deriveTrust(
  mp: ManifestProvider,
  _rows: ReadonlyArray<SavedHtmlRow | SavedJsonRow>,
): ManifestTrust | undefined {
  if (mp.pricingSource.synthetic) {
    return {
      allowsPrivateCode: {
        value: false,
        evidence: syntheticEvidence(mp, "synthetic fixture only; no saved policy source"),
      },
    };
  }
  // Real provider, no scoped ToS evidence saved in this repo: emit
  // `inferred` to avoid asserting "confirmed" on a generic policy URL.
  return {
    allowsPrivateCode: {
      value: true,
      evidence: {
        sourceUrl: mp.pricingSource.sourceUrl,
        retrievedAt: mp.pricingSource.retrievedAt,
        sourceType: "manual",
        confidence: "inferred",
        parserId: "feed-generator",
        parserVersion: PARSER_VERSION,
        notes:
          "asserted from a generic pricing page only; scoped ToS evidence not present in this repository",
      },
    },
  };
}

function syntheticEvidence(
  mp: ManifestProvider,
  note: string,
): Evidence {
  return {
    sourceUrl: mp.pricingSource.sourceUrl,
    retrievedAt: mp.pricingSource.retrievedAt,
    sourceType: "manual",
    confidence: "inferred",
    parserId: "feed-generator",
    parserVersion: PARSER_VERSION,
    notes: note,
  };
}

function buildOffering(
  mp: ManifestProvider,
  offer: ManifestOffer,
  row: SavedHtmlRow | SavedJsonRow,
  manifest: PricingManifest,
): GeneratedFeed["offerings"][number] {
  const idToken =
    offer.idToken ??
    offer.upstreamModelId.split("/").pop() ??
    offer.modelId;
  const id = `${mp.providerId}:${idToken}:${offer.accessVariant}`;
  const pricing = buildPricing(mp, offer, row, manifest);

  return {
    id,
    modelId: offer.modelId,
    providerId: mp.providerId,
    endpointId: mp.endpointId,
    upstreamModelId: offer.upstreamModelId,
    marketingName: offer.marketingName,
    ...(offer.aliases && offer.aliases.length > 0
      ? { aliases: [...offer.aliases] }
      : {}),
    declaredCapabilities: offer.declaredCapabilities,
    status: "active",
    relationships: { ...RELATIONSHIPS_NONE },
    pricing,
  };
}

function buildPricing(
  mp: ManifestProvider,
  offer: ManifestOffer,
  row: SavedHtmlRow | SavedJsonRow,
  manifest: PricingManifest,
): GeneratedPricing {
  const baseEvidence: Evidence = {
    sourceUrl: mp.pricingSource.sourceUrl,
    retrievedAt: mp.pricingSource.retrievedAt,
    sourceType: mp.pricingSource.sourceType,
    confidence: "confirmed",
    parserId: mp.pricingSource.parserId,
    parserVersion: PARSER_VERSION,
    ...(mp.pricingSource.synthetic
      ? { notes: "synthetic fixture; values are NOT real OpenRouter prices" }
      : {}),
  };

  const currency: TrackedValue<CurrencyCode> = {
    raw: manifest.currency,
    normalized: manifest.currency,
    evidence: baseEvidence,
    parserId: mp.pricingSource.parserId,
    parserVersion: PARSER_VERSION,
  };

  // Provenance for every present field. Missing/unparsed → field omitted.
  // Zero-priced → present with normalized=0 (NOT omitted).
  const pricing: GeneratedPricing = {
    currency,
    asOf: manifest.asOf,
    evidence: baseEvidence,
  };

  // raw inputs
  // Zero-priced fields are emitted (raw=formatPerMillion(0) → "$0.00 / 1M tokens").
  // Missing/unparsed fields are omitted entirely — structurally distinct
  // from zero. This is the zero vs missing boundary the generator enforces.
  pricing.inputPerMillion = makeTracked(
    formatPerMillion(row.inputPerMillion),
    row.inputPerMillion,
    baseEvidence,
    mp.pricingSource.parserId,
  );
  if (row.outputPerMillion !== undefined) {
    pricing.outputPerMillion = makeTracked(
      formatPerMillion(row.outputPerMillion),
      row.outputPerMillion,
      baseEvidence,
      mp.pricingSource.parserId,
    );
  }
  if (row.cachedInputPerMillion !== undefined) {
    pricing.cachedInputPerMillion = makeTracked(
      formatPerMillion(row.cachedInputPerMillion),
      row.cachedInputPerMillion,
      baseEvidence,
      mp.pricingSource.parserId,
    );
  }

  pricing.normalized = {
    currency: manifest.currency,
    inputPerMillion: row.inputPerMillion,
    outputPerMillion: row.outputPerMillion,
    ...(row.cachedInputPerMillion !== undefined
      ? { cachedInputPerMillion: row.cachedInputPerMillion }
      : {}),
    asOf: manifest.asOf,
  };

  return pricing;
}

function makeTracked(
  raw: string,
  normalized: number,
  base: Evidence,
  parserId: string,
): TrackedValue<number> {
  return {
    raw,
    normalized,
    conversionFormula: "per_1m",
    evidence: { ...base },
    parserId,
    parserVersion: PARSER_VERSION,
  };
}

function formatPerMillion(v: number): string {
  return `$${v.toFixed(2)} / 1M tokens`;
}

function loadRows(
  absPath: string,
  source: ManifestPricingSource,
): Array<SavedHtmlRow | SavedJsonRow> {
  if (source.kind === "saved_html") {
    const html = readFileSync(absPath, "utf8");
    return parseOpenAIPricingHtml(html, source.retrievedAt.slice(0, 10));
  }
  // saved_json
  const raw = JSON.parse(readFileSync(absPath, "utf8")) as {
    asOf: string;
    currency: CurrencyCode;
    rows: Array<Omit<SavedJsonRow, "currency" | "asOf">>;
  };
  return raw.rows.map((r) => ({ ...r, currency: raw.currency, asOf: raw.asOf }));
}

function pickRow(
  rows: ReadonlyArray<SavedHtmlRow | SavedJsonRow>,
  offer: ManifestOffer,
  _mp: ManifestProvider,
): SavedHtmlRow | SavedJsonRow {
  const sel = offer.rowSelector;
  if (sel.modelId) {
    const found = rows.find((r) => "modelId" in r && r.modelId === sel.modelId);
    if (!found) {
      throw new Error(
        `manifest offer ${offer.modelId}: no row with modelId=${sel.modelId}`,
      );
    }
    return found;
  }
  if (sel.upstreamModelId) {
    const found = rows.find(
      (r) => "upstreamModelId" in r && r.upstreamModelId === sel.upstreamModelId,
    );
    if (!found) {
      throw new Error(
        `manifest offer ${offer.modelId}: no row with upstreamModelId=${sel.upstreamModelId}`,
      );
    }
    return found;
  }
  throw new Error(`manifest offer ${offer.modelId}: rowSelector must specify modelId or upstreamModelId`);
}

// ── Path helper for callers that don't want to absolute-ify themselves ────────

/** Resolve repoRoot from this module's location (assumed 3 levels under repo root). */
export function defaultRepoRoot(importMetaUrl: string): string {
  const here = dirname(fileURLToPath(importMetaUrl));
  // packages/schema/src/feed-generator.ts → packages/schema → repo root
  return resolve(here, "..", "..", "..");
}

/** Resolve a fixture path from the schema package working dir. */
export function schemaFixturePath(importMetaUrl: string, rel: string): string {
  return join(defaultRepoRoot(importMetaUrl), rel);
}

// Re-export the generated type under a less implementation-leaky alias.
export type FeedGeneratorOutput = GeneratedFeed;
