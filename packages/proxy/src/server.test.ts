import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { join, resolve } from "node:path";
import { createServer } from "./server.js";
import type { ProxyConfig } from "./config.js";

// Resolved from `process.cwd()` (= packages/proxy under `npm test`).
// `import.meta.url` here is unreliable across tsx --test invocations, so
// anchor paths to the test runner's cwd.
function resolveFixturesDir(): string {
  return join(resolve(process.cwd(), "../.."), "fixtures", "feeds");
}

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
    circuitFailureThreshold: 3,
    circuitOpenSeconds: 300,
    corsAllowlist: [],
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

describe("request-aware routing on the real server (issue #2)", () => {
  it("rewrites model to the matching offering's upstreamModelId on POST /v1/chat/completions", async () => {
    // Stand up a fake upstream that records the incoming request body.
    const received: { body: string; authorization?: string } = { body: "" };
    const upstream = await import("node:http").then((m) =>
      m.createServer((req, res) => {
        const chunks: Buffer[] = [];
        req.on("data", (c: Buffer) => chunks.push(c));
        req.on("end", () => {
          received.body = Buffer.concat(chunks).toString("utf8");
          const auth = req.headers.authorization;
          received.authorization = Array.isArray(auth) ? auth[0] : auth;
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify({ ok: true }));
        });
      }),
    );
    await new Promise<void>((resolve) => upstream.listen(0, "127.0.0.1", resolve));
    const upAddr = upstream.address();
    assert.ok(upAddr && typeof upAddr === "object");
    const upPort = upAddr.port;

    try {
      // Custom feed whose only offering routes to our local fake upstream
      // and declares its logical model as "minimax-m3".
      const feedFile = join(resolveFixturesDir(), "issue-2-feed.json");
      const { writeFileSync, unlinkSync } = await import("node:fs");
      writeFileSync(
        feedFile,
        JSON.stringify({
          feed_version: "test-0.1.0",
          as_of: "2026-07-12T00:00:00Z",
          endpoints: [
            {
              id: "local-up",
              providerId: "localprov",
              baseUrl: `http://127.0.0.1:${upPort}/v1`,
              apiCompat: "openai_chat",
            },
          ],
          providers: [
            {
              id: "localprov",
              displayName: "Local Prov",
              relationships: { sponsored: false, affiliate: false, editorial_rank_influence: "none" },
            },
          ],
          offerings: [
            {
              id: "local-up:minimax-m3",
              modelId: "minimax-m3",
              providerId: "localprov",
              endpointId: "local-up",
              upstreamModelId: "internal-mm-m3",
              declaredCapabilities: { streaming: true, tools: true },
              status: "active",
              relationships: { sponsored: false, affiliate: false, editorial_rank_influence: "none" },
              pricing: {
                currency: { raw: "USD", normalized: "USD", evidence: { sourceUrl: "x", retrievedAt: "2026-07-12T00:00:00Z", sourceType: "manual", confidence: "confirmed" } },
                asOf: "2026-07-12",
                inputPerMillion: { raw: "0", normalized: 0, evidence: { sourceUrl: "x", retrievedAt: "2026-07-12T00:00:00Z", sourceType: "manual", confidence: "confirmed" } },
                outputPerMillion: { raw: "0", normalized: 0, evidence: { sourceUrl: "x", retrievedAt: "2026-07-12T00:00:00Z", sourceType: "manual", confidence: "confirmed" } },
              },
            },
          ],
        }),
        "utf8",
      );

      try {
        const config = testConfig({
          upstreamBaseUrl: "https://api.openai.com/v1",
          allowedUpstreamHosts: ["127.0.0.1", "api.openai.com"],
          providerApiKeys: { localprov: "proxy-owned-key" },
          feedFile,
        });
        await withServer(config, async (baseUrl) => {
          const res = await fetch(`${baseUrl}/v1/chat/completions`, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              authorization: "Bearer proxy-token",
            },
            body: JSON.stringify({ model: "minimax-m3", messages: [{ role: "user", content: "hi" }] }),
          });
          assert.equal(res.status, 200, "request should succeed");
          // Upstream received the body with the rewritten model.
          const upstreamBody = JSON.parse(received.body) as { model?: string };
          assert.equal(upstreamBody.model, "internal-mm-m3");
          assert.equal(received.authorization, "Bearer proxy-owned-key");
        });
      } finally {
        unlinkSync(feedFile);
      }
    } finally {
      await new Promise<void>((resolve) =>
        upstream.close(() => resolve()),
      );
    }
  });

  it("fails closed with 400 no_matching_offering when the body asks for an unknown model", async () => {
    const feedFile = join(resolveFixturesDir(), "issue-2-unknown-feed.json");
    const { writeFileSync, unlinkSync } = await import("node:fs");
    writeFileSync(
      feedFile,
      JSON.stringify({
        feed_version: "test-0.1.0",
        as_of: "2026-07-12T00:00:00Z",
        endpoints: [
          {
            id: "local-up",
            providerId: "localprov",
            baseUrl: "http://127.0.0.1:1/v1",
            apiCompat: "openai_chat",
          },
        ],
        providers: [
          {
            id: "localprov",
            displayName: "Local Prov",
            relationships: { sponsored: false, affiliate: false, editorial_rank_influence: "none" },
          },
        ],
        offerings: [
          {
            id: "local-up:minimax-m3",
            modelId: "minimax-m3",
            providerId: "localprov",
            endpointId: "local-up",
            upstreamModelId: "internal-mm-m3",
            declaredCapabilities: { streaming: true, tools: true },
            status: "active",
            relationships: { sponsored: false, affiliate: false, editorial_rank_influence: "none" },
            pricing: {
              currency: { raw: "USD", normalized: "USD", evidence: { sourceUrl: "x", retrievedAt: "2026-07-12T00:00:00Z", sourceType: "manual", confidence: "confirmed" } },
              asOf: "2026-07-12",
              inputPerMillion: { raw: "0", normalized: 0, evidence: { sourceUrl: "x", retrievedAt: "2026-07-12T00:00:00Z", sourceType: "manual", confidence: "confirmed" } },
              outputPerMillion: { raw: "0", normalized: 0, evidence: { sourceUrl: "x", retrievedAt: "2026-07-12T00:00:00Z", sourceType: "manual", confidence: "confirmed" } },
            },
          },
        ],
      }),
      "utf8",
    );

    try {
      const config = testConfig({
        upstreamBaseUrl: "https://api.openai.com/v1",
        allowedUpstreamHosts: ["127.0.0.1", "api.openai.com"],
        providerApiKeys: { localprov: "proxy-owned-key" },
        feedFile,
      });
      await withServer(config, async (baseUrl) => {
        const res = await fetch(`${baseUrl}/v1/chat/completions`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: "Bearer proxy-token",
          },
          body: JSON.stringify({ model: "no-such-model", messages: [] }),
        });
        assert.equal(res.status, 400);
        const err = (await res.json()) as { error?: { code?: string } };
        assert.equal(err.error?.code, "no_matching_offering");
      });
    } finally {
      unlinkSync(feedFile);
    }
  });
});

