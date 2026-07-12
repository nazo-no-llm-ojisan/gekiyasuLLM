/**
 * Local proxy defaults.
 * Port 16191 is fixed project-wide (@gekiyasu/schema + docs).
 */

import {
  DEFAULT_PROXY_HOST,
  DEFAULT_PROXY_PORT,
} from "@gekiyasu/schema";
import { assertSafeUpstreamBaseUrl, isLoopbackHost } from "./security.js";

export const DEFAULT_HOST = DEFAULT_PROXY_HOST;
export const DEFAULT_PORT = DEFAULT_PROXY_PORT;
export const DEFAULT_UPSTREAM_BASE_URL = "https://api.openai.com/v1";

/** Max request body bytes buffered before upstream (MVP; not streaming request body). */
export const DEFAULT_MAX_BODY_BYTES = 20 * 1024 * 1024; // 20 MiB

/** Upstream fetch timeout (ms). */
export const DEFAULT_UPSTREAM_TIMEOUT_MS = 120_000;

export type ProxyConfig = {
  host: string;
  port: number;
  /** Upstream OpenAI-compatible API root, including /v1 if required */
  upstreamBaseUrl: string;
  /** Used when the client does not send Authorization */
  upstreamApiKey: string | undefined;
  maxBodyBytes: number;
  upstreamTimeoutMs: number;
  /**
   * When true (loopback bind only by default), Bearer local|gekiyasu|sk-local
   * may be replaced by upstreamApiKey.
   */
  allowPlaceholderApiKeySwap: boolean;
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

export function loadConfig(overrides: Partial<ProxyConfig> = {}): ProxyConfig {
  const portRaw = env("GEKIYASU_PORT") ?? env("PORT");
  const port = portRaw ? Number(portRaw) : DEFAULT_PORT;
  if (!Number.isFinite(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid port: ${portRaw}`);
  }

  const host = overrides.host ?? env("GEKIYASU_HOST") ?? DEFAULT_HOST;
  const allowlistRaw = env("GEKIYASU_UPSTREAM_ALLOWLIST");
  const extraAllowedHosts = allowlistRaw
    ? allowlistRaw.split(",").map((s) => s.trim()).filter(Boolean)
    : [];

  const upstreamBaseUrl = assertSafeUpstreamBaseUrl(
    (
      overrides.upstreamBaseUrl ??
      env("GEKIYASU_UPSTREAM_BASE_URL") ??
      DEFAULT_UPSTREAM_BASE_URL
    ).replace(/\/+$/, ""),
    { extraAllowedHosts },
  );

  return {
    host,
    port: overrides.port ?? port,
    upstreamBaseUrl,
    upstreamApiKey:
      overrides.upstreamApiKey ??
      env("GEKIYASU_UPSTREAM_API_KEY") ??
      env("OPENAI_API_KEY"),
    maxBodyBytes:
      overrides.maxBodyBytes ??
      envInt("GEKIYASU_MAX_BODY_BYTES", DEFAULT_MAX_BODY_BYTES),
    upstreamTimeoutMs:
      overrides.upstreamTimeoutMs ??
      envInt("GEKIYASU_UPSTREAM_TIMEOUT_MS", DEFAULT_UPSTREAM_TIMEOUT_MS),
    allowPlaceholderApiKeySwap:
      overrides.allowPlaceholderApiKeySwap ?? isLoopbackHost(host),
  };
}
