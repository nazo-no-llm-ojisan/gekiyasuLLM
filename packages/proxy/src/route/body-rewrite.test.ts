import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { rewriteModelForOffering } from "./body-rewrite.js";

describe("rewriteModelForOffering (T-044)", () => {
  it("replaces model with upstreamModelId in a JSON body", () => {
    const original = Buffer.from(
      JSON.stringify({ model: "gpt-4o-mini", messages: [{ role: "user", content: "hi" }] }),
      "utf8",
    );
    const out = rewriteModelForOffering(original, { upstreamModelId: "internal-gpt-mini" });
    const parsed = JSON.parse(out.toString("utf8"));
    assert.equal(parsed.model, "internal-gpt-mini");
    assert.deepEqual(parsed.messages, [{ role: "user", content: "hi" }]);
  });

  it("never mutates the original Buffer", () => {
    const original = Buffer.from(
      JSON.stringify({ model: "gpt-4o-mini", messages: [] }),
      "utf8",
    );
    const snapshot = Buffer.from(original); // copy
    rewriteModelForOffering(original, { upstreamModelId: "internal-gpt-mini" });
    assert.equal(original.equals(snapshot), true, "original buffer must not change");
  });

  it("returns original bytes when the body is not valid JSON", () => {
    const original = Buffer.from("not json", "utf8");
    const out = rewriteModelForOffering(original, { upstreamModelId: "x" });
    assert.equal(out.toString("utf8"), "not json");
  });

  it("returns original bytes when the body has no model field", () => {
    const original = Buffer.from(JSON.stringify({ messages: [] }), "utf8");
    const out = rewriteModelForOffering(original, { upstreamModelId: "x" });
    assert.deepEqual(JSON.parse(out.toString("utf8")), { messages: [] });
  });

  it("returns original bytes when the body is a JSON array", () => {
    const original = Buffer.from(JSON.stringify([1, 2, 3]), "utf8");
    const out = rewriteModelForOffering(original, { upstreamModelId: "x" });
    assert.equal(out.toString("utf8"), original.toString("utf8"));
  });
});
