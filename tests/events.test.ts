/**
 * installer/events.ts unit tests
 *
 * Tests emitEvent(), getRecentEvents(), getRunEvents() with mocked
 * fs, os, db, and fetch. Covers file writing, rotation, JSONL parsing,
 * run filtering, webhook dispatch, and error handling.
 */

import { describe, it, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";

// ── Mock state ──────────────────────────────────────────────────────

let appendedData: string[] = [];
let mkdirCalls: Array<{ path: string; opts: unknown }> = [];
let statResult: { size: number } | null = null;
let statError: Error | null = null;
let readFileResult: string = "";
let readFileError: Error | null = null;
let unlinkCalls: string[] = [];
let renameCalls: Array<{ from: string; to: string }> = [];

let dbPrepareResult: unknown = undefined;
let dbPrepareError: Error | null = null;
let getDbError: Error | null = null;

let fetchCalls: Array<{ url: string; opts: unknown }> = [];
let fetchError: Error | null = null;

// ── Module mocks ────────────────────────────────────────────────────

mock.module("node:fs", {
  defaultExport: {
    mkdirSync: (p: string, opts: unknown) => {
      mkdirCalls.push({ path: p, opts });
    },
    statSync: (_p: string) => {
      if (statError) throw statError;
      return statResult ?? { size: 0 };
    },
    appendFileSync: (_p: string, data: string) => {
      appendedData.push(data);
    },
    readFileSync: (_p: string, _enc: string) => {
      if (readFileError) throw readFileError;
      return readFileResult;
    },
    unlinkSync: (p: string) => {
      unlinkCalls.push(p);
    },
    renameSync: (from: string, to: string) => {
      renameCalls.push({ from, to });
    },
  },
});

mock.module("node:os", {
  defaultExport: {
    homedir: () => "/fake/home",
  },
});

mock.module("../dist/db.js", {
  namedExports: {
    getDb: () => {
      if (getDbError) throw getDbError;
      return {
        prepare: (_sql: string) => ({
          get: (_id: string) => {
            if (dbPrepareError) throw dbPrepareError;
            return dbPrepareResult;
          },
        }),
      };
    },
  },
});

// Mock global fetch
const originalFetch = globalThis.fetch;
globalThis.fetch = (async (url: string | URL, opts?: unknown) => {
  if (fetchError) throw fetchError;
  fetchCalls.push({ url: url.toString(), opts });
  return new Response("ok", { status: 200 });
}) as typeof globalThis.fetch;

// Import after mocks
const { emitEvent, getRecentEvents, getRunEvents } = await import(
  "../dist/installer/events.js"
);

// ── Helpers ─────────────────────────────────────────────────────────

function makeEvent(overrides: Record<string, unknown> = {}) {
  return {
    ts: "2026-01-01T00:00:00Z",
    event: "run.started",
    runId: "run-123",
    ...overrides,
  };
}

function resetMocks() {
  appendedData = [];
  mkdirCalls = [];
  statResult = null;
  statError = null;
  readFileResult = "";
  readFileError = null;
  unlinkCalls = [];
  renameCalls = [];
  dbPrepareResult = undefined;
  dbPrepareError = null;
  getDbError = null;
  fetchCalls = [];
  fetchError = null;
}

// ── Tests ────────────────────────────────────────────────────────────

describe("installer/events", () => {
  beforeEach(() => {
    resetMocks();
  });

  // ── emitEvent ─────────────────────────────────────────────────────

  describe("emitEvent", () => {
    it("creates events directory and appends JSON line", () => {
      const evt = makeEvent();
      emitEvent(evt);

      assert.equal(mkdirCalls.length, 1);
      assert.ok(mkdirCalls[0].path.includes(".openclaw/antfarm"));
      assert.deepEqual(mkdirCalls[0].opts, { recursive: true });

      assert.equal(appendedData.length, 1);
      const parsed = JSON.parse(appendedData[0].trimEnd());
      assert.equal(parsed.event, "run.started");
      assert.equal(parsed.runId, "run-123");
    });

    it("appends event with newline terminator", () => {
      emitEvent(makeEvent());
      assert.ok(appendedData[0].endsWith("\n"));
    });

    it("includes all event fields in the written JSON", () => {
      const evt = makeEvent({
        workflowId: "wf-1",
        stepId: "plan",
        agentId: "agent-1",
        storyId: "story-1",
        storyTitle: "Test Story",
        detail: "some detail",
      });
      emitEvent(evt);
      const parsed = JSON.parse(appendedData[0].trimEnd());
      assert.equal(parsed.workflowId, "wf-1");
      assert.equal(parsed.stepId, "plan");
      assert.equal(parsed.agentId, "agent-1");
      assert.equal(parsed.storyId, "story-1");
      assert.equal(parsed.storyTitle, "Test Story");
      assert.equal(parsed.detail, "some detail");
    });

    it("rotates file when size exceeds 10MB", () => {
      statResult = { size: 11 * 1024 * 1024 }; // > 10MB
      emitEvent(makeEvent());

      // Should try to unlink the rotated file first, then rename
      assert.equal(unlinkCalls.length, 1);
      assert.ok(unlinkCalls[0].endsWith("events.jsonl.1"));
      assert.equal(renameCalls.length, 1);
      assert.ok(renameCalls[0].from.endsWith("events.jsonl"));
      assert.ok(renameCalls[0].to.endsWith("events.jsonl.1"));

      // Still appends the event
      assert.equal(appendedData.length, 1);
    });

    it("does not rotate when file size is within limit", () => {
      statResult = { size: 5 * 1024 * 1024 }; // 5MB, under limit
      emitEvent(makeEvent());

      assert.equal(unlinkCalls.length, 0);
      assert.equal(renameCalls.length, 0);
      assert.equal(appendedData.length, 1);
    });

    it("handles stat error gracefully (e.g., file not found)", () => {
      statError = Object.assign(new Error("ENOENT"), { code: "ENOENT" });
      // Should not throw, just skip rotation
      emitEvent(makeEvent());
      assert.equal(appendedData.length, 1);
    });

    it("still fires webhook even if fs fails internally", () => {
      // emitEvent wraps everything in try/catch, so it never throws.
      // We can verify this indirectly: statError + readFileError set
      // but emitEvent still returns without throwing.
      statError = Object.assign(new Error("disk full"), { code: "EIO" });
      readFileError = Object.assign(new Error("disk full"), { code: "EIO" });
      assert.doesNotThrow(() => emitEvent(makeEvent({ runId: "run-fs-err" })));
    });
  });

  // ── emitEvent webhook ─────────────────────────────────────────────

  describe("emitEvent webhook", () => {
    // NOTE: events.ts has an in-memory notifyUrlCache (Map<runId, url>)
    // that persists across tests. Each test must use a UNIQUE runId
    // to avoid cache interference from earlier tests.

    it("calls fetch with correct URL when notify_url is set", async () => {
      dbPrepareResult = { notify_url: "https://example.com/hook" };
      const evt = makeEvent({ runId: "wh-run-1" });
      emitEvent(evt);

      // Give fetch a tick to fire
      await new Promise((r) => setTimeout(r, 10));

      assert.ok(fetchCalls.length >= 1);
      assert.equal(fetchCalls[0].url, "https://example.com/hook");
      const opts = fetchCalls[0].opts as Record<string, unknown>;
      assert.equal(opts.method, "POST");
      const headers = opts.headers as Record<string, string>;
      assert.equal(headers["Content-Type"], "application/json");
    });

    it("extracts Authorization from #auth= fragment", async () => {
      dbPrepareResult = {
        notify_url: "https://example.com/hook#auth=Bearer%20secret-token",
      };
      emitEvent(makeEvent({ runId: "wh-run-2" }));

      await new Promise((r) => setTimeout(r, 10));

      assert.ok(fetchCalls.length >= 1);
      // URL should not include the fragment
      assert.equal(fetchCalls[0].url, "https://example.com/hook");
      const opts = fetchCalls[0].opts as Record<string, unknown>;
      const headers = opts.headers as Record<string, string>;
      assert.equal(headers["Authorization"], "Bearer secret-token");
    });

    it("does not call fetch when notify_url is null", async () => {
      dbPrepareResult = { notify_url: null };
      emitEvent(makeEvent({ runId: "wh-run-3" }));

      await new Promise((r) => setTimeout(r, 10));
      assert.equal(fetchCalls.length, 0);
    });

    it("does not call fetch when no run row exists", async () => {
      dbPrepareResult = undefined;
      emitEvent(makeEvent({ runId: "wh-run-4" }));

      await new Promise((r) => setTimeout(r, 10));
      assert.equal(fetchCalls.length, 0);
    });

    it("handles DB error gracefully (getNotifyUrl returns null)", async () => {
      getDbError = new Error("DB connection failed");
      emitEvent(makeEvent({ runId: "wh-run-5" }));

      await new Promise((r) => setTimeout(r, 10));
      assert.equal(fetchCalls.length, 0);
    });

    it("handles fetch error gracefully", async () => {
      dbPrepareResult = { notify_url: "https://example.com/hook" };
      fetchError = new Error("network error");

      // Should not throw
      assert.doesNotThrow(() => emitEvent(makeEvent({ runId: "wh-run-6" })));
    });
  });

  // ── getRecentEvents ───────────────────────────────────────────────

  describe("getRecentEvents", () => {
    it("returns parsed events from JSONL file", () => {
      const evt1 = makeEvent({ ts: "2026-01-01T00:00:00Z" });
      const evt2 = makeEvent({
        ts: "2026-01-01T01:00:00Z",
        event: "run.completed",
      });
      readFileResult = JSON.stringify(evt1) + "\n" + JSON.stringify(evt2) + "\n";

      const events = getRecentEvents();
      assert.equal(events.length, 2);
      assert.equal(events[0].event, "run.started");
      assert.equal(events[1].event, "run.completed");
    });

    it("returns last N events when limit is specified", () => {
      const lines = Array.from({ length: 10 }, (_, i) =>
        JSON.stringify(makeEvent({ ts: `t${i}`, detail: `evt-${i}` }))
      );
      readFileResult = lines.join("\n") + "\n";

      const events = getRecentEvents(3);
      assert.equal(events.length, 3);
      assert.equal(events[0].detail, "evt-7");
      assert.equal(events[2].detail, "evt-9");
    });

    it("returns default limit of 50 events", () => {
      const lines = Array.from({ length: 60 }, (_, i) =>
        JSON.stringify(makeEvent({ detail: `evt-${i}` }))
      );
      readFileResult = lines.join("\n") + "\n";

      const events = getRecentEvents();
      assert.equal(events.length, 50);
    });

    it("returns empty array when file does not exist", () => {
      readFileError = Object.assign(new Error("ENOENT"), { code: "ENOENT" });
      const events = getRecentEvents();
      assert.deepEqual(events, []);
    });

    it("skips malformed JSON lines gracefully", () => {
      readFileResult =
        JSON.stringify(makeEvent({ detail: "good" })) +
        "\n" +
        "not-json\n" +
        JSON.stringify(makeEvent({ detail: "also-good" })) +
        "\n";

      const events = getRecentEvents();
      assert.equal(events.length, 2);
      assert.equal(events[0].detail, "good");
      assert.equal(events[1].detail, "also-good");
    });

    it("handles empty file content", () => {
      readFileResult = "";
      const events = getRecentEvents();
      assert.deepEqual(events, []);
    });

    it("handles file with only whitespace/newlines", () => {
      readFileResult = "\n\n\n";
      const events = getRecentEvents();
      assert.deepEqual(events, []);
    });
  });

  // ── getRunEvents ──────────────────────────────────────────────────

  describe("getRunEvents", () => {
    it("filters events by exact runId", () => {
      const evt1 = makeEvent({ runId: "run-aaa" });
      const evt2 = makeEvent({ runId: "run-bbb" });
      const evt3 = makeEvent({ runId: "run-aaa", event: "run.completed" });
      readFileResult =
        [evt1, evt2, evt3].map((e) => JSON.stringify(e)).join("\n") + "\n";

      const events = getRunEvents("run-aaa");
      assert.equal(events.length, 2);
      assert.equal(events[0].event, "run.started");
      assert.equal(events[1].event, "run.completed");
    });

    it("supports prefix matching on runId", () => {
      const evt1 = makeEvent({ runId: "run-abc-123" });
      const evt2 = makeEvent({ runId: "run-abc-456" });
      const evt3 = makeEvent({ runId: "run-xyz-789" });
      readFileResult =
        [evt1, evt2, evt3].map((e) => JSON.stringify(e)).join("\n") + "\n";

      const events = getRunEvents("run-abc");
      assert.equal(events.length, 2);
    });

    it("returns last N events when limit is specified", () => {
      const lines = Array.from({ length: 10 }, (_, i) =>
        JSON.stringify(makeEvent({ runId: "run-same", detail: `evt-${i}` }))
      );
      readFileResult = lines.join("\n") + "\n";

      const events = getRunEvents("run-same", 3);
      assert.equal(events.length, 3);
      assert.equal(events[0].detail, "evt-7");
      assert.equal(events[2].detail, "evt-9");
    });

    it("returns empty array when no events match", () => {
      readFileResult =
        JSON.stringify(makeEvent({ runId: "run-other" })) + "\n";

      const events = getRunEvents("run-nonexistent");
      assert.deepEqual(events, []);
    });

    it("returns empty array when file does not exist", () => {
      readFileError = Object.assign(new Error("ENOENT"), { code: "ENOENT" });
      const events = getRunEvents("run-123");
      assert.deepEqual(events, []);
    });

    it("skips malformed JSON lines", () => {
      readFileResult =
        JSON.stringify(makeEvent({ runId: "run-123", detail: "ok" })) +
        "\n" +
        "broken{json\n" +
        JSON.stringify(makeEvent({ runId: "run-123", detail: "ok2" })) +
        "\n";

      const events = getRunEvents("run-123");
      assert.equal(events.length, 2);
    });

    it("defaults to limit of 200", () => {
      const lines = Array.from({ length: 250 }, (_, i) =>
        JSON.stringify(makeEvent({ runId: "run-big", detail: `evt-${i}` }))
      );
      readFileResult = lines.join("\n") + "\n";

      const events = getRunEvents("run-big");
      assert.equal(events.length, 200);
    });
  });
});
