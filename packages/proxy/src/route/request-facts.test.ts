import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractRequestFacts } from "./request-facts.js";

function buf(s: string): Buffer {
  return Buffer.from(s, "utf8");
}

describe("extractRequestFacts (T-044 / issue #2)", () => {
  it("extracts requestedModel from a chat body", () => {
    const facts = extractRequestFacts({
      method: "POST",
      path: "/v1/chat/completions",
      contentType: "application/json",
      body: buf(JSON.stringify({ model: "gpt-4o-mini", messages: [] })),
    });
    assert.equal(facts.requestedModel, "gpt-4o-mini");
  });

  it("flags streaming when stream: true", () => {
    const facts = extractRequestFacts({
      method: "POST",
      path: "/v1/chat/completions",
      contentType: "application/json",
      body: buf(JSON.stringify({ model: "x", stream: true })),
    });
    assert.equal(facts.streaming, true);
  });

  it("flags requiresTools only when tools is a non-empty array", () => {
    assert.equal(
      extractRequestFacts({
        method: "POST",
        contentType: "application/json",
        body: buf(JSON.stringify({ model: "x", tools: [{ type: "function" }] })),
      }).requiresTools,
      true,
    );
    assert.equal(
      extractRequestFacts({
        method: "POST",
        contentType: "application/json",
        body: buf(JSON.stringify({ model: "x", tools: [] })),
      }).requiresTools,
      undefined,
    );
  });

  it("flags requiresVision when any message part is image_url", () => {
    const facts = extractRequestFacts({
      method: "POST",
      contentType: "application/json",
      body: buf(
        JSON.stringify({
          model: "x",
          messages: [
            { role: "user", content: [{ type: "text", text: "see this" }] },
            { role: "user", content: [{ type: "image_url", image_url: { url: "x" } }] },
          ],
        }),
      ),
    });
    assert.equal(facts.requiresVision, true);
  });

  it("returns empty facts for GET requests (no body inspection)", () => {
    const facts = extractRequestFacts({
      method: "GET",
      path: "/v1/models",
      body: buf("should be ignored"),
    });
    assert.deepEqual(facts, {});
  });

  it("returns empty facts for non-JSON content type", () => {
    const facts = extractRequestFacts({
      method: "POST",
      contentType: "text/plain",
      body: buf("hello"),
    });
    assert.deepEqual(facts, {});
  });

  it("returns empty facts when body is invalid JSON", () => {
    const facts = extractRequestFacts({
      method: "POST",
      contentType: "application/json",
      body: buf("not json"),
    });
    assert.deepEqual(facts, {});
  });

  it("returns empty facts for empty body", () => {
    const facts = extractRequestFacts({ method: "POST", contentType: "application/json" });
    assert.deepEqual(facts, {});
  });
});
