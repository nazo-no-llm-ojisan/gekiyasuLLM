/**
 * Minimal guards for MVP passthrough.
 * Full SSRF allowlist for feed-driven base_url comes before dynamic routing.
 */

export const PLACEHOLDER_BEARERS = new Set([
  "Bearer local",
  "Bearer gekiyasu",
  "Bearer sk-local",
]);

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
 * Validate configured upstream base URL (single static upstream for MVP).
 * Rejects non-http(s), embedded credentials, and cleartext non-loopback.
 */
export function assertSafeUpstreamBaseUrl(
  raw: string,
  opts?: { extraAllowedHosts?: string[] },
): string {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error(`Invalid upstream base URL: ${raw}`);
  }

  if (u.username || u.password) {
    throw new Error("Upstream URL must not contain credentials");
  }

  const protocol = u.protocol.toLowerCase();
  if (protocol !== "https:" && protocol !== "http:") {
    throw new Error(`Upstream URL protocol not allowed: ${u.protocol}`);
  }

  const host = u.hostname.toLowerCase();
  if (protocol === "http:" && !isLoopbackHost(host)) {
    throw new Error(
      "http upstream is only allowed for loopback (127.0.0.1 / localhost). Use https.",
    );
  }

  const extra = (opts?.extraAllowedHosts ?? []).map((h) => h.toLowerCase());
  if (extra.length > 0 && !extra.includes(host) && !isLoopbackHost(host)) {
    throw new Error(
      `Upstream host "${host}" is not in GEKIYASU_UPSTREAM_ALLOWLIST`,
    );
  }

  return raw.replace(/\/+$/, "");
}

export function canUsePlaceholderApiKeySwap(bindHost: string): boolean {
  return isLoopbackHost(bindHost);
}
