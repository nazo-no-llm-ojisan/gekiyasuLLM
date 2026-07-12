/**
 * Local proxy defaults.
 * Port 16191 is fixed project-wide (@gekiyasu/schema + docs).
 */

import {
  DEFAULT_PROXY_HOST,
  DEFAULT_PROXY_PORT,
} from "@gekiyasu/schema";

export const DEFAULT_HOST = DEFAULT_PROXY_HOST;
export const DEFAULT_PORT = DEFAULT_PROXY_PORT;
export const DEFAULT_UPSTREAM_BASE_URL = "https://api.openai.com/v1";

export type ProxyConfig = {
  host: string;
  port: number;
  /** Upstream OpenAI-compatible API root, including /v1 if required */
  upstreamBaseUrl: string;
  /** Used when the client does not send Authorization */
  upstreamApiKey: string | undefined;
};

function env(name: string): string | undefined {
  const v = process.env[name];
  return v && v.length > 0 ? v : undefined;
}

export function loadConfig(overrides: Partial<ProxyConfig> = {}): ProxyConfig {
  const portRaw = env("GEKIYASU_PORT") ?? env("PORT");
  const port = portRaw ? Number(portRaw) : DEFAULT_PORT;
  if (!Number.isFinite(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid port: ${portRaw}`);
  }

  return {
    host: overrides.host ?? env("GEKIYASU_HOST") ?? DEFAULT_HOST,
    port: overrides.port ?? port,
    upstreamBaseUrl: (
      overrides.upstreamBaseUrl ??
      env("GEKIYASU_UPSTREAM_BASE_URL") ??
      DEFAULT_UPSTREAM_BASE_URL
    ).replace(/\/+$/, ""),
    upstreamApiKey:
      overrides.upstreamApiKey ??
      env("GEKIYASU_UPSTREAM_API_KEY") ??
      env("OPENAI_API_KEY"),
  };
}
