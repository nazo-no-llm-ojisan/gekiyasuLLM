import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertSafeUpstreamBaseUrl,
  assertSafeUpstreamUrl,
  buildAllowedHosts,
  canUsePlaceholderApiKeySwap,
  checkProxyToken,
  describeAuthShape,
  extractProxyToken,
  isLoopbackHost,
  isPrivateOrLinkLocalIp,
  isPrivateOrLinkLocalIpv4,
  isPrivateOrLinkLocalIpv6,
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

describe("isPrivateOrLinkLocalIpv6 (T-033)", () => {
  it("flags ULA fc00::/7", () => {
    assert.equal(isPrivateOrLinkLocalIpv6("fc00::1"), true);
    assert.equal(isPrivateOrLinkLocalIpv6("fd12:3456:789a::1"), true);
    // Must not mis-parse trailing :ffff:ffff as IPv4-mapped
    assert.equal(isPrivateOrLinkLocalIpv6("fdff:ffff:ffff:ffff:ffff:ffff:ffff:ffff"), true);
  });

  it("flags link-local fe80::/10", () => {
    assert.equal(isPrivateOrLinkLocalIpv6("fe80::1"), true);
    assert.equal(isPrivateOrLinkLocalIpv6("febf::1"), true);
    assert.equal(isPrivateOrLinkLocalIpv6("fe80::1%eth0"), true);
  });

  it("flags IPv4-mapped private addresses", () => {
    assert.equal(isPrivateOrLinkLocalIpv6("::ffff:10.0.0.1"), true);
    assert.equal(isPrivateOrLinkLocalIpv6("::ffff:192.168.1.1"), true);
    assert.equal(isPrivateOrLinkLocalIpv6("::ffff:169.254.169.254"), true);
    assert.equal(isPrivateOrLinkLocalIpv6("::ffff:a00:1"), true); // 10.0.0.1
  });

  it("does not flag public IPv6 or public IPv4-mapped", () => {
    assert.equal(isPrivateOrLinkLocalIpv6("2001:4860:4860::8888"), false);
    assert.equal(isPrivateOrLinkLocalIpv6("::ffff:8.8.8.8"), false);
    assert.equal(isPrivateOrLinkLocalIpv6("not-an-ip"), false);
  });

  it("isPrivateOrLinkLocalIp covers v4 and v6", () => {
    assert.equal(isPrivateOrLinkLocalIp("10.0.0.1"), true);
    assert.equal(isPrivateOrLinkLocalIp("fc00::1"), true);
    assert.equal(isPrivateOrLinkLocalIp("8.8.8.8"), false);
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

  it("rejects IPv6 ULA even when allowlisted (T-033)", () => {
    assert.throws(
      () =>
        assertSafeUpstreamUrl("https://[fc00::1]/v1", {
          allowedHosts: ["fc00::1"],
        }),
      /private|link-local|blocked/i,
    );
  });

  it("rejects IPv6 link-local even when allowlisted (T-033)", () => {
    assert.throws(
      () =>
        assertSafeUpstreamUrl("https://[fe80::1]/v1", {
          allowedHosts: ["fe80::1"],
        }),
      /private|link-local|blocked/i,
    );
  });

  it("rejects IPv4-mapped private even when allowlisted (T-033)", () => {
    assert.throws(
      () =>
        assertSafeUpstreamUrl("https://[::ffff:10.1.2.3]/v1", {
          allowedHosts: ["::ffff:10.1.2.3"],
        }),
      /private|link-local|blocked/i,
    );
  });

  it("allows http loopback", () => {
    assertSafeUpstreamUrl("http://127.0.0.1:8080/v1", {
      allowedHosts: ["api.openai.com"],
    });
  });

  it("allows http IPv6 loopback", () => {
    assertSafeUpstreamUrl("http://[::1]:8080/v1", {
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
  it("accepts raw proxy token in standard Bearer auth for one-key clients", () => {
    assert.deepEqual(
      checkProxyToken({ authorization: "Bearer secret" }, "secret"),
      { ok: true },
    );
    assert.equal(
      checkProxyToken({ authorization: "Bearer wrong" }, "secret").ok,
      false,
    );
  });
  it("describes auth shape without exposing values", () => {
    assert.equal(describeAuthShape({}), "none");
    assert.equal(
      describeAuthShape({ authorization: "Bearer gekiyasu-proxy:secret" }),
      "bearer-gekiyasu-proxy",
    );
    assert.equal(
      describeAuthShape({
        authorization: "Bearer Bearer gekiyasu-proxy:secret",
      }),
      "bearer-bearer-gekiyasu-proxy",
    );
    assert.equal(
      describeAuthShape({ authorization: "Bearer sk-secret" }),
      "bearer-other",
    );
    assert.equal(
      describeAuthShape({ "x-gekiyasu-token": "secret" }),
      "x-gekiyasu-token",
    );
  });
});
