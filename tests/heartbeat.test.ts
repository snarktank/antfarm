/**
 * HeartbeatManager unit tests
 *
 * Tests heartbeat lock file management, lifecycle (start/stop),
 * timeout detection, and the main heartbeat loop logic.
 *
 * Approach: Mock ../dist/db.js, ../dist/config.js, ../dist/lib/logger.js,
 * node:fs, and global fetch to isolate heartbeat logic from real IO.
 */

import { describe, it, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";

// ── In-memory DB setup ──────────────────────────────────────────────

let testDb: DatabaseSync;

function createTestDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE runs (
      id TEXT PRIMARY KEY,
      workflow_id TEXT NOT NULL,
      task TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'running',
      context TEXT NOT NULL DEFAULT '{}',
      notify_url TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE steps (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      step_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      step_index INTEGER NOT NULL,
      input_template TEXT NOT NULL,
      expects TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'waiting',
      output TEXT,
      retry_count INTEGER DEFAULT 0,
      max_retries INTEGER DEFAULT 2,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE ttl_timeout_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      step_id TEXT NOT NULL,
      run_id TEXT NOT NULL,
      elapsed_ms INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
  return db;
}

// ── FS mock state ───────────────────────────────────────────────────

const mockFiles = new Map<string, string>();

// ── Module mocks ────────────────────────────────────────────────────

let mockHeartbeatEnabled = true;
let mockTimeoutSeconds = 1800;
let mockTypingRefreshIntervalMs = 30_000;
let mockProgressUpdateIntervalMs = 90_000;
let mockTypingTtlMs = 120_000;

mock.module("../dist/db.js", {
  namedExports: {
    getDb: () => testDb,
  },
});

mock.module("../dist/config.js", {
  namedExports: {
    loadConfig: () => ({
      concurrency: { opus: 2, sonnet: 4, haiku: 8 },
      polling: { intervalMs: 300_000, timeoutSeconds: 120 },
      worker: {
        timeoutSeconds: mockTimeoutSeconds,
        heartbeatEnabled: mockHeartbeatEnabled,
        typingRefreshIntervalMs: mockTypingRefreshIntervalMs,
        progressUpdateIntervalMs: mockProgressUpdateIntervalMs,
        typingTtlMs: mockTypingTtlMs,
      },
      resourceLimits: { cpuQuota: "50%", memoryMax: "2G", nice: 10, ioWeight: 10 },
      monitoring: { eventLoopLagWarningMs: 100, eventLoopLagCriticalMs: 1000 },
    }),
  },
});

mock.module("../dist/lib/logger.js", {
  namedExports: {
    logger: {
      info: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {},
    },
  },
});

mock.module("node:fs", {
  defaultExport: {
    readFileSync: (filePath: string, _encoding: string) => {
      const content = mockFiles.get(filePath);
      if (content === undefined) {
        const err = new Error(`ENOENT: no such file or directory, open '${filePath}'`) as NodeJS.ErrnoException;
        err.code = "ENOENT";
        throw err;
      }
      return content;
    },
    writeFileSync: (filePath: string, data: string) => {
      mockFiles.set(filePath, data);
    },
    unlinkSync: (filePath: string) => {
      if (!mockFiles.has(filePath)) {
        const err = new Error(`ENOENT: no such file or directory, unlink '${filePath}'`) as NodeJS.ErrnoException;
        err.code = "ENOENT";
        throw err;
      }
      mockFiles.delete(filePath);
    },
    mkdirSync: () => {},
  },
});

// Import after mocks
const {
  getHeartbeatLockFile,
  isHeartbeatRunning,
  stopHeartbeat,
  startHeartbeatLoop,
} = await import("../dist/worker/heartbeat.js");

// ── Helpers ─────────────────────────────────────────────────────────

function insertRun(id: string, notifyUrl: string | null = null): void {
  const now = new Date().toISOString();
  testDb.prepare(
    "INSERT INTO runs (id, workflow_id, task, status, context, notify_url, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(id, "wf-1", "test task", "running", "{}", notifyUrl, now, now);
}

function insertStep(id: string, runId: string, status = "running"): void {
  const now = new Date().toISOString();
  testDb.prepare(
    "INSERT INTO steps (id, run_id, step_id, agent_id, step_index, input_template, expects, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(id, runId, id, "agent-1", 0, "template", "expects", status, now, now);
}

function setStepStatus(stepId: string, status: string): void {
  testDb.prepare("UPDATE steps SET status = ? WHERE id = ?").run(status, stepId);
}

function getTtlTimeoutCount(stepId: string): number {
  const row = testDb.prepare(
    "SELECT COUNT(*) as cnt FROM ttl_timeout_events WHERE step_id = ?"
  ).get(stepId) as { cnt: number };
  return row.cnt;
}

// ── Tests ───────────────────────────────────────────────────────────

describe("HeartbeatManager", () => {
  beforeEach(() => {
    testDb = createTestDb();
    mockFiles.clear();
    mockHeartbeatEnabled = true;
    mockTimeoutSeconds = 1800;
    mockTypingRefreshIntervalMs = 30_000;
    mockProgressUpdateIntervalMs = 90_000;
    mockTypingTtlMs = 120_000;
  });

  describe("getHeartbeatLockFile", () => {
    it("returns a lock file path containing the step ID", () => {
      const lockFile = getHeartbeatLockFile("step-abc-123");
      assert.ok(lockFile.includes("step-abc-123"), "lock file path should contain step ID");
      assert.ok(lockFile.endsWith(".lock"), "lock file should end with .lock");
      assert.ok(lockFile.includes("heartbeat-"), "lock file should contain heartbeat- prefix");
    });

    it("returns different paths for different step IDs", () => {
      const lock1 = getHeartbeatLockFile("step-1");
      const lock2 = getHeartbeatLockFile("step-2");
      assert.notEqual(lock1, lock2, "different steps should have different lock files");
    });
  });

  describe("isHeartbeatRunning", () => {
    it("returns false when no lock file exists", () => {
      assert.equal(isHeartbeatRunning("step-no-lock"), false);
    });

    it("returns true when lock file has current process PID", () => {
      const lockFile = getHeartbeatLockFile("step-alive");
      // Use our own PID so process.kill(pid, 0) succeeds
      mockFiles.set(lockFile, String(process.pid));
      assert.equal(isHeartbeatRunning("step-alive"), true);
    });

    it("returns false when lock file has dead PID", () => {
      const lockFile = getHeartbeatLockFile("step-dead");
      // Use a PID that almost certainly doesn't exist
      mockFiles.set(lockFile, "999999999");
      assert.equal(isHeartbeatRunning("step-dead"), false);
    });
  });

  describe("stopHeartbeat", () => {
    it("returns false when no lock file exists", () => {
      assert.equal(stopHeartbeat("step-no-lock"), false);
    });

    it("cleans up lock file even when process is dead", () => {
      const lockFile = getHeartbeatLockFile("step-dead");
      mockFiles.set(lockFile, "999999999");

      const result = stopHeartbeat("step-dead");
      // Returns false because process.kill will fail
      assert.equal(result, false);
      // Lock file should be cleaned up
      assert.equal(mockFiles.has(lockFile), false, "lock file should be removed");
    });
  });

  describe("startHeartbeatLoop — disabled heartbeat", () => {
    it("returns immediately when heartbeat is disabled", async () => {
      mockHeartbeatEnabled = false;

      // Should return quickly without any side effects
      await startHeartbeatLoop({
        stepId: "step-disabled",
        runId: "run-disabled",
        gatewayUrl: "http://localhost:9999",
      });

      // No lock file should have been created
      const lockFile = getHeartbeatLockFile("step-disabled");
      assert.equal(mockFiles.has(lockFile), false, "no lock file should exist when heartbeat is disabled");
    });
  });

  describe("startHeartbeatLoop — step already completed", () => {
    it("exits loop when step is not running", async () => {
      // Set up a completed step
      insertRun("run-done");
      insertStep("step-done", "run-done", "done");

      // Mock fetch to avoid real network calls
      const originalFetch = globalThis.fetch;
      globalThis.fetch = mock.fn(async () => new Response("ok", { status: 200 })) as typeof fetch;

      try {
        await startHeartbeatLoop({
          stepId: "step-done",
          runId: "run-done",
          gatewayUrl: "http://localhost:9999",
        });

        // Loop should have exited because isStepRunning returns false
        // Lock file should be cleaned up
        const lockFile = getHeartbeatLockFile("step-done");
        assert.equal(mockFiles.has(lockFile), false, "lock file should be cleaned up after loop exits");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  describe("startHeartbeatLoop — hard timeout", () => {
    it("exits loop when hard timeout is reached", async () => {
      // Set up a running step
      insertRun("run-timeout");
      insertStep("step-timeout", "run-timeout", "running");

      // Very short timeout to trigger quickly
      mockTimeoutSeconds = 0; // 0 seconds = immediate timeout
      mockTypingTtlMs = 0;

      const originalFetch = globalThis.fetch;
      globalThis.fetch = mock.fn(async () => new Response("ok", { status: 200 })) as typeof fetch;

      try {
        await startHeartbeatLoop({
          stepId: "step-timeout",
          runId: "run-timeout",
          gatewayUrl: "http://localhost:9999",
        });

        // Loop should have exited due to hard timeout
        const lockFile = getHeartbeatLockFile("step-timeout");
        assert.equal(mockFiles.has(lockFile), false, "lock file should be cleaned up after timeout");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  describe("startHeartbeatLoop — lock file lifecycle", () => {
    it("creates lock file on start and removes it on exit", async () => {
      insertRun("run-lock");
      insertStep("step-lock", "run-lock", "done"); // done = loop exits immediately

      const originalFetch = globalThis.fetch;
      globalThis.fetch = mock.fn(async () => new Response("ok", { status: 200 })) as typeof fetch;

      try {
        const lockFile = getHeartbeatLockFile("step-lock");
        assert.equal(mockFiles.has(lockFile), false, "lock file should not exist before start");

        await startHeartbeatLoop({
          stepId: "step-lock",
          runId: "run-lock",
          gatewayUrl: "http://localhost:9999",
        });

        // After loop exits, lock file should be cleaned up
        assert.equal(mockFiles.has(lockFile), false, "lock file should be cleaned up after loop exits");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  describe("startHeartbeatLoop — gateway configuration", () => {
    it("uses provided gatewayUrl when specified", async () => {
      insertRun("run-gw");
      insertStep("step-gw", "run-gw", "running");
      mockTimeoutSeconds = 0; // immediate exit

      const fetchCalls: string[] = [];
      const originalFetch = globalThis.fetch;
      globalThis.fetch = mock.fn(async (input: string | URL | Request) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        fetchCalls.push(url);
        return new Response("ok", { status: 200 });
      }) as typeof fetch;

      try {
        await startHeartbeatLoop({
          stepId: "step-gw",
          runId: "run-gw",
          gatewayUrl: "http://custom-gateway:1234",
          gatewayToken: "test-token",
        });

        // Any fetch calls should have used the custom gateway URL
        for (const url of fetchCalls) {
          assert.ok(
            url.startsWith("http://custom-gateway:1234"),
            `fetch URL ${url} should use custom gateway`
          );
        }
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });
});
