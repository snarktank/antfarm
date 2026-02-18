/**
 * lib/logger.ts unit tests
 *
 * Tests formatEntry, log, logger convenience methods, and readRecentLogs.
 * Mocks node:fs, node:fs/promises, and node:os to avoid real disk I/O.
 */

import { describe, it, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";

// ── Mock state ──────────────────────────────────────────────────────

let appendedLines: string[] = [];
let mkdirCalls: Array<{ path: string; opts: unknown }> = [];
let statResult: { size: number } = { size: 0 };
let statShouldThrow = false;
let appendShouldThrow = false;
let mkdirShouldThrow = false;
let renameCallCount = 0;

let readFileResult = "";
let readFileShouldThrow = false;

// ── Module mocks ────────────────────────────────────────────────────

mock.module("node:os", {
  defaultExport: {
    homedir: () => "/fake/home",
  },
});

mock.module("node:fs", {
  defaultExport: {
    mkdirSync: (p: string, opts: unknown) => {
      if (mkdirShouldThrow) throw new Error("EPERM");
      mkdirCalls.push({ path: p, opts });
    },
    statSync: () => {
      if (statShouldThrow) throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
      return statResult;
    },
    renameSync: () => { renameCallCount++; },
    appendFileSync: (_path: string, data: string, _enc?: string) => {
      if (appendShouldThrow) throw new Error("EIO");
      appendedLines.push(data);
    },
  },
});

mock.module("node:fs/promises", {
  namedExports: {
    readFile: async () => {
      if (readFileShouldThrow) throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
      return readFileResult;
    },
  },
});

// Import after mocks
const { formatEntry, log, logger, readRecentLogs } = await import(
  "../dist/lib/logger.js"
);

// ── Tests ───────────────────────────────────────────────────────────

describe("logger", () => {
  beforeEach(() => {
    appendedLines = [];
    mkdirCalls = [];
    statResult = { size: 0 };
    statShouldThrow = false;
    appendShouldThrow = false;
    mkdirShouldThrow = false;
    renameCallCount = 0;
    readFileResult = "";
    readFileShouldThrow = false;
  });

  describe("formatEntry()", () => {
    it("builds correct output with all context fields", () => {
      const result = formatEntry({
        timestamp: "2026-01-15T12:00:00.000Z",
        level: "info",
        workflowId: "my-wf",
        runId: "abcdef01-2345-6789-abcd-ef0123456789",
        stepId: "step-build",
        message: "task started",
      });
      assert.equal(
        result,
        "2026-01-15T12:00:00.000Z [INFO] [my-wf] [abcdef01] [step-build] task started"
      );
    });

    it("formats entry with timestamp, level, and message only", () => {
      const result = formatEntry({
        timestamp: "2026-01-15T12:00:00.000Z",
        level: "error",
        message: "something broke",
      });
      assert.equal(result, "2026-01-15T12:00:00.000Z [ERROR] something broke");
    });

    it("omits workflowId when not provided", () => {
      const result = formatEntry({
        timestamp: "2026-01-15T12:00:00.000Z",
        level: "warn",
        runId: "12345678-xxxx",
        message: "no workflow",
      });
      assert.equal(
        result,
        "2026-01-15T12:00:00.000Z [WARN] [12345678] no workflow"
      );
      assert.ok(!result.includes("[undefined]"));
    });

    it("omits runId when not provided", () => {
      const result = formatEntry({
        timestamp: "2026-01-15T12:00:00.000Z",
        level: "debug",
        workflowId: "wf-1",
        stepId: "s1",
        message: "no run",
      });
      assert.equal(
        result,
        "2026-01-15T12:00:00.000Z [DEBUG] [wf-1] [s1] no run"
      );
    });

    it("omits stepId when not provided", () => {
      const result = formatEntry({
        timestamp: "2026-01-15T12:00:00.000Z",
        level: "info",
        workflowId: "wf-2",
        runId: "aabbccdd-1234",
        message: "no step",
      });
      assert.equal(
        result,
        "2026-01-15T12:00:00.000Z [INFO] [wf-2] [aabbccdd] no step"
      );
    });

    it("uppercases the level", () => {
      const result = formatEntry({
        timestamp: "T",
        level: "debug",
        message: "m",
      });
      assert.ok(result.includes("[DEBUG]"));
    });

    it("truncates runId to 8 characters", () => {
      const result = formatEntry({
        timestamp: "T",
        level: "info",
        runId: "12345678-9abc-def0-1234-567890abcdef",
        message: "m",
      });
      assert.ok(result.includes("[12345678]"));
      assert.ok(!result.includes("[12345678-"));
    });
  });

  describe("log()", () => {
    it("returns undefined (is synchronous)", () => {
      const result = log("info", "test");
      assert.equal(result, undefined);
    });

    it("result is not a Promise", () => {
      const result = log("info", "test");
      assert.ok(!(result instanceof Promise), "log() should not return a Promise");
    });

    it("does not throw when fs.appendFileSync fails", () => {
      appendShouldThrow = true;
      assert.doesNotThrow(() => {
        log("error", "this should not throw");
      });
    });

    it("does not throw when mkdirSync fails", () => {
      mkdirShouldThrow = true;
      assert.doesNotThrow(() => {
        log("info", "mkdir fail");
      });
    });

    it("appends formatted line to log file", () => {
      log("info", "hello");
      assert.equal(appendedLines.length >= 1, true);
      const lastLine = appendedLines[appendedLines.length - 1];
      assert.ok(lastLine.includes("[INFO]"));
      assert.ok(lastLine.includes("hello"));
      assert.ok(lastLine.endsWith("\n"));
    });

    it("passes context fields through to the formatted entry", () => {
      log("warn", "ctx test", {
        workflowId: "wf-ctx",
        runId: "run-ctx-1234-5678",
        stepId: "step-ctx",
      });
      const lastLine = appendedLines[appendedLines.length - 1];
      assert.ok(lastLine.includes("[wf-ctx]"));
      assert.ok(lastLine.includes("[run-ctx-]"));
      assert.ok(lastLine.includes("[step-ctx]"));
    });
  });

  describe("logger convenience methods", () => {
    it("logger.info returns void", () => {
      const result = logger.info("info msg");
      assert.equal(result, undefined);
    });

    it("logger.warn returns void", () => {
      const result = logger.warn("warn msg");
      assert.equal(result, undefined);
    });

    it("logger.error returns void", () => {
      const result = logger.error("error msg");
      assert.equal(result, undefined);
    });

    it("logger.debug returns void", () => {
      const result = logger.debug("debug msg");
      assert.equal(result, undefined);
    });

    it("logger.info is not a Promise", () => {
      assert.ok(!(logger.info("test") instanceof Promise));
    });

    it("logger.warn is not a Promise", () => {
      assert.ok(!(logger.warn("test") instanceof Promise));
    });

    it("logger.error is not a Promise", () => {
      assert.ok(!(logger.error("test") instanceof Promise));
    });

    it("logger.debug is not a Promise", () => {
      assert.ok(!(logger.debug("test") instanceof Promise));
    });
  });

  describe("readRecentLogs()", () => {
    it("returns a Promise", () => {
      const result = readRecentLogs();
      assert.ok(result instanceof Promise);
    });

    it("resolves to an array", async () => {
      readFileResult = "line1\nline2\nline3";
      const lines = await readRecentLogs();
      assert.ok(Array.isArray(lines));
    });

    it("returns last N lines from log file", async () => {
      readFileResult = "a\nb\nc\nd\ne";
      const lines = await readRecentLogs(3);
      assert.deepEqual(lines, ["c", "d", "e"]);
    });

    it("returns all lines when fewer than requested", async () => {
      readFileResult = "x\ny";
      const lines = await readRecentLogs(50);
      assert.deepEqual(lines, ["x", "y"]);
    });

    it("returns empty array on read error", async () => {
      readFileShouldThrow = true;
      const lines = await readRecentLogs();
      assert.deepEqual(lines, []);
    });
  });
});
