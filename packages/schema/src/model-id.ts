/** Parsed result from a raw model identifier string. */
export type ParsedModelId = {
  /** Raw provider segment or "unknown" when no slash present. */
  provider: string;
  /** Model family name, e.g. "gpt-4o", "glm-5.2", "claude-3.5-sonnet". */
  family: string;
  /** Version string if extracted, e.g. "4o", "5.2". */
  version?: string;
  /** Derivative suffix if present, e.g. "mini", "coder", "70b-instruct". */
  derivative?: string;
  /** Access variant from colon suffix, e.g. "free", "flex". */
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
    return {
      family: family.slice(0, match.index),
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
    return {
      family: family.slice(0, match.index),
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
    return {
      family: family.slice(0, match.index),
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
 * Strip colon-less access suffixes from family string.
 * These are words like "instruct", "chat" that appear at the end without a colon.
 */
function stripAccessSuffixes(family: string): { family: string; stripped?: string } {
  const accessPattern = /-(instruct|chat)$/i;
  const match = family.match(accessPattern);
  if (match) {
    return {
      family: family.slice(0, match.index),
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
 * 3. Strip `@region` from family
 * 4. Extract date suffix → version candidate
 * 5. Extract derivative (mini, flash, coder, 27b, etc.)
 * 6. Strip colon-less access suffixes (instruct, chat)
 * 7. Extract numeric version (exceptions: o1/o3/hy3 are part of family)
 * 8. If version unresolved, use date candidate
 */
export function parseModelId(raw: string): ParsedModelId {
  // Step 1: Extract accessVariant from `:xxx` suffix
  let working = raw;
  let accessVariant: string | undefined;
  const colonMatch = working.match(/:([a-z][a-z0-9-]*)$/);
  if (colonMatch) {
    accessVariant = colonMatch[1];
    working = working.slice(0, colonMatch.index);
  }

  // Step 2: Split on first `/` to get provider/rest
  const slashIdx = working.indexOf("/");
  let provider: string;
  let rest: string;
  if (slashIdx === -1) {
    provider = "unknown";
    rest = working;
  } else {
    provider = working.slice(0, slashIdx);
    rest = working.slice(slashIdx + 1);
  }

  // Step 3: Extract @region from family
  const { family: afterRegion, region } = extractRegion(rest);

  // Step 4: Extract date suffix → version candidate
  const { family: afterDate, dateCandidate } = extractDateSuffix(afterRegion);

  // Step 5: Extract derivative
  const { family: afterDeriv, derivative } = extractDerivative(afterDate);

  // Step 6: Strip colon-less access suffixes (instruct, chat)
  const { family: afterAccess } = stripAccessSuffixes(afterDeriv);

  // Step 7: Extract numeric version
  const { version: numericVersion } = extractVersion(afterAccess);

  // Step 8: Resolve version — prefer numeric, fall back to date
  const version = numericVersion ?? dateCandidate;

  // Family is the full remaining string after all extractions
  const family = afterAccess;

  // Developer resolution (section 3.2)
  const developer = resolveDeveloper(provider, family);

  // Canonical key (section 3.3)
  const canonicalKey = buildCanonicalKey(developer, family, version, derivative);

  return {
    provider,
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
