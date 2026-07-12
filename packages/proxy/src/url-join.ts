/**
 * Join upstream API root with client path without doubling /v1.
 *
 * Convention: GEKIYASU_UPSTREAM_BASE_URL may be either:
 *   - https://api.openai.com/v1  (API root, common)
 *   - https://api.openai.com     (origin only)
 * Client paths are OpenAI-style: /v1/models, /v1/chat/completions, …
 */

export function joinUpstreamUrl(baseUrl: string, pathWithQuery: string): string {
  const base = baseUrl.replace(/\/+$/, "");
  let path = pathWithQuery.startsWith("/")
    ? pathWithQuery
    : `/${pathWithQuery}`;

  const q = path.indexOf("?");
  const pathOnly = q >= 0 ? path.slice(0, q) : path;
  const query = q >= 0 ? path.slice(q) : "";

  let suffix = pathOnly;
  const baseEndsWithV1 = /\/v1$/i.test(base);
  const pathStartsWithV1 =
    pathOnly === "/v1" || pathOnly.toLowerCase().startsWith("/v1/");

  if (baseEndsWithV1 && pathStartsWithV1) {
    // https://api.openai.com/v1 + /v1/models → …/v1/models
    suffix = pathOnly.length === 3 ? "" : pathOnly.slice(3);
    if (suffix && !suffix.startsWith("/")) {
      suffix = `/${suffix}`;
    }
  }

  if (suffix === "" || suffix === "/") {
    // GET /v1 with base …/v1 → base itself
    return `${base}${query}`;
  }

  return `${base}${suffix}${query}`;
}
