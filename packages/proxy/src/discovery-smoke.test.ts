// Test discovery smoke (T-048). If this file is not picked up by the glob
// `src/**/*.test.ts`, the package.json `test` script is stale. Keep this
// file as the canonical proof.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

describe("test discovery (T-048)", () => {
  it("this file is reached by the glob", () => {
    assert.equal(1 + 1, 2);
  });
});
