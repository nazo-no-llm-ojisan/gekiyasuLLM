/**
 * Pure CORS-headers builder shared by `server.ts` (preflight / JSON error
 * paths) and `executor.ts` (streaming upstream pipe paths).
 *
 * Fail-closed: when `allowlist` is empty, no permissive CORS headers are
 * returned. When non-empty, an exact-match `Origin` request header gets
 * the allowlist-shaped response; everything else gets `{}`.
 *
 * Kept in its own module so `executor.ts` can apply the same allowlist
 * policy to streaming responses without depending on `server.ts` (and
 * without duplicating the rule).
 */

export function corsHeadersFor(
  req: { headers: { origin?: string | string[] | undefined } } | undefined,
  allowlist: string[],
): Record<string, string> {
  if (!req) return {};
  const origin = req.headers.origin;
  const allowed =
    typeof origin === "string" && allowlist.includes(origin) ? origin : undefined;
  if (!allowed) {
    return {};
  }
  return {
    "access-control-allow-origin": allowed,
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers":
      "authorization,content-type,x-gekiyasu-token,openai-organization,openai-project",
    "access-control-expose-headers":
      "x-gekiyasu-route-plan,x-gekiyasu-offering,x-gekiyasu-attempts,x-gekiyasu-fallback",
    "access-control-allow-credentials": "true",
    "access-control-allow-private-network": "true",
    vary: "Origin",
  } as Record<string, string>;
}
