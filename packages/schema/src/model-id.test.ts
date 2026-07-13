import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseModelId } from "./model-id.js";

describe("parseModelId", () => {
  it("parses basic provider and family", () => {
    const parsed = parseModelId("openai/gpt-4o");

    assert.equal(parsed.provider, "openai");
    assert.equal(parsed.family, "gpt-4o");
    assert.equal(parsed.rawId, "openai/gpt-4o");
    assert.equal(parsed.accessVariant, undefined);
  });

  it("extracts accessVariant and derivative", () => {
    const parsed = parseModelId("openai/gpt-4o-mini:free");

    assert.equal(parsed.provider, "openai");
    assert.equal(parsed.family, "gpt-4o");
    assert.equal(parsed.derivative, "mini");
    assert.equal(parsed.accessVariant, "free");
    assert.equal(parsed.rawId, "openai/gpt-4o-mini:free");
  });

  it("returns provider=unknown when no slash present", () => {
    const parsed = parseModelId("gpt-4o");

    assert.equal(parsed.provider, "unknown");
    assert.equal(parsed.family, "gpt-4o");
    assert.equal(parsed.rawId, "gpt-4o");
  });
});
