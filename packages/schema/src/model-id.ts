/** Parsed result from a raw model identifier string. */
export type ParsedModelId = {
  /** Provider segment exactly as parsed from the raw ID, or "unknown" without a slash. */
  rawProvider: string;
  /** Provider after marker removal, case normalization, and alias normalization. */
  normalizedProvider: string;
  /**
   * Raw provider segment or "unknown" when no slash is present.
   * @deprecated Use rawProvider for the input representation or normalizedProvider for matching.
   */
  provider: string;
  /** Model family name, e.g. "gpt-4o", "glm-5.2", "claude-3.5-sonnet". */
  family: string;
  /** Version string if extracted, e.g. "4o", "5.2". */
  version?: string;
  /** Derivative suffix if present, e.g. "mini", "coder", "70b". */
  derivative?: string;
  /** Access variant from a colon or terminal dash suffix, e.g. "free", "chat". */
  accessVariant?: string;
  /** Region if extracted from @region suffix, e.g. "us-east". */
  region?: string;
  /** Canonical key: "developer|family|version|derivative". */
  canonicalKey: string;
  /** Resolved developer name. */
  developer: string;
  /** Original raw model ID string. */
  rawId: string;
};

/**
 * Rule-table maintenance contract:
 *
 * - Provider aliases normalize documented spellings only; they do not assert
 *   that two model families or offerings behave identically.
 * - Infrastructure entries identify hosting providers whose developer must be
 *   inferred from an evidence-backed family mapping.
 * - Family mappings must not be extended from name similarity alone.
 * - Derivative and access rules match terminal syntax only and must preserve
 *   every extracted component in ParsedModelId.
 * - Every rule addition requires a focused unit fixture covering the raw input,
 *   normalized provider, developer, parsed components, and canonical key.
 *
 * These rules remain TypeScript constants deliberately: parsing is pure and
 * offline, and Issue #12 does not introduce runtime registries or plugins.
 * Raw representations must never be substituted for canonical identity fields.
 */

// ── Alias table: provider name normalization ──────────────────────────────────

const PROVIDER_ALIASES: Record<string, string> = {
  "openai": "openai",
  "oai": "openai",
  "anthropic": "anthropic",
  "claude": "anthropic",
  "google": "google",
  "gemini": "google",
  "gcp": "google",
  "deepmind": "google",
  "meta": "meta-llama",
  "meta-llama": "meta-llama",
  "llama": "meta-llama",
  "mistral": "mistral",
  "mistralai": "mistral",
  "cohere": "cohere",
  "z-ai": "z-ai",
  "zhipu": "z-ai",
  "glm": "z-ai",
  "thudm": "z-ai",
  "alibaba": "alibaba",
  "qwen": "alibaba",
  "deepseek": "deepseek",
  "microsoft": "microsoft",
  "ms": "microsoft",
  "x-ai": "x-ai",
  "xai": "x-ai",
  "stability": "stability-ai",
  "stability-ai": "stability-ai",
  "databricks": "databricks",
  "01-ai": "01-ai",
  "yi": "01-ai",
};

// ── Infrastructure / hosting providers (developer inferred from family) ───────

const INFRA_PROVIDERS = new Set([
  "fireworks",
  "groq",
  "bedrock",
  "together",
  "deepinfra",
  "lepton",
  "runpod",
  "modal",
  "cloudflare",
  "replicate",
  "anyscale",
  "openrouter",
  "novita",
  "chutes",
  "featherless",
  "nscale",
  "inference",
  "huggingface",
  "hf",
]);

// ── Family → Developer inference map ─────────────────────────────────────────

