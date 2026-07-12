import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createServer } from "./server.js";
import type { ProxyConfig } from "./config.js";

function testConfig(overrides: Partial<ProxyConfig> = {}): ProxyConfig {
  return {
    host: "127.0.0.1",
    port: 0,
    upstreamBaseUrl: "https://api.openai.com/v1",
    allowedUpstreamHosts: ["api.openai.com"],
    upstreamApiKey: "test-upstream-key",
    proxyToken: "proxy-token",
    maxBodyBytes: 1_000_000,
    upstreamTimeoutMs: 1000,
    allowPlaceholderApiKeySwap: true,
    providerApiKeys: {},
    statsFile: undefined,
    ...overrides,
  };
}

async function withServer<T>(
  config: ProxyConfig,
  fn: (baseUrl: string) => Promise<T>,
): Promise<T> {
  const server = createServer(config);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  assert.ok(addr && typeof addr === "object");
  try {
    return await fn(`http://127.0.0.1:${addr.port}`);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  }
}

describe("CORS preflight", () => {
  it("allows OPTIONS without proxy token", async () => {
    await withServer(testConfig(), async (baseUrl) => {
      const res = await fetch(`${baseUrl}/v1/models`, {
        method: "OPTIONS",
        headers: {
          origin: "http://localhost:8080",
          "access-control-request-method": "GET",
          "access-control-request-headers": "authorization,content-type",
        },
      });

      assert.equal(res.status, 204);
      assert.equal(
        res.headers.get("access-control-allow-origin"),
        "http://localhost:8080",
      );
      assert.equal(res.headers.get("access-control-allow-credentials"), "true");
      assert.equal(
        res.headers.get("access-control-allow-private-network"),
        "true",
      );
      assert.match(
        res.headers.get("access-control-allow-headers") ?? "",
        /authorization/i,
      );
    });
  });

  it("adds CORS headers to JSON errors", async () => {
    await withServer(testConfig(), async (baseUrl) => {
      const res = await fetch(`${baseUrl}/v1/models`);

      assert.equal(res.status, 401);
      assert.equal(res.headers.get("access-control-allow-origin"), "*");
    });
  });

  it("reflects Origin on JSON errors for credentialed browser clients", async () => {
    await withServer(testConfig(), async (baseUrl) => {
      const res = await fetch(`${baseUrl}/v1/models`, {
        headers: { origin: "http://localhost:3000" },
      });

      assert.equal(res.status, 401);
      assert.equal(
        res.headers.get("access-control-allow-origin"),
        "http://localhost:3000",
      );
      assert.equal(res.headers.get("access-control-allow-credentials"), "true");
    });
  });
});
