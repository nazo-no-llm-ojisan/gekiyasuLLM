import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertSafeUpstreamBaseUrl,
  canUsePlaceholderApiKeySwap,
  isLoopbackHost,
} from "./security.js";

describe("isLoopbackHost", () => {
  it("accepts 127.0.0.1 and localhost", () => {
    assert.equal(isLoopbackHost("127.0.0.1"), true);
    assert.equal(isLoopbackHost("localhost"), true);
  });
  it("rejects lan hosts", () => {
    assert.equal(isLoopbackHost("0.0.0.0"), false);
    assert.equal(isLoopbackHost("192.168.1.1"), false);
  });
});

describe("assertSafeUpstreamBaseUrl", () => {
  it("allows default OpenAI https", () => {
    const u = assertSafeUpstreamBaseUrl("https://api.openai.com/v1");
    assert.equal(u, "https://api.openai.com/v1");
  });
  it("allows http only on loopback", () => {
    assert.equal(
      assertSafeUpstreamBaseUrl("http://127.0.0.1:8080/v1"),
      "http://127.0.0.1:8080/v1",
    );
  });
  it("rejects cleartext non-loopback", () => {
    assert.throws(() => assertSafeUpstreamBaseUrl("http://evil.example/v1"));
  });
  it("rejects credentials in URL", () => {
    assert.throws(() =>
      assertSafeUpstreamBaseUrl("https://user:pass@api.openai.com/v1"),
    );
  });
  it("enforces allowlist when set", () => {
    assert.throws(() =>
      assertSafeUpstreamBaseUrl("https://other.example/v1", {
        extraAllowedHosts: ["api.openai.com"],
      }),
    );
    assert.equal(
      assertSafeUpstreamBaseUrl("https://api.openai.com/v1", {
        extraAllowedHosts: ["api.openai.com"],
      }),
      "https://api.openai.com/v1",
    );
  });
});

describe("canUsePlaceholderApiKeySwap", () => {
  it("only on loopback bind", () => {
    assert.equal(canUsePlaceholderApiKeySwap("127.0.0.1"), true);
    assert.equal(canUsePlaceholderApiKeySwap("0.0.0.0"), false);
  });
});
