import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadConfig } from "./config.js";
import { resolveUpstreamUrl } from "./upstream.js";
import { joinUpstreamUrl } from "./url-join.js";

describe("joinUpstreamUrl", () => {
  it("does not double /v1 when base ends with /v1", () => {
    assert.equal(
      joinUpstreamUrl("https://api.openai.com/v1", "/v1/models"),
      "https://api.openai.com/v1/models",
    );
    assert.equal(
      joinUpstreamUrl("https://api.openai.com/v1", "/v1/chat/completions"),
      "https://api.openai.com/v1/chat/completions",
    );
  });

  it("keeps /v1 when base is origin only", () => {
    assert.equal(
      joinUpstreamUrl("https://api.openai.com", "/v1/models"),
      "https://api.openai.com/v1/models",
    );
  });

  it("preserves query string", () => {
    assert.equal(
      joinUpstreamUrl("https://api.openai.com/v1", "/v1/models?limit=1"),
      "https://api.openai.com/v1/models?limit=1",
    );
  });
});

describe("resolveUpstreamUrl default config", () => {
  it("maps client /v1/models to openai /v1/models once", () => {
    const config = loadConfig({
      upstreamBaseUrl: "https://api.openai.com/v1",
      allowedUpstreamHosts: ["api.openai.com"],
    });
    assert.equal(
      resolveUpstreamUrl(config, "/v1/models"),
      "https://api.openai.com/v1/models",
    );
  });
});
