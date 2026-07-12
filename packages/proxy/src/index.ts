#!/usr/bin/env node
import { DEFAULT_HOST, DEFAULT_PORT, loadConfig } from "./config.js";
import { listen } from "./server.js";

function printHelp(): void {
  console.log(`gekiyasuLLMProxy — local OpenAI-compatible proxy

Usage:
  gekiyasu-proxy serve

Default listen: http://${DEFAULT_HOST}:${DEFAULT_PORT}
  (override with GEKIYASU_HOST / GEKIYASU_PORT)

Upstream (default https://api.openai.com/v1):
  GEKIYASU_UPSTREAM_BASE_URL
  OPENAI_API_KEY or GEKIYASU_UPSTREAM_API_KEY

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
  if (config.host !== "127.0.0.1" && config.host !== "localhost") {
    console.warn(
      `[warn] Binding to ${config.host}. Prefer 127.0.0.1 unless you intentionally expose the proxy.`,
    );
    if (!config.allowPlaceholderApiKeySwap) {
      console.warn(
        "[warn] Placeholder API key swap (Bearer local|gekiyasu|sk-local) is DISABLED off loopback.",
      );
    }
  }

  const running = await listen(config);
  console.log(`gekiyasuLLMProxy listening on ${running.url}`);
  console.log(`  OpenAI base URL for clients: ${running.url}/v1`);
  console.log(`  Upstream: ${config.upstreamBaseUrl}`);
  console.log(`  Health: ${running.url}/health`);
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