const FAMILY_DEVELOPER_MAP: Record<string, string> = {
  // OpenAI families
  "gpt-4o": "openai",
  "gpt-4": "openai",
  "gpt-3.5": "openai",
  "gpt-4-turbo": "openai",
  "o1": "openai",
  "o3": "openai",
  "o4": "openai",
  "chatgpt": "openai",
  "dall-e": "openai",
  "whisper": "openai",
  "tts": "openai",
  "codex": "openai",
  // Anthropic families
  "claude-3": "anthropic",
  "claude-3.5": "anthropic",
  "claude-4": "anthropic",
  "claude-opus": "anthropic",
  "claude-sonnet": "anthropic",
  "claude-haiku": "anthropic",
  // Google families
  "gemini-1.5": "google",
  "gemini-2": "google",
  "gemini-2.5": "google",
  "gemini-pro": "google",
  "gemini-flash": "google",
  "gemini-ultra": "google",
  "palm": "google",
  "gemma": "google",
  // Meta families
  "llama-3": "meta-llama",
  "llama-3.1": "meta-llama",
  "llama-3.2": "meta-llama",
  "llama-3.3": "meta-llama",
  "llama-4": "meta-llama",
  "codellama": "meta-llama",
  // Mistral families
  "mistral-large": "mistral",
  "mistral-small": "mistral",
  "mistral-nemo": "mistral",
  "mixtral": "mistral",
  "codestral": "mistral",
  "pixtral": "mistral",
  "ministral": "mistral",
  // Z-AI (Zhipu / GLM) families
  "glm-4": "z-ai",
  "glm-5": "z-ai",
  "glm-5.2": "z-ai",
  "chatglm": "z-ai",
  "cogview": "z-ai",
  // DeepSeek families
  "deepseek-v2": "deepseek",
  "deepseek-v3": "deepseek",
  "deepseek-r1": "deepseek",
  "deepseek-coder": "deepseek",
  // Qwen / Alibaba families
  "qwen-2": "alibaba",
  "qwen-2.5": "alibaba",
  "qwen-3": "alibaba",
  "qwen-vl": "alibaba",
  "qwq": "alibaba",
  // Cohere families
  "command-r": "cohere",
  "command-a": "cohere",
  // Microsoft families
  "phi-3": "microsoft",
  "phi-4": "microsoft",
  // x-AI families
  "grok-2": "x-ai",
  "grok-3": "x-ai",
  "grok-4": "x-ai",
  // Databricks families
  "dbrx": "databricks",
  "db-instruct": "databricks",
  // Stability families
  "stable-diffusion": "stability-ai",
  "sdxl": "stability-ai",
  "sd3": "stability-ai",
};

// ── Derivative suffix patterns ────────────────────────────────────────────────

const DERIVATIVE_PATTERN =
  /-(mini|flash|coder|nano|turbo|pro|max|large|small|tiny|plus|lite|\d+[bB])(-(?:[0-9]+[a-z]*|[a-z]+[0-9]*|[a-z]+))*$/i;

// ── Date suffix pattern ──────────────────────────────────────────────────────

const DATE_PATTERN = /[-.]?(\d{4}-\d{2}-\d{2}|\d{8})$/;

// ── Region pattern ───────────────────────────────────────────────────────────

const REGION_PATTERN = /@([a-z]{2,3}(?:-[a-z]+)*)$/i;

// ── Numeric version pattern ──────────────────────────────────────────────────

// Matches version-like numbers such as "3.5", "4", "5.2", "70b" etc.
// Special families like o1, o3, hy3 are handled separately.
const NUMERIC_VERSION_PATTERN = /^(\d+(?:\.\d+)?)$/;

// Special family prefixes where the number is part of the family name, not version.
const FAMILY_PREFIX_PATTERNS = [
  /^(o\d+)(?:-|$)/,     // o1, o3, o4
  /^(hy\d+)(?:-|$)/,    // hy3
  /^(grok-\d+)(?:-|$)/, // grok-2, grok-3
];

/** A suffix extraction is safe only when it leaves a non-empty model token. */
function hasValidFamilyRemainder(family: string): boolean {
  return /[a-z0-9]$/i.test(family);
}

/**
 * Normalize a provider name using the alias table.
 * Strips leading `~` marker if present.
 */
function normalizeProvider(raw: string): string {
  const cleaned = raw.replace(/^~/, "").toLowerCase().trim();
  return PROVIDER_ALIASES[cleaned] ?? cleaned;
}

/**
 * Extract @region suffix from the model family string.
 */
