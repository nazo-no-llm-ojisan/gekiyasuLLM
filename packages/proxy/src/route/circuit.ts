/**
 * Per-offering circuit breaker.
 *
 * Consecutive failures open the circuit after `failureThreshold`, blocking the
 * offering for `openSeconds`. After the window it goes half-open: the next
 * attempt probes. Success closes it; failure re-opens.
 *
 * This is a pure in-memory store (no persistence). State is held on the
 * single `CircuitBreaker` instance kept alive by the running proxy process;
 * process restart resets every offering to closed (no carry-over across
 * restarts, feed reloads, or pm2 restarts). It protects the request path
 * without changing routing selection logic.
 */

export type CircuitConfig = {
  failureThreshold: number;
  openSeconds: number;
};

type State =
  | { kind: "closed"; failures: number }
  | { kind: "open"; openedAt: number }
  | { kind: "half-open" };

export class CircuitBreaker {
  private readonly states = new Map<string, State>();
  private clock: () => number = () => Date.now();

  constructor(private readonly config: CircuitConfig) {}

  /** Test hook to advance time without real waits. */
  setClock(fn: () => number): void {
    this.clock = fn;
  }

  private now(): number {
    return this.clock();
  }

  isOpen(offeringId: string): boolean {
    const s = this.states.get(offeringId);
    if (!s) return false;
    if (s.kind === "closed") return false;
    if (s.kind === "half-open") return false;
    // open: check the window
    if (this.now() - s.openedAt >= this.config.openSeconds * 1000) {
      this.states.set(offeringId, { kind: "half-open" });
      return false;
    }
    return true;
  }

  recordSuccess(offeringId: string): void {
    this.states.set(offeringId, { kind: "closed", failures: 0 });
  }

  recordFailure(offeringId: string): void {
    const s = this.states.get(offeringId);
    if (s && s.kind === "open") {
      // Already open: a failure keeps/re-opens it (e.g. a failed half-open probe).
      this.states.set(offeringId, { kind: "open", openedAt: this.now() });
      return;
    }
    if (s && s.kind === "half-open") {
      // A failed probe re-opens the circuit.
      this.states.set(offeringId, { kind: "open", openedAt: this.now() });
      return;
    }
    // closed (or unknown): count toward the threshold.
    const failures = (s && s.kind === "closed" ? s.failures : 0) + 1;
    if (failures >= this.config.failureThreshold) {
      this.states.set(offeringId, { kind: "open", openedAt: this.now() });
    } else {
      this.states.set(offeringId, { kind: "closed", failures });
    }
  }
}

export function createCircuitBreaker(config: CircuitConfig): CircuitBreaker {
  return new CircuitBreaker(config);
}
