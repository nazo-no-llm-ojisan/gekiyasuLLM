/**
 * Local request stats (L10).
 * Append-only JSONL. Never store prompts, response bodies, or API keys.
 */

import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";

/** One completed proxy request (metadata only). */
export type RequestStatEvent = {
  /** ISO-8601 timestamp */
  ts: string;
  method: string;
  /** Path only (no query string — may contain secrets) */
  path: string;
  offeringId?: string;
  /** e.g. ["first:http_503", "second:ok"] */
  attempts: string[];
  /** HTTP status returned to the client */
  status: number;
  latencyMs: number;
  ok: boolean;
  /** Proxy/upstream error code when known */
  errorCode?: string;
};

export type StatsStore = {
  record(event: RequestStatEvent): Promise<void>;
  /** Read all events (tests / small local files). */
  readAll(): Promise<RequestStatEvent[]>;
  summarize(): Promise<StatsSummary>;
};

export type StatsSummary = {
  total: number;
  ok: number;
  error: number;
  byPath: Record<string, number>;
  byOffering: Record<string, number>;
};

const SECRETISH =
  /authorization|api[_-]?key|bearer\s|sk-[a-z0-9]|gekiyasu-proxy:|password|cookie/i;

/** Paths that must not appear as free-form fields in a recorded event. */
export function assertSafeStatEvent(event: RequestStatEvent): void {
  const blob = JSON.stringify(event);
  if (SECRETISH.test(blob)) {
    throw new Error("Refusing to record stats event that looks like it contains secrets");
  }
  if ("body" in event || "headers" in event || "prompt" in event) {
    throw new Error("Refusing stats event with forbidden fields");
  }
}

export function sanitizePath(pathWithQuery: string): string {
  const q = pathWithQuery.indexOf("?");
  return q === -1 ? pathWithQuery : pathWithQuery.slice(0, q);
}

export function createJsonlStatsStore(filePath: string): StatsStore {
  let writeChain: Promise<void> = Promise.resolve();

  const ensureParent = async () => {
    await mkdir(dirname(filePath), { recursive: true });
  };

  return {
    async record(event: RequestStatEvent): Promise<void> {
      const safe: RequestStatEvent = {
        ts: event.ts,
        method: event.method,
        path: sanitizePath(event.path),
        offeringId: event.offeringId,
        attempts: [...event.attempts],
        status: event.status,
        latencyMs: event.latencyMs,
        ok: event.ok,
        errorCode: event.errorCode,
      };
      assertSafeStatEvent(safe);
      const line = `${JSON.stringify(safe)}\n`;
      writeChain = writeChain.then(async () => {
        await ensureParent();
        await appendFile(filePath, line, "utf8");
      });
      await writeChain;
    },

    async readAll(): Promise<RequestStatEvent[]> {
      try {
        const raw = await readFile(filePath, "utf8");
        const lines = raw.split("\n").filter((l) => l.trim().length > 0);
        return lines.map((l) => JSON.parse(l) as RequestStatEvent);
      } catch (err) {
        const code =
          err && typeof err === "object" && "code" in err
            ? String((err as { code?: string }).code)
            : "";
        if (code === "ENOENT") return [];
        throw err;
      }
    },

    async summarize(): Promise<StatsSummary> {
      const events = await this.readAll();
      const byPath: Record<string, number> = {};
      const byOffering: Record<string, number> = {};
      let ok = 0;
      let error = 0;
      for (const e of events) {
        byPath[e.path] = (byPath[e.path] ?? 0) + 1;
        if (e.offeringId) {
          byOffering[e.offeringId] = (byOffering[e.offeringId] ?? 0) + 1;
        }
        if (e.ok) ok += 1;
        else error += 1;
      }
      return {
        total: events.length,
        ok,
        error,
        byPath,
        byOffering,
      };
    },
  };
}

/** No-op store when stats are disabled. */
export function createNullStatsStore(): StatsStore {
  return {
    async record() {},
    async readAll() {
      return [];
    },
    async summarize() {
      return { total: 0, ok: 0, error: 0, byPath: {}, byOffering: {} };
    },
  };
}