function extractRegion(family: string): { family: string; region?: string } {
  const match = family.match(REGION_PATTERN);
  if (match) {
    const remainingFamily = family.slice(0, match.index);
    if (!hasValidFamilyRemainder(remainingFamily)) {
      return { family };
    }
    return {
      family: remainingFamily,
      region: match[1],
    };
  }
  return { family };
}

/**
 * Extract date suffix and return it as a version candidate.
 */
function extractDateSuffix(family: string): { family: string; dateCandidate?: string } {
  const match = family.match(DATE_PATTERN);
  if (match) {
    const remainingFamily = family.slice(0, match.index);
    if (!hasValidFamilyRemainder(remainingFamily)) {
      return { family };
    }
    return {
      family: remainingFamily,
      dateCandidate: match[1],
    };
  }
  return { family };
}

/**
 * Extract derivative suffixes from the family string.
 */
function extractDerivative(family: string): { family: string; derivative?: string } {
  const match = family.match(DERIVATIVE_PATTERN);
  if (match && match.index !== undefined) {
    const remainingFamily = family.slice(0, match.index);
    if (!hasValidFamilyRemainder(remainingFamily)) {
      return { family };
    }
    return {
      family: remainingFamily,
      derivative: family.slice(match.index + 1), // skip leading dash
    };
  }
  return { family };
}

/**
 * Extract numeric version from a family segment.
 *
 * The family name is preserved in full — version is extracted as metadata only.
 * Examples: "gpt-4o" → version="4o", "glm-5.2" → version="5.2",
 * "claude-3.5-sonnet" → version=undefined (sonnet is not numeric).
 *
 * Special prefixes like o1, o3, hy3 are part of the family; no version extracted.
 */
function extractVersion(family: string): { version?: string } {
  const unresolvedDate = family.match(DATE_PATTERN);
  if (unresolvedDate?.index === 0) {
    return {};
  }

  // Check special family prefixes first — no version extraction
  for (const pattern of FAMILY_PREFIX_PATTERNS) {
    const m = family.match(pattern);
    if (m) {
      return {};
    }
  }

  // Try to find a trailing numeric version segment after the last dash.
  const lastDash = family.lastIndexOf("-");
  if (lastDash > 0) {
    const suffix = family.slice(lastDash + 1);
    // Check if suffix looks like a version (e.g. "4o", "5.2", "3", "3.1")
    const vm = suffix.match(/^(\d+(?:\.\d+)?[a-z]*)$/);
    if (vm) {
      return { version: vm[1] };
    }
  }

  // No version found
  return {};
}

/**
 * Infer the developer from the model family name using the family→developer map.
 * Matches the longest prefix in the map.
 */
function inferDeveloperFromFamily(family: string): string | undefined {
  const lower = family.toLowerCase();

  // Direct exact match
  if (FAMILY_DEVELOPER_MAP[lower]) {
    return FAMILY_DEVELOPER_MAP[lower];
  }

  // Try longest-prefix match: sort keys by length descending
  const sortedKeys = Object.keys(FAMILY_DEVELOPER_MAP).sort((a, b) => b.length - a.length);
  for (const key of sortedKeys) {
    if (lower.startsWith(key)) {
      return FAMILY_DEVELOPER_MAP[key];
    }
  }

  return undefined;
}

/**
 * Extract a colon-less access suffix from the end of a valid family string.
 * Words in the middle and removals that leave an empty/invalid family are ignored.
 */