describe("CORS preflight (T-047 / issue #3)", () => {
  it("reflects an allowlisted origin on OPTIONS and includes credentials + private-network", async () => {
    await withServer(
      testConfig({ corsAllowlist: ["http://localhost:8080"] }),
      async (baseUrl) => {
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
      },
    );
  });

  it("adds CORS headers to JSON errors when origin is allowlisted", async () => {
    await withServer(
      testConfig({ corsAllowlist: ["http://localhost:3000"] }),
      async (baseUrl) => {
        const res = await fetch(`${baseUrl}/v1/models`, {
          headers: { origin: "http://localhost:3000" },
        });

        assert.equal(res.status, 401);
        assert.equal(
          res.headers.get("access-control-allow-origin"),
          "http://localhost:3000",
        );
        assert.equal(
          res.headers.get("access-control-allow-credentials"),
          "true",
        );
      },
    );
  });

  it("adds no permissive CORS headers when the origin is not allowlisted (issue #3 / default)", async () => {
    await withServer(testConfig(), async (baseUrl) => {
      const res = await fetch(`${baseUrl}/v1/models`, {
        headers: { origin: "http://attacker.example" },
      });

      assert.equal(res.status, 401);
      // No CORS reflection.
      assert.equal(res.headers.get("access-control-allow-origin"), null);
      assert.equal(
        res.headers.get("access-control-allow-credentials"),
        null,
      );
      assert.equal(
        res.headers.get("access-control-allow-private-network"),
        null,
      );
    });
  });

  it("OPTIONS from an unallowlisted origin is rejected with no CORS grant", async () => {
    await withServer(
      testConfig({ corsAllowlist: ["http://allowed.example"] }),
      async (baseUrl) => {
        const res = await fetch(`${baseUrl}/v1/models`, {
          method: "OPTIONS",
          headers: {
            origin: "http://attacker.example",
            "access-control-request-method": "GET",
          },
        });

        assert.equal(res.status, 204);
        // No Access-Control-Allow-Origin → browser will block the actual call.
        assert.equal(res.headers.get("access-control-allow-origin"), null);
        assert.equal(
          res.headers.get("access-control-allow-private-network"),
          null,
        );
      },
    );
  });

  it("Access-Control-Allow-Private-Network is absent when no origin is allowlisted", async () => {
    await withServer(testConfig(), async (baseUrl) => {
      const res = await fetch(`${baseUrl}/health`);
      assert.equal(
        res.headers.get("access-control-allow-private-network"),
        null,
      );
      assert.equal(res.headers.get("access-control-allow-origin"), null);
    });
  });
});
