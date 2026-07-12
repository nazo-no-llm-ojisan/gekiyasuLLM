/**
 * Proxy-boundary auth + upstream destination allowlist.
 * Use before any dynamic/feed-driven base_url is fetched.
 */

import { timingSafeEqual } from "node:crypto";
import { BlockList, isIPv4, isIPv6 } from "node:net";

export const PLACEHOLDER_BEARERS = new Set([
  "Bearer local",
  "Bearer gekiyasu",
  "Bearer sk-local",
]);

/** Header for authenticating to the local proxy (not the upstream LLM). */
export const PROXY_TOKEN_HEADER = "x-gekiyasu-token";

/** ULA fc00::/7 and link-local fe80::/10 (T-033). */
const PRIVATE_IPV6 = new BlockList();
PRIVATE_IPV6.addSubnet("fc00::", 7, "ipv6");
PRIVATE_IPV6.addSubnet("fe80::", 10, "ipv6");

/** IPv4-mapped IPv6 (::ffff:0:0/96). Do not match bare `:ffff:` inside other addresses. */
const IPV4_MAPPED = new BlockList();
IPV4_MAPPED.addSubnet("::ffff:0:0", 96, "ipv6");

export function isLoopbackHost(host: string): boolean {
  const h = host.trim().toLowerCase();
  return (
    h === "127.0.0.1" ||
    h === "localhost" ||
    h === "::1" ||
    h === "[::1]"
  );
}

/**
 * Strip brackets / zone id for IP classification.
 * URL.hostname is usually unbracketed; callers may still pass zone ids.
 */
function normalizeIpHostname(hostname: string): string {
  let h = hostname.trim().toLowerCase();
  if (h.startsWith("[") && h.endsWith("]")) {
    h = h.slice(1, -1);
  }
  const zone = h.indexOf("%");
  if (zone >= 0) h = h.slice(0, zone);
  return h;
}

/** Block obvious non-public targets (SSRF). Loopback is handled separately. */
export function isPrivateOrLinkLocalIpv4(hostname: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hostname);
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (a === 10) return true;
  if (a === 127) return true; // loopback range — only ok if isLoopbackHost path allows
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  return false;
}

/**
 * Extract embedded IPv4 from IPv4-mapped IPv6 (::ffff:a.b.c.d or ::ffff:xxxx:yyyy).
 * Only addresses in ::ffff:0:0/96 (not ULA endings like fdff:…:ffff:ffff).
 */
export function ipv4FromMappedIpv6(hostname: string): string | undefined {
  const host = normalizeIpHostname(hostname);
  if (!isIPv6(host) || !IPV4_MAPPED.check(host, "ipv6")) return undefined;

  // Dotted form: ::ffff:10.0.0.1
  const dotted = /:ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(host);
  if (dotted && isIPv4(dotted[1]!)) return dotted[1];

  // Hex form: ::ffff:a00:1 → 10.0.0.1
  const hex = /:ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(host);
  if (hex) {
    const hi = Number.parseInt(hex[1]!, 16);
    const lo = Number.parseInt(hex[2]!, 16);
    if (!Number.isFinite(hi) || !Number.isFinite(lo)) return undefined;
    return `${(hi >> 8) & 255}.${hi & 255}.${(lo >> 8) & 255}.${lo & 255}`;
  }

  return undefined;
}

/**
 * IPv6 SSRF ranges (T-033): ULA fc00::/7, link-local fe80::/10,
 * and IPv4-mapped addresses whose embedded v4 is private/link-local.
 */
export function isPrivateOrLinkLocalIpv6(hostname: string): boolean {
  const host = normalizeIpHostname(hostname);
  if (!isIPv6(host)) return false;

  const mappedV4 = ipv4FromMappedIpv6(host);
  if (mappedV4 !== undefined) {
    return isPrivateOrLinkLocalIpv4(mappedV4);
  }

  return PRIVATE_IPV6.check(host, "ipv6");
}

/** v4 or v6 non-public literal (loopback still decided by isLoopbackHost). */
export function isPrivateOrLinkLocalIp(hostname: string): boolean {
  const host = normalizeIpHostname(hostname);
  if (isIPv4(host)) return isPrivateOrLinkLocalIpv4(host);
  if (isIPv6(host)) return isPrivateOrLinkLocalIpv6(host);
  return false;
}

export function canUsePlaceholderApiKeySwap(bindHost: string): boolean {
  return isLoopbackHost(bindHost);
}

