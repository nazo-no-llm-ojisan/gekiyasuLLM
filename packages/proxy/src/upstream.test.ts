import assert from "node:assert/strict";
import type { IncomingMessage } from "node:http";
import { describe, it } from "node:test";
import type { ProxyConfig } from "./config.js";
import { buildUpstreamHeaders, pickAuthHeader } from "./upstream.js";

function reqWithHeaders(
  headers: Record<string, string | string[] | undefined>,
): IncomingMessage {
  const lower: Record<string, string | string[] | undefined> = {};
  for (const [k, v] of Object.entries(headers)) {
    lower[k.toLowerCase()] = v;
  }
  return { headers: lower } as IncomingMessage;
}

const baseConfig = {
  host: "127.0.0.1",
  port: 16191,
  upstreamBaseUrl: "https://api.openai.com/v1",
  allowedUpstreamHosts: ["api.openai.com"],
  upstreamApiKey: "sk-upstream",
  proxyToken: undefined,
  maxBodyBytes: 1_000_000,
  upstreamTimeoutMs: 5000,
  allowPlaceholderApiKeySwap: true,
  providerApiKeys: {},
  statsFile: undefined,
  circuitFailureThreshold: 3,
  circuitOpenSeconds: 300,
} satisfies ProxyConfig;

describe("buildUpstreamHeaders", () => {
  it("allowlists safe headers and never copies credential/session headers", () => {
    const req = reqWithHeaders({
      "content-type": "application/json",
      accept: "application/json",
      "accept-language": "en",
      "user-agent": "test-agent",
      authorization: "Bearer client-secret",
      cookie: "session=secret",
      "x-api-key": "client-x-api-key",
      "x-gekiyasu-token": "proxy-token-secret",
      "proxy-authorization": "Basic abc",
      "x-custom-leak": "should-not-forward",
      "openai-organization": "org-123",
      "idempotency-key": "idem-1",
    });

    const headers = buildUpstreamHeaders(req, baseConfig);

    assert.equal(headers.get("content-type"), "application/json");
    assert.equal(headers.get("accept"), "application/json");
    assert.equal(headers.get("accept-language"), "en");
    assert.equal(headers.get("user-agent"), "test-agent");
    // Tenant headers forwarded only on the configured upstream origin (T-031).
    // baseConfig.upstreamBaseUrl is api.openai.com, so a foreign target origin
    // must NOT receive them.
    assert.equal(headers.get("openai-organization"), null);
    assert.equal(headers.get("idempotency-key"), null);

    assert.equal(headers.get("authorization"), null);
    assert.equal(headers.get("cookie"), null);
    assert.equal(headers.get("x-api-key"), null);
    assert.equal(headers.get("x-gekiyasu-token"), null);
    assert.equal(headers.get("proxy-authorization"), null);
    assert.equal(headers.get("x-custom-leak"), null);
  });

  it("does not inject Authorization from pickAuthHeader", () => {
    const req = reqWithHeaders({
      authorization: "Bearer client-key",
      "content-type": "application/json",
    });
    const headers = buildUpstreamHeaders(req, baseConfig);
    assert.equal(headers.get("authorization"), null);
    // Callers still resolve auth separately
    assert.equal(pickAuthHeader(req, baseConfig), "Bearer client-key");
  });
});

describe("buildUpstreamHeaders tenant origin-scope (T-031)", () => {
  const req = reqWithHeaders({
    "content-type": "application/json",
    "openai-organization": "org-123",
    "openai-project": "proj-1",
    "idempotency-key": "idem-1",
  });

  it("forwards tenant headers on the configured upstream origin", () => {
    const headers = buildUpstreamHeaders(req, baseConfig, {
      targetBaseUrl: "https://api.openai.com/v1",
    });
    assert.equal(headers.get("openai-organization"), "org-123");
    assert.equal(headers.get("openai-project"), "proj-1");
    assert.equal(headers.get("idempotency-key"), "idem-1");
  });

  it("drops tenant headers on a foreign origin", () => {
    const headers = buildUpstreamHeaders(req, baseConfig, {
      targetBaseUrl: "https://a.example/v1",
    });
    assert.equal(headers.get("openai-organization"), null);
    assert.equal(headers.get("openai-project"), null);
    assert.equal(headers.get("idempotency-key"), null);
  });
});
