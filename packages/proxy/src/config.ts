/**
 * Local proxy defaults.
 * Port 16191 is fixed project-wide (@gekiyasu/schema + docs).
 */

import { join } from "node:path";
import {
  DEFAULT_PROXY_HOST,
  DEFAULT_PROXY_PORT,
} from "@gekiyasu/schema";
import {
  assertSafeUpstreamBaseUrl,
  buildAllowedHosts,
  isLoopbackHost,
  parseHostAllowlist,
} from "./security.js";

export const DEFAULT_HOST = DEFAULT_PROXY_HOST;
export const DEFAULT_PORT = DEFAULT_PROXY_PORT;
export const DEFAULT_UPSTREAM_BASE_URL = "https://api.openai.com/v1";

/** Max request body bytes buffered before upstream (MVP; not streaming request body). */
export const DEFAULT_MAX_BODY_BYTES = 20 * 1024 * 1024; // 20 MiB

/** Upstream fetch timeout (ms). */
export const DEFAULT_UPSTREAM_TIMEOUT_MS = 120_000;

/** Circuit breaker: consecutive failures before an offering is skipped. */
export const DEFAULT_CIRCUIT_FAILURE_THRESHOLD = 3;

/** Circuit breaker: seconds an offering stays blocked once open. */
export const DEFAULT_CIRCUIT_OPEN_SECONDS = 300;

export type ProxyConfig = {
  host: string;
  port: number;
  /** Upstream OpenAI-compatible API root, including /v1 if required */
  upstreamBaseUrl: string;
  /** Hosts permitted for upstream fetches (base host + allowlist). */
  allowedUpstreamHosts: string[];
  /** Used when the client does not send Authorization */
  upstreamApiKey: string | undefined;
  /**
   * When set, every /v1/* request must present X-Gekiyasu-Token (or Bearer gekiyasu-proxy:…).
   * Health stays open.
   */
  proxyToken: string | undefined;
  maxBodyBytes: number;
  upstreamTimeoutMs: number;
  /** Circuit breaker: consecutive failures before an offering is skipped. */
  circuitFailureThreshold: number;
  /** Circuit breaker: seconds an offering stays blocked once open. */
  circuitOpenSeconds: number;
  /**
   * When true (loopback bind only by default), Bearer local|gekiyasu|sk-local
   * may be replaced by upstreamApiKey.
   */
  allowPlaceholderApiKeySwap: boolean;
  feedFile?: string;
  /**
   * Proxy-owned API keys keyed by providerId (not client-supplied credentials).
   *
   * Used when the target offering origin differs from `upstreamBaseUrl` origin,
   * so client Authorization is never reused across providers/origins.
   *
   * Future: migrate to endpoint/origin-scoped credential mapping
   * (e.g. by base URL origin or offering id) instead of providerId alone.
   */
  providerApiKeys: Record<string, string>;
  /**
   * Append-only JSONL path for local request stats (L10).
   * Metadata only — no prompts/bodies/keys.
   * `undefined` disables recording. Default: `{cwd}/data/stats.jsonl`.
   * Set GEKIYASU_STATS_FILE=off to disable.
   */
  statsFile: string | undefined;
};

function env(name: string): string | undefined {
  const v = process.env[name];
  return v && v.length > 0 ? v : undefined;
}

function envInt(name: string, fallback: number): number {
  const raw = env(name);
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`Invalid ${name}: ${raw}`);
  }
  return n;
}

/** Resolve stats file path; undefined means disabled. */
export function resolveStatsFile(
  override: string | undefined,
  envValue: string | undefined,
  cwd: string = process.cwd(),
): string | undefined {
  if (override !== undefined) {
    return override.length > 0 ? override : undefined;
  }
  if (envValue === "off" || envValue === "false" || envValue === "0") {
    return undefined;
  }
  if (envValue && envValue.length > 0) {
    return envValue;
  }
  return join(cwd, "data", "stats.jsonl");
}