export function parseHostAllowlist(csv: string | undefined): string[] {
  if (!csv) return [];
  return csv
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function hostFromBaseUrl(baseUrl: string): string {
  return new URL(baseUrl).hostname.toLowerCase();
}

/**
 * Allowed upstream hosts = host(s) of configured base + explicit allowlist.
 * Loopback hosts are always permitted for http local models.
 */
export function buildAllowedHosts(
  upstreamBaseUrl: string,
  extraAllowedHosts: string[] = [],
): string[] {
  const set = new Set<string>();
  set.add(hostFromBaseUrl(upstreamBaseUrl));
  for (const h of extraAllowedHosts) {
    set.add(h.trim().toLowerCase());
  }
  return [...set];
}

export function safeEqualString(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/**
 * Extract proxy token from X-Gekiyasu-Token or Authorization: Bearer gekiyasu-proxy:<token>
 */
export function extractProxyToken(headers: {
  [key: string]: string | string[] | undefined;
}): string | undefined {
  const raw = headers[PROXY_TOKEN_HEADER] ?? headers["X-Gekiyasu-Token".toLowerCase()];
  const headerVal = Array.isArray(raw) ? raw[0] : raw;
  if (typeof headerVal === "string" && headerVal.length > 0) {
    return headerVal.trim();
  }

  const auth = headers.authorization;
  const authVal = Array.isArray(auth) ? auth[0] : auth;
  if (typeof authVal === "string") {
    return extractProxyTokenFromAuthorization(authVal);
  }
  return undefined;
}

export function extractProxyTokenFromAuthorization(
  authorization: string,
): string | undefined {
  const match = /^Bearer\s+(?:Bearer\s+)?gekiyasu-proxy:(.+)$/i.exec(
    authorization.trim(),
  );
  return match ? match[1]!.trim() : undefined;
}

export function extractBearerValue(authorization: string): string | undefined {
  const match = /^Bearer\s+(.+)$/i.exec(authorization.trim());
  return match ? match[1]!.trim() : undefined;
}

export function isProxyAuthorization(authorization: string): boolean {
  return extractProxyTokenFromAuthorization(authorization) !== undefined;
}

export function describeAuthShape(headers: {
  [key: string]: string | string[] | undefined;
}): string {
  const rawProxyHeader =
    headers[PROXY_TOKEN_HEADER] ?? headers["X-Gekiyasu-Token".toLowerCase()];
  const proxyHeader = Array.isArray(rawProxyHeader)
    ? rawProxyHeader[0]
    : rawProxyHeader;
  if (typeof proxyHeader === "string" && proxyHeader.trim().length > 0) {
    return "x-gekiyasu-token";
  }

  const auth = headers.authorization;
  const authVal = Array.isArray(auth) ? auth[0] : auth;
  if (typeof authVal !== "string" || authVal.trim().length === 0) {
    return "none";
  }

  const trimmed = authVal.trim();
  if (/^Bearer\s+Bearer\s+gekiyasu-proxy:/i.test(trimmed)) {
    return "bearer-bearer-gekiyasu-proxy";
  }
  if (/^Bearer\s+gekiyasu-proxy:/i.test(trimmed)) {
    return "bearer-gekiyasu-proxy";
  }
  if (/^Bearer\s+/i.test(trimmed)) {
    return "bearer-other";
  }
  return "non-bearer";
}

export type ProxyTokenCheck =
  | { ok: true }
  | { ok: false; code: "missing_proxy_token" | "invalid_proxy_token" };

export function checkProxyToken(
  headers: { [key: string]: string | string[] | undefined },
  expected: string | undefined,
): ProxyTokenCheck {
  if (!expected) return { ok: true };
  const got = extractProxyToken(headers);
  if (!got) {
    const auth = headers.authorization;
    const authVal = Array.isArray(auth) ? auth[0] : auth;
    if (typeof authVal === "string") {
      const bearer = extractBearerValue(authVal);
      if (bearer && safeEqualString(bearer, expected)) return { ok: true };
    }
  }
  if (!got) return { ok: false, code: "missing_proxy_token" };
  if (!safeEqualString(got, expected)) {
    return { ok: false, code: "invalid_proxy_token" };
  }
  return { ok: true };
}

export type UpstreamUrlOpts = {
  /** If non-empty, hostname must be in this set (loopback always ok). */
  allowedHosts: string[];
};

/**
 * Validate any upstream base or full request URL before fetch.
 */
export function assertSafeUpstreamUrl(
  raw: string,
  opts: UpstreamUrlOpts,
): URL {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error(`Invalid upstream URL: ${raw}`);
  }

  if (u.username || u.password) {
    throw new Error("Upstream URL must not contain credentials");
  }

  const protocol = u.protocol.toLowerCase();
  if (protocol !== "https:" && protocol !== "http:") {
    throw new Error(`Upstream URL protocol not allowed: ${u.protocol}`);
  }

  const host = u.hostname.toLowerCase();
  const loopback = isLoopbackHost(host);

  if (protocol === "http:" && !loopback) {
    throw new Error(
      "http upstream is only allowed for loopback (127.0.0.1 / localhost). Use https.",
    );
  }

  if (!loopback && isPrivateOrLinkLocalIp(host)) {
    throw new Error(
      `Upstream host "${host}" is a private/link-local address and is blocked`,
    );
  }

  const allowed = opts.allowedHosts.map((h) => h.toLowerCase());
  if (!loopback && allowed.length > 0 && !allowed.includes(host)) {
    throw new Error(
      `Upstream host "${host}" is not in the allowlist (${allowed.join(", ")})`,
    );
  }

  // Non-loopback https with empty allowlist: still require explicit allowlist for safety
  // when calling dynamic URLs — callers should always pass allowedHosts from config.
  if (!loopback && allowed.length === 0) {
    throw new Error(
      "Upstream allowlist is empty; set GEKIYASU_UPSTREAM_BASE_URL / GEKIYASU_UPSTREAM_ALLOWLIST",
    );
  }

  return u;
}

/** @deprecated name — use assertSafeUpstreamUrl; kept for config bootstrap */
export function assertSafeUpstreamBaseUrl(
  raw: string,
  opts?: { extraAllowedHosts?: string[] },
): string {
  const stripped = raw.replace(/\/+$/, "");
  const host = hostFromBaseUrl(stripped);
  const allowed = buildAllowedHosts(stripped, opts?.extraAllowedHosts ?? []);
  // When bootstrapping base URL itself, allow its own host even if extra is empty
  assertSafeUpstreamUrl(stripped, {
    allowedHosts: allowed.length > 0 ? allowed : [host],
  });
  return stripped;
}
