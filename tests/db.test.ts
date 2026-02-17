/**
 * Database module unit tests
 *
 * Tests getDb() singleton caching, migration schema creation,
 * backwards-compat column additions, getDbPath(), and idempotent migration.
 *
 * Approach: Mock node:os to redirect homedir to a temp directory so getDb()
 * creates a real SQLite database in an isolated location. This tests the
 * full getDb() + migrate() flow end-to-end.
 */

import { describe, it, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// ── Temp directory for test isolation ───────────────────────────────

const TEMP_BASE = fs.mkdtempSync(path.join(os.tmpdir(), "antfarm-db-test-"));
let testCounter = 0;
let currentHome = "";

// ── Module mocks ────────────────────────────────────────────────────

mock.module("node:os", {
  defaultExport: {
    homedir: () => currentHome,
    tmpdir: os.tmpdir,
    platform: os.platform,
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

// Import after mocks
const { getDb, getDbPath } = await import("../dist/db.js");

// ── Helpers ─────────────────────────────────────────────────────────

type AnyDb = ReturnType<typeof getDb>;

function getTableNames(db: AnyDb): string[] {
  const rows = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    .all() as Array<{ name: string }>;
  return rows.map((r: { name: string }) => r.name);
}

function getColumnNames(db: AnyDb, table: string): string[] {
  const rows = db
    .prepare(`PRAGMA table_info(${table})`)
    .all() as Array<{ name: string }>;
  return rows.map((r: { name: string }) => r.name);
}

// Force cache expiry so getDb() creates a fresh connection each test
const originalDateNow = Date.now;
let dateNowValue = originalDateNow.call(Date);

// ── Tests ───────────────────────────────────────────────────────────

describe("Database module", () => {
  beforeEach(() => {
    // Each test gets a unique fake home dir → unique DB file
    testCounter++;
    currentHome = path.join(TEMP_BASE, `home-${testCounter}`);
    fs.mkdirSync(currentHome, { recursive: true });

    // Force cache miss by advancing time past DB_MAX_AGE_MS (5000ms)
    dateNowValue += 100_000;
    Date.now = () => dateNowValue;
  });

  afterEach(() => {
    Date.now = originalDateNow;
  });

  describe("getDb() — singleton and caching", () => {
    it("returns a database instance with exec and prepare methods", () => {
      const db = getDb();
      assert.ok(db, "getDb() should return a database");
      assert.equal(typeof db.exec, "function", "should have exec method");
      assert.equal(typeof db.prepare, "function", "should have prepare method");
    });

    it("returns the same instance on consecutive calls within TTL", () => {
      const db1 = getDb();
      // Don't advance time — should return cached instance
      const db2 = getDb();
      assert.strictEqual(db1, db2, "should return cached singleton");
    });
  });

  describe("getDb() — migration creates all tables", () => {
    it("creates runs, steps, stories, workers, concurrency_queue, and event_loop_metrics", () => {
      const db = getDb();
      const tables = getTableNames(db);
      assert.ok(tables.includes("runs"), "should create runs table");
      assert.ok(tables.includes("steps"), "should create steps table");
      assert.ok(tables.includes("stories"), "should create stories table");
      assert.ok(tables.includes("workers"), "should create workers table");
      assert.ok(tables.includes("concurrency_queue"), "should create concurrency_queue table");
      assert.ok(tables.includes("event_loop_metrics"), "should create event_loop_metrics table");
    });
  });

  describe("getDb() — migration adds backwards-compat columns", () => {
    it("adds type, loop_config, current_story_id, abandoned_count to steps", () => {
      const db = getDb();
      const cols = getColumnNames(db, "steps");
      assert.ok(cols.includes("type"), "steps should have type column");
      assert.ok(cols.includes("loop_config"), "steps should have loop_config column");
      assert.ok(cols.includes("current_story_id"), "steps should have current_story_id column");
      assert.ok(cols.includes("abandoned_count"), "steps should have abandoned_count column");
    });

    it("adds notify_url to runs", () => {
      const db = getDb();
      const cols = getColumnNames(db, "runs");
      assert.ok(cols.includes("notify_url"), "runs should have notify_url column");
    });
  });

  describe("getDb() — schema supports queries and constraints", () => {
    it("can insert and query a run record", () => {
      const db = getDb();
      const now = new Date().toISOString();
      const runId = `run-insert-${testCounter}-${Date.now()}`;
      db.prepare(
        "INSERT INTO runs (id, workflow_id, task, status, context, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
      ).run(runId, "wf-1", "test task", "running", "{}", now, now);

      const row = db
        .prepare("SELECT * FROM runs WHERE id = ?")
        .get(runId) as { id: string; task: string; status: string };
      assert.equal(row.id, runId);
      assert.equal(row.task, "test task");
      assert.equal(row.status, "running");
    });

    it("enforces foreign key constraint on steps referencing runs", () => {
      const db = getDb();
      const now = new Date().toISOString();
      assert.throws(
        () => {
          db.prepare(
            "INSERT INTO steps (id, run_id, step_id, agent_id, step_index, input_template, expects, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
          ).run("step-1", "nonexistent-run", "s1", "agent-1", 0, "template", "output", "waiting", now, now);
        },
        /FOREIGN KEY constraint failed/,
        "should reject step with non-existent run_id"
      );
    });
  });

  describe("getDb() — migration is idempotent", () => {
    it("calling getDb() twice with cache expired does not throw", () => {
      getDb();
      // Advance time to force re-init (past DB_MAX_AGE_MS of 5000)
      dateNowValue += 10_000;
      assert.doesNotThrow(() => getDb(), "migration should be idempotent");
    });
  });

  describe("getDbPath", () => {
    it("returns path containing antfarm.db", () => {
      const p = getDbPath();
      assert.ok(p.includes("antfarm.db"), "path should include antfarm.db");
    });
  });
});
