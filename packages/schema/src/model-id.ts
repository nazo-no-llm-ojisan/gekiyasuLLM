export type ParsedModelId = {
  provider: string;
  family: string;
  version?: string;
  derivative?: string;
  accessVariant?: string;
  rawId: string;
};

export type ModelFlags = {
  isFree?: boolean;
  isDiscounted?: boolean;
  isLatest?: boolean;
  isPreview?: boolean;
  isDeprecated?: boolean;
};

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

  // Step 5: Extract derivative from end of rest
  // Derivatives: mini, flash, coder, 27b, nano, turbo, etc.
  // Multi-word derivatives: e.g. "gpt-4o-mini-27b" → derivative="mini-27b"
  let derivative: string | undefined;
  const derivativePattern =
    /-(mini|flash|coder|nano|turbo|pro|max|large|small|tiny|plus|lite)(-(?:[0-9]+[a-z]*|[a-z]+[0-9]*|[a-z]+))*$/i;
  const derivMatch = rest.match(derivativePattern);
  if (derivMatch) {
    derivative = rest.slice(derivMatch.index + 1);
    rest = rest.slice(0, derivMatch.index);
  }

  return {
    provider,
    family: rest,
    derivative,
    accessVariant,
    rawId: raw,
  };
}

export function canonicalKey(
  _parsed: ParsedModelId,
  _developer: string,
): string {
  throw new Error("not implemented");
}

export function detectFlags(_parsed: ParsedModelId): ModelFlags {
  throw new Error("not implemented");
}
