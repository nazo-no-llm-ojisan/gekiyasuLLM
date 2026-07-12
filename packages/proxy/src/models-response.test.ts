import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeModelsResponseJson } from "./models-response.js";

describe("normalizeModelsResponseJson", () => {
  it("adds OpenAI-compatible object fields to /v1/models lists", () => {
    const normalized = normalizeModelsResponseJson({
      data: [{ id: "kilo-auto/free", name: "Free" }],
    });

    assert.deepEqual(normalized, {
      object: "list",
      data: [
        {
          id: "kilo-auto/free",
          name: "Free",
          object: "model",
          owned_by: "upstream",
        },
      ],
    });
  });

  it("preserves existing object and owned_by fields", () => {
    const normalized = normalizeModelsResponseJson({
      object: "list",
      data: [{ id: "gpt-test", object: "model", owned_by: "openai" }],
    });

    assert.deepEqual(normalized, {
      object: "list",
      data: [{ id: "gpt-test", object: "model", owned_by: "openai" }],
    });
  });

  it("leaves non-list JSON unchanged", () => {
    const value = { error: { message: "boom" } };
    assert.equal(normalizeModelsResponseJson(value), value);
  });
});
