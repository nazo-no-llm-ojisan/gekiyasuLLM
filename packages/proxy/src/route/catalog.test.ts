import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import type { ProxyConfig } from "../config.js";
import { buildOfferingCatalog } from "./catalog.js";

const here = dirname(fileURLToPath(import.meta.url));
const sampleFeedPath = join(here, "../../../../fixtures/feeds/sample-feed.json");

describe("buildOfferingCatalog", () => {
  it("builds catalog with passthrough only when feedFile is not set", () => {
    const config = {
      upstreamBaseUrl: "https://api.openai.com/v1",
      allowedUpstreamHosts: ["api.openai.com"],
      feedFile: undefined,
    } as unknown as ProxyConfig;

    const catalog = buildOfferingCatalog(config);
    assert.equal(catalog.size, 1);
    assert.ok(catalog.has("passthrough:default"));
    assert.deepEqual(config.allowedUpstreamHosts, ["api.openai.com"]);
  });

  it("loads offerings from feed file and updates allowed hosts", () => {
    const config = {
      upstreamBaseUrl: "https://api.openai.com/v1",
      allowedUpstreamHosts: ["api.openai.com"],
      feedFile: sampleFeedPath,
    } as unknown as ProxyConfig;

    const catalog = buildOfferingCatalog(config);
    
    assert.ok(catalog.size > 1);
    assert.ok(catalog.has("passthrough:default"));
    assert.ok(catalog.has("provider-a:model-x:fixed"));
    assert.ok(catalog.has("provider-b:model-x:free"));

    const offA = catalog.get("provider-a:model-x:fixed")!;
    assert.equal(offA.providerId, "provider-a");
    assert.equal(offA.baseUrl, "https://api.provider-a.example/v1");
    assert.equal(offA.free, false);
    assert.equal(offA.allowsPrivateCode, true);
    assert.equal(offA.tools, true);

    const offB = catalog.get("provider-b:model-x:free")!;
    assert.equal(offB.providerId, "provider-b");
    assert.equal(offB.baseUrl, "https://api.provider-b.example/v1");
    assert.equal(offB.free, true);
    assert.equal(offB.allowsPrivateCode, false);
    assert.equal(offB.tools, false);

    assert.ok(config.allowedUpstreamHosts.includes("api.openai.com"));
    assert.ok(config.allowedUpstreamHosts.includes("api.provider-a.example"));
    assert.ok(config.allowedUpstreamHosts.includes("api.provider-b.example"));
  });

  it("throws error when feed file does not exist", () => {
    const config = {
      upstreamBaseUrl: "https://api.openai.com/v1",
      allowedUpstreamHosts: ["api.openai.com"],
      feedFile: "non-existent-file.json",
    } as unknown as ProxyConfig;

    assert.throws(() => buildOfferingCatalog(config), /Feed file not found/);
  });
});
