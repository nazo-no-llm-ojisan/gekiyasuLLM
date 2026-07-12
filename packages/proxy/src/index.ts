#!/usr/bin/env node
import { DEFAULT_HOST, DEFAULT_PORT, loadConfig } from "./config.js";
import { isLoopbackHost } from "./security.js";
import { listen } from "./server.js";

function printHelp(): void {
  console.log(`gekiyasuLLMProxy — local OpenAI-compatible proxy

Usage:
  gekiyasu-proxy serve

Default listen: http://${DEFAULT_HOST}:${DEFAULT_PORT}
  (override with GEKIYASU_HOST / GEKIYASU_PORT)

Upstream (default https://api.openai.com/v1):
  GEKIYASU_UPSTREAM_BASE_URL
  GEKIYASU_UPSTREAM_ALLOWLIST   # optional extra hosts (comma-separated)
  OPENAI_API_KEY or GEKIYASU_UPSTREAM_API_KEY

Proxy auth (recommended):
  GEKIYASU_PROXY_TOKEN         # require X-Gekiyasu-Token on /v1/*

Client base URL example:
  http://127.0.0.1:${DEFAULT_PORT}/v1
`);
}

async function main(): Promise<void> {
  const [cmd] = process.argv.slice(2);
  if (!cmd || cmd === "-h" || cmd === "--help" || cmd === "help") {
    printHelp();
    process.exit(cmd ? 0 : 1);
  }
  if (cmd !== "serve") {
    console.error(`Unknown command: ${cmd}`);
    printHelp();
    process.exit(1);
  }

  const config = loadConfig();
  if (!isLoopbackHost(config.host)) {
    console.warn(
      `[warn] Binding to ${config.host}. Prefer 127.0.0.1 unless you intentionally expose the proxy.`,
    );
    const allowUnauth =
      process.env.GEKIYASU_ALLOW_UNAUTHENTICATED_REMOTE === "true";
    if (!config.proxyToken && !allowUnauth) {
      console.error(
        "[fatal] Non-loopback bind requires GEKIYASU_PROXY_TOKEN, or set GEKIYASU_ALLOW_UNAUTHENTICATED_REMOTE=true (dangerous).",
      );
      process.exit(1);
    }
    if (!config.proxyToken && allowUnauth) {
      console.warn(
        "[warn] GEKIYASU_ALLOW_UNAUTHENTICATED_REMOTE=true — /v1 is open on a non-loopback address.",
      );
    }
  }

  const running = await listen(config);
  console.log(`gekiyasuLLMProxy listening on ${running.url}`);
  console.log(`  OpenAI base URL for clients: ${running.url}/v1`);
  console.log(`  Upstream: ${config.upstreamBaseUrl}`);
  console.log(`  Health: ${running.url}/health`);
  console.log(`  Dashboard (static): ${running.url}/dashboard/`);
  if (config.proxyToken) {
    console.log("  Proxy token: required (X-Gekiyasu-Token)");
  } else {
    console.log(
      "  Proxy token: not set (GEKIYASU_PROXY_TOKEN). /v1 is open to anyone who can reach the bind address.",
    );
  }
  console.log(`  Upstream allowlist: ${config.allowedUpstreamHosts.join(", ")}`);
  if (config.statsFile) {
    console.log(`  Local stats (JSONL): ${config.statsFile}`);
  } else {
    console.log("  Local stats: disabled");
  }
  if (!config.upstreamApiKey) {
    console.log(
      "  Note: no OPENAI_API_KEY in env; clients must send Authorization: Bearer <key>",
    );
  }

  const shutdown = async () => {
    console.log("\nShutting down…");
    await running.close();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
