import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertSafeUpstreamBaseUrl,
  assertSafeUpstreamUrl,
  buildAllowedHosts,
  canUsePlaceholderApiKeySwap,
  checkProxyToken,
  extractProxyToken,
  isLoopbackHost,
  isPrivateOrLinkLocalIpv4,
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

describe("isPrivateOrLinkLocalIpv4", () => {
  it("flags RFC1918 and metadata", () => {
    assert.equal(isPrivateOrLinkLocalIpv4("10.0.0.1"), true);
    assert.equal(isPrivateOrLinkLocalIpv4("192.168.0.1"), true);
    assert.equal(isPrivateOrLinkLocalIpv4("169.254.169.254"), true);
    assert.equal(isPrivateOrLinkLocalIpv4("8.8.8.8"), false);
  });
});

describe("assertSafeUpstreamUrl / allowlist", () => {
  const openaiHosts = buildAllowedHosts("https://api.openai.com/v1", []);

  it("allows listed https host", () => {
    const u = assertSafeUpstreamUrl("https://api.openai.com/v1/chat/completions", {
      allowedHosts: openaiHosts,
    });
    assert.equal(u.hostname, "api.openai.com");
  });

  it("rejects host not on allowlist", () => {
    assert.throws(() =>
      assertSafeUpstreamUrl("https://evil.example/v1/chat", {
        allowedHosts: openaiHosts,
      }),
    );
  });

  it("rejects private IP even on https", () => {
    assert.throws(() =>
      assertSafeUpstreamUrl("https://169.254.169.254/latest", {
        allowedHosts: ["169.254.169.254"],
      }),
    );
  });

  it("allows http loopback", () => {
    assertSafeUpstreamUrl("http://127.0.0.1:8080/v1", {
      allowedHosts: ["api.openai.com"],
    });
  });

  it("rejects cleartext non-loopback", () => {
    assert.throws(() =>
      assertSafeUpstreamUrl("http://evil.example/v1", {
        allowedHosts: ["evil.example"],
      }),
    );
  });

  it("rejects credentials", () => {
    assert.throws(() =>
      assertSafeUpstreamUrl("https://user:pass@api.openai.com/v1", {
        allowedHosts: openaiHosts,
      }),
    );
  });
});

describe("assertSafeUpstreamBaseUrl bootstrap", () => {
  it("allows default OpenAI https", () => {
    assert.equal(
      assertSafeUpstreamBaseUrl("https://api.openai.com/v1"),
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

describe("proxy token", () => {
  it("extracts from X-Gekiyasu-Token", () => {
    assert.equal(
      extractProxyToken({ "x-gekiyasu-token": "secret" }),
      "secret",
    );
  });
  it("extracts from Bearer gekiyasu-proxy:", () => {
    assert.equal(
      extractProxyToken({ authorization: "Bearer gekiyasu-proxy:secret" }),
      "secret",
    );
  });
  it("extracts when clients prefix Bearer around a user-entered Bearer token", () => {
    assert.equal(
      extractProxyToken({
        authorization: "Bearer Bearer gekiyasu-proxy:secret",
      }),
      "secret",
    );
  });
  it("skips check when not configured", () => {
    assert.deepEqual(checkProxyToken({}, undefined), { ok: true });
  });
  it("requires token when configured", () => {
    assert.equal(checkProxyToken({}, "secret").ok, false);
    assert.equal(
      checkProxyToken({ "x-gekiyasu-token": "wrong" }, "secret").ok,
      false,
    );
    assert.deepEqual(
      checkProxyToken({ "x-gekiyasu-token": "secret" }, "secret"),
      { ok: true },
    );
  });
});
