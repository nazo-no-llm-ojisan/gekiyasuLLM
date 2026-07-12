import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createCircuitBreaker } from "./circuit.js";

describe("CircuitBreaker", () => {
  it("allows attempts while closed", () => {
    const cb = createCircuitBreaker({ failureThreshold: 3, openSeconds: 300 });
    assert.equal(cb.isOpen("a:offering"), false);
  });

  it("opens after N consecutive failures and blocks the offering", () => {
    const cb = createCircuitBreaker({ failureThreshold: 3, openSeconds: 300 });
    const id = "a:offering";
    cb.recordFailure(id);
    cb.recordFailure(id);
    assert.equal(cb.isOpen(id), false, "not yet at threshold");
    cb.recordFailure(id);
    assert.equal(cb.isOpen(id), true, "open at threshold");
    // Other offerings stay closed
    assert.equal(cb.isOpen("other:offering"), false);
  });

  it("resets consecutive failures on success", () => {
    const cb = createCircuitBreaker({ failureThreshold: 2, openSeconds: 300 });
    const id = "a:offering";
    cb.recordFailure(id);
    cb.recordSuccess(id);
    cb.recordFailure(id);
    assert.equal(cb.isOpen(id), false, "success reset the counter");
  });

  it("transitions to half-open after openSeconds and allows a probe", () => {
    const cb = createCircuitBreaker({ failureThreshold: 1, openSeconds: 300 });
    const id = "a:offering";
    cb.recordFailure(id);
    assert.equal(cb.isOpen(id), true);
    const base = Date.now();
    cb.setClock(() => base + 301_000);
    assert.equal(cb.isOpen(id), false, "half-open after window");
  });

  it("re-opens if the half-open probe fails", () => {
    const cb = createCircuitBreaker({ failureThreshold: 1, openSeconds: 300 });
    const id = "a:offering";
    cb.recordFailure(id);
    const base = Date.now();
    cb.setClock(() => base + 301_000);
    assert.equal(cb.isOpen(id), false, "half-open");
    cb.recordFailure(id);
    assert.equal(cb.isOpen(id), true, "re-opened on probe failure");
  });

  it("closes if the half-open probe succeeds", () => {
    const cb = createCircuitBreaker({ failureThreshold: 1, openSeconds: 300 });
    const id = "a:offering";
    cb.recordFailure(id);
    const base = Date.now();
    cb.setClock(() => base + 301_000);
    assert.equal(cb.isOpen(id), false, "half-open");
    cb.recordSuccess(id);
    assert.equal(cb.isOpen(id), false, "stays closed after success");
  });

  it("does not instantly reopen after recovery under a higher threshold", () => {
    // threshold 2: a single failure after recovery must not reopen.
    const cb = createCircuitBreaker({ failureThreshold: 2, openSeconds: 300 });
    const id = "a:offering";
    cb.recordFailure(id);
    const base = Date.now();
    cb.setClock(() => base + 301_000);
    assert.equal(cb.isOpen(id), false, "half-open");
    cb.recordSuccess(id);
    cb.recordFailure(id);
    assert.equal(
      cb.isOpen(id),
      false,
      "single failure after recovery stays closed",
    );
  });
});