function loadProviderApiKeys(): Record<string, string> {
  const keys: Record<string, string> = {};

  const standardMap: Record<string, string[]> = {
    openai: ["OPENAI_API_KEY"],
    anthropic: ["ANTHROPIC_API_KEY"],
    gemini: ["GEMINI_API_KEY"],
    deepseek: ["DEEPSEEK_API_KEY"],
    groq: ["GROQ_API_KEY"],
    openrouter: ["OPENROUTER_API_KEY"],
  };

  for (const [providerId, envNames] of Object.entries(standardMap)) {
    for (const name of envNames) {
      const val = env(name);
      if (val) {
        keys[providerId] = val;
        break;
      }
    }
  }

  // Load custom ones from GEKIYASU_PROVIDER_KEY_ prefix
  for (const [key, val] of Object.entries(process.env)) {
    if (key.startsWith("GEKIYASU_PROVIDER_KEY_") && val && val.length > 0) {
      const providerId = key.substring("GEKIYASU_PROVIDER_KEY_".length).toLowerCase();
      keys[providerId] = val;
    }
  }

  return keys;
}

export function loadConfig(overrides: Partial<ProxyConfig> = {}): ProxyConfig {
  const portRaw = env("GEKIYASU_PORT") ?? env("PORT");
  const port = portRaw ? Number(portRaw) : DEFAULT_PORT;
  if (!Number.isFinite(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid port: ${portRaw}`);
  }

  const host = overrides.host ?? env("GEKIYASU_HOST") ?? DEFAULT_HOST;
  const extraAllowedHosts = parseHostAllowlist(env("GEKIYASU_UPSTREAM_ALLOWLIST"));

  const upstreamBaseUrl = assertSafeUpstreamBaseUrl(
    (
      overrides.upstreamBaseUrl ??
      env("GEKIYASU_UPSTREAM_BASE_URL") ??
      DEFAULT_UPSTREAM_BASE_URL
    ).replace(/\/+$/, ""),
    { extraAllowedHosts },
  );

  const allowedUpstreamHosts =
    overrides.allowedUpstreamHosts ??
    buildAllowedHosts(upstreamBaseUrl, extraAllowedHosts);

  return {
    host,
    port: overrides.port ?? port,
    upstreamBaseUrl,
    allowedUpstreamHosts,
    upstreamApiKey:
      overrides.upstreamApiKey ??
      env("GEKIYASU_UPSTREAM_API_KEY") ??
      env("OPENAI_API_KEY"),
    proxyToken: overrides.proxyToken ?? env("GEKIYASU_PROXY_TOKEN"),
    maxBodyBytes:
      overrides.maxBodyBytes ??
      envInt("GEKIYASU_MAX_BODY_BYTES", DEFAULT_MAX_BODY_BYTES),
    upstreamTimeoutMs:
      overrides.upstreamTimeoutMs ??
      envInt("GEKIYASU_UPSTREAM_TIMEOUT_MS", DEFAULT_UPSTREAM_TIMEOUT_MS),
    circuitFailureThreshold:
      overrides.circuitFailureThreshold ??
      envInt("GEKIYASU_CIRCUIT_FAILURES", DEFAULT_CIRCUIT_FAILURE_THRESHOLD),
    circuitOpenSeconds:
      overrides.circuitOpenSeconds ??
      envInt("GEKIYASU_CIRCUIT_OPEN_SECONDS", DEFAULT_CIRCUIT_OPEN_SECONDS),
    allowPlaceholderApiKeySwap:
      overrides.allowPlaceholderApiKeySwap ?? isLoopbackHost(host),
    feedFile: overrides.feedFile ?? env("GEKIYASU_FEED_FILE"),
    providerApiKeys: overrides.providerApiKeys ?? loadProviderApiKeys(),
    statsFile: resolveStatsFile(
      overrides.statsFile,
      env("GEKIYASU_STATS_FILE"),
    ),
  };
}