function stripAccessSuffixes(family: string): { family: string; stripped?: string } {
  const accessPattern = /-(instruct|chat)$/i;
  const match = family.match(accessPattern);
  if (match) {
    const remainingFamily = family.slice(0, match.index);
    if (!hasValidFamilyRemainder(remainingFamily)) {
      return { family };
    }
    return {
      family: remainingFamily,
      stripped: match[1],
    };
  }
  return { family };
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Parse a raw model identifier string into its component parts.
 *
 * Parse order (per design doc 06, section 3.1):
 * 1. Extract `:` suffix → access variant
 * 2. Split `provider/rest` (no slash → provider="unknown")
 * 3. Extract colon-less access suffixes (instruct, chat)
 * 4. Strip `@region` from family
 * 5. Extract date suffix → version candidate
 * 6. Extract derivative (mini, flash, coder, 27b, etc.)
 * 7. Extract numeric version (exceptions: o1/o3/hy3 are part of family)
 * 8. If version unresolved, use date candidate
 */
export function parseModelId(raw: string): ParsedModelId {
  // Step 1: Extract accessVariant from `:xxx` suffix
  let working = raw;
  let accessVariant: string | undefined;
  const colonMatch = working.match(/:([a-z][a-z0-9-]*)$/);
  if (colonMatch) {
    const withoutAccess = working.slice(0, colonMatch.index);
    const slashIndex = withoutAccess.indexOf("/");
    const familyBeforeAccess = slashIndex === -1
      ? withoutAccess
      : withoutAccess.slice(slashIndex + 1);
    if (/[a-z0-9]$/i.test(familyBeforeAccess)) {
      accessVariant = colonMatch[1];
      working = withoutAccess;
    }
  }

  // Step 2: Split on first `/` to get provider/rest
  const slashIdx = working.indexOf("/");
  let rawProvider: string;
  let rest: string;
  if (slashIdx === -1) {
    rawProvider = "unknown";
    rest = working;
  } else {
    rawProvider = working.slice(0, slashIdx);
    rest = working.slice(slashIdx + 1);
  }
  const normalizedProvider = normalizeProvider(rawProvider);

  // Step 3: Extract colon-less access before other suffix parsers so dated
  // and regional forms remain equivalent to explicit colon access.
  const { family: afterAccess, stripped: colonLessAccess } = stripAccessSuffixes(rest);
  accessVariant ??= colonLessAccess?.toLowerCase();

  // Step 4: Extract @region from family
  const { family: afterRegion, region } = extractRegion(afterAccess);

  // Step 5: Extract date suffix → version candidate
  const { family: afterDate, dateCandidate } = extractDateSuffix(afterRegion);

  // Step 6: Extract derivative
  const { family: afterDeriv, derivative } = extractDerivative(afterDate);

  // Step 7: Extract numeric version
  const { version: numericVersion } = extractVersion(afterDeriv);

  // Step 8: Resolve version — prefer numeric, fall back to date
  const version = numericVersion ?? dateCandidate;

  // Family is the full remaining string after all extractions
  const family = afterDeriv;

  // Developer resolution (section 3.2)
  const developer = resolveDeveloper(normalizedProvider, family);

  // Canonical key (section 3.3)
  const canonicalKey = buildCanonicalKey(developer, family, version, derivative);

  return {
    rawProvider,
    normalizedProvider,
    provider: rawProvider,
    family,
    version,
    derivative,
    accessVariant,
    region,
    canonicalKey,
    developer,
    rawId: raw,
  };
}

/**
 * Resolve the developer for a given provider and family combination.
 *
 * Rules (per design doc 06, section 3.2):
 * 1. Normalize provider name via alias table
 * 2. If provider is infrastructure/hosting → infer developer from family
 * 3. Otherwise → use normalized provider as developer
 * 4. Unknown → "unknown"
 */
export function resolveDeveloper(provider: string, family: string): string {
  // Strip ~ prefix and normalize
  const normalized = normalizeProvider(provider);

  // Check if this is an infrastructure/hosting provider
  if (INFRA_PROVIDERS.has(normalized)) {
    const inferred = inferDeveloperFromFamily(family);
    return inferred ?? "unknown";
  }

  // For "unknown" provider, try to infer from family
  if (normalized === "unknown") {
    const inferred = inferDeveloperFromFamily(family);
    return inferred ?? "unknown";
  }

  // Otherwise, the normalized provider IS the developer
  return normalized;
}

/**
 * Build the canonical key string.
 * Format: "developer|family|version|derivative"
 * Empty parts are represented as empty strings between pipes.
 */
function buildCanonicalKey(
  developer: string,
  family: string,
  version?: string,
  derivative?: string,
): string {
  return `${developer}|${family}|${version ?? ""}|${derivative ?? ""}`;
}
