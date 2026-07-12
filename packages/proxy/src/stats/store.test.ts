import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { resolveStatsFile } from "../config.js";
import {
  assertSafeStatEvent,
  createJsonlStatsStore,
  sanitizePath,
  type RequestStatEvent,
} from "./store.js";

describe("sanitizePath", () => {
  it("strips query string", () => {
    assert.equal(sanitizePath("/v1/models?key=secret"), "/v1/models");
    assert.equal(sanitizePath("/v1/chat/completions"), "/v1/chat/completions");
  });
});

describe("resolveStatsFile", () => {
  it("defaults to cwd/data/stats.jsonl and can disable", () => {
    assert.match(
      resolveStatsFile(undefined, undefined, "/tmp/proj")!,
      /stats\.jsonl$/,
    );
    assert.equal(resolveStatsFile(undefined, "off"), undefined);
    assert.equal(resolveStatsFile("/custom.jsonl", undefined), "/custom.jsonl");
  });
});

describe("assertSafeStatEvent", () => {
  const base: RequestStatEvent = {
    ts: "2026-07-12T00:00:00.000Z",
    method: "GET",
    path: "/v1/models",
    attempts: ["passthrough:default:ok"],
    status: 200,
    latencyMs: 12,
    ok: true,
  };

  it("accepts metadata-only events", () => {
    assert.doesNotThrow(() => assertSafeStatEvent(base));
  });

  it("rejects events that look like they embed secrets", () => {
    assert.throws(
      () =>
        assertSafeStatEvent({
          ...base,
          errorCode: "Bearer sk-abc123secret",
        }),
      /secrets/,
    );
  });
});

describe("createJsonlStatsStore", () => {
  const dirs: string[] = [];
  after(async () => {
    for (const d of dirs) {
      await rm(d, { recursive: true, force: true });
    }
  });

  it("appends JSONL and summarizes without bodies", async () => {
    const dir = await mkdtemp(join(tmpdir(), "gekiyasu-stats-"));
    dirs.push(dir);
    const file = join(dir, "stats.jsonl");
    const store = createJsonlStatsStore(file);

    await store.record({
      ts: "2026-07-12T01:00:00.000Z",
      method: "GET",
      path: "/v1/models?api_key=should-not-appear",
      offeringId: "passthrough:default",
      attempts: ["passthrough:default:ok"],
      status: 200,
      latencyMs: 42,
      ok: true,
    });
    await store.record({
      ts: "2026-07-12T01:00:01.000Z",
      method: "POST",
      path: "/v1/chat/completions",
      offeringId: "passthrough:default",
      attempts: ["passthrough:default:ok"],
      status: 500,
      latencyMs: 100,
      ok: false,
      errorCode: "http_500",
    });

    const all = await store.readAll();
    assert.equal(all.length, 2);
    assert.equal(all[0]!.path, "/v1/models");
    assert.equal(all[0]!.offeringId, "passthrough:default");
    assert.equal(all[1]!.ok, false);

    const raw = await readFile(file, "utf8");
    assert.ok(!raw.includes("should-not-appear"));
    assert.ok(!raw.includes("api_key="));
    assert.ok(!/messages|prompt|content/.test(raw));

    const summary = await store.summarize();
    assert.equal(summary.total, 2);
    assert.equal(summary.ok, 1);
    assert.equal(summary.error, 1);
    assert.equal(summary.byPath["/v1/models"], 1);
    assert.equal(summary.byOffering["passthrough:default"], 2);
  });
});
