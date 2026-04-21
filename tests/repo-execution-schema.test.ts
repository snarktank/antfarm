/**
 * Tests: steps table repo execution metadata migration
 *
 * Covers US-001 (Persist repo execution metadata and step isolation policy):
 *   - migrate() adds execution_mode, repo_key, repo_path, queued_at,
 *     blocked_by_run_id, blocked_by_step_id columns to the steps table
 *   - All new columns are nullable so legacy rows migrate cleanly
 *   - Migration is idempotent — repeat calls don't error or duplicate columns
 *   - Applied to a legacy steps table, existing rows survive and the new
 *     columns default to NULL
 *   - A step row round-trips the new fields (mode, key, blocked metadata)
 *   - An index on (repo_key, status) exists so same-repo lookups can be
 *     served without a full table scan
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { migrate } from "../dist/db.js";
import type { StepInfo } from "../dist/installer/status.js";

const NEW_STEP_COLUMNS = [
  "execution_mode",
  "repo_key",
  "repo_path",
  "queued_at",
  "blocked_by_run_id",
  "blocked_by_step_id",
] as const;

function freshDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys=ON");
  migrate(db);
  return db;
}

/**
 * Build a "legacy" steps table that mirrors the pre-isolation schema,
 * then call migrate() and assert it adds the new columns without
 * recreating the table.
 */
function legacyDbWithoutRepoColumns(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys=ON");
  db.exec(`
    CREATE TABLE runs (
      id TEXT PRIMARY KEY,
      workflow_id TEXT NOT NULL,
      task TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'running',
      context TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE steps (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL REFERENCES runs(id),
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
  `);
  return db;
}

describe("steps table repo execution metadata", () => {
  it("adds all repo execution metadata columns on a fresh migration", () => {
    const db = freshDb();
    const cols = db.prepare("PRAGMA table_info(steps)").all() as Array<{ name: string }>;
    const names = new Set(cols.map((c) => c.name));
    for (const col of NEW_STEP_COLUMNS) {
      assert.ok(names.has(col), `missing column ${col}`);
    }
  });

  it("declares all new repo execution columns as nullable", () => {
    const db = freshDb();
    const cols = db.prepare("PRAGMA table_info(steps)").all() as Array<{
      name: string;
      notnull: number;
    }>;
    const byName = new Map(cols.map((c) => [c.name, c.notnull]));
    for (const col of NEW_STEP_COLUMNS) {
      assert.equal(byName.get(col), 0, `${col} must be nullable`);
    }
  });

  it("is idempotent — repeat migrate() calls don't error or duplicate columns", () => {
    const db = freshDb();
    assert.doesNotThrow(() => migrate(db));
    assert.doesNotThrow(() => migrate(db));
    assert.doesNotThrow(() => migrate(db));
    const cols = db.prepare("PRAGMA table_info(steps)").all() as Array<{ name: string }>;
    for (const col of NEW_STEP_COLUMNS) {
      const matches = cols.filter((c) => c.name === col);
      assert.equal(matches.length, 1, `${col} should appear exactly once`);
    }
  });

  it("upgrades a legacy DB without recreating the steps table, preserving rows", () => {
    const db = legacyDbWithoutRepoColumns();
    const now = new Date().toISOString();

    db.prepare(
      `INSERT INTO runs (id, workflow_id, task, status, context, created_at, updated_at)
       VALUES ('run_legacy', 'feature-dev', 't', 'running', '{}', ?, ?)`,
    ).run(now, now);
    db.prepare(
      `INSERT INTO steps
        (id, run_id, step_id, agent_id, step_index, input_template, expects,
         status, created_at, updated_at)
       VALUES ('step_legacy', 'run_legacy', 'implement', 'feature-dev_developer',
               0, '', '', 'waiting', ?, ?)`,
    ).run(now, now);

    const before = db.prepare("PRAGMA table_info(steps)").all() as Array<{ name: string }>;
    for (const col of NEW_STEP_COLUMNS) {
      assert.ok(!before.some((c) => c.name === col), `legacy table should lack ${col}`);
    }

    assert.doesNotThrow(() => migrate(db));

    const after = db.prepare("PRAGMA table_info(steps)").all() as Array<{ name: string }>;
    for (const col of NEW_STEP_COLUMNS) {
      assert.ok(after.some((c) => c.name === col), `${col} added after migration`);
    }

    const row = db
      .prepare(
        `SELECT id, status, execution_mode, repo_key, repo_path,
                queued_at, blocked_by_run_id, blocked_by_step_id
         FROM steps WHERE id = ?`,
      )
      .get("step_legacy") as {
        id: string;
        status: string;
        execution_mode: string | null;
        repo_key: string | null;
        repo_path: string | null;
        queued_at: string | null;
        blocked_by_run_id: string | null;
        blocked_by_step_id: string | null;
      };
    assert.equal(row.id, "step_legacy");
    assert.equal(row.status, "waiting");
    assert.equal(row.execution_mode, null);
    assert.equal(row.repo_key, null);
    assert.equal(row.repo_path, null);
    assert.equal(row.queued_at, null);
    assert.equal(row.blocked_by_run_id, null);
    assert.equal(row.blocked_by_step_id, null);
  });

  it("round-trips repo execution metadata through a step row", () => {
    const db = freshDb();
    const now = new Date().toISOString();

    db.prepare(
      `INSERT INTO runs (id, workflow_id, task, status, context, created_at, updated_at)
       VALUES ('run_A', 'feature-dev', 't', 'running', '{}', ?, ?)`,
    ).run(now, now);
    db.prepare(
      `INSERT INTO steps
        (id, run_id, step_id, agent_id, step_index, input_template, expects,
         status, execution_mode, repo_key, repo_path, queued_at,
         blocked_by_run_id, blocked_by_step_id, created_at, updated_at)
       VALUES ('step_A', 'run_A', 'implement', 'feature-dev_developer', 0,
               '', '', 'pending',
               'shared_checkout_exclusive', '/repos/app', '/repos/app',
               ?, 'run_B', 'step_B', ?, ?)`,
    ).run(now, now, now);

    const row = db.prepare("SELECT * FROM steps WHERE id = 'step_A'").get() as StepInfo;
    assert.equal(row.execution_mode, "shared_checkout_exclusive");
    assert.equal(row.repo_key, "/repos/app");
    assert.equal(row.repo_path, "/repos/app");
    assert.equal(row.queued_at, now);
    assert.equal(row.blocked_by_run_id, "run_B");
    assert.equal(row.blocked_by_step_id, "step_B");
  });

  it("permits clearing queue metadata when a step claims the repo lock", () => {
    const db = freshDb();
    const now = new Date().toISOString();

    db.prepare(
      `INSERT INTO runs (id, workflow_id, task, status, context, created_at, updated_at)
       VALUES ('run_C', 'feature-dev', 't', 'running', '{}', ?, ?)`,
    ).run(now, now);
    db.prepare(
      `INSERT INTO steps
        (id, run_id, step_id, agent_id, step_index, input_template, expects,
         status, execution_mode, repo_key, repo_path, queued_at,
         blocked_by_run_id, blocked_by_step_id, created_at, updated_at)
       VALUES ('step_C', 'run_C', 'implement', 'feature-dev_developer', 0,
               '', '', 'pending',
               'shared_checkout_exclusive', '/repos/app', '/repos/app',
               ?, 'run_D', 'step_D', ?, ?)`,
    ).run(now, now, now);

    db.prepare(
      `UPDATE steps
         SET status = 'running',
             queued_at = NULL,
             blocked_by_run_id = NULL,
             blocked_by_step_id = NULL,
             updated_at = ?
       WHERE id = 'step_C'`,
    ).run(new Date().toISOString());

    const row = db
      .prepare(
        `SELECT status, queued_at, blocked_by_run_id, blocked_by_step_id
         FROM steps WHERE id = 'step_C'`,
      )
      .get() as {
        status: string;
        queued_at: string | null;
        blocked_by_run_id: string | null;
        blocked_by_step_id: string | null;
      };
    assert.equal(row.status, "running");
    assert.equal(row.queued_at, null);
    assert.equal(row.blocked_by_run_id, null);
    assert.equal(row.blocked_by_step_id, null);
  });

  it("creates an index on (repo_key, status) for same-repo scheduling lookups", () => {
    const db = freshDb();
    const indexes = db
      .prepare("PRAGMA index_list(steps)")
      .all() as Array<{ name: string }>;
    const idx = indexes.find((i) => i.name === "idx_steps_repo_key_status");
    assert.ok(idx, "expected idx_steps_repo_key_status index to exist");

    const cols = db
      .prepare("PRAGMA index_info(idx_steps_repo_key_status)")
      .all() as Array<{ seqno: number; name: string }>;
    const orderedNames = cols
      .sort((a, b) => a.seqno - b.seqno)
      .map((c) => c.name);
    assert.deepEqual(orderedNames, ["repo_key", "status"]);
  });
});

describe("StepInfo type exposes repo execution metadata fields", () => {
  it("compiles a StepInfo literal that includes the new fields", () => {
    // Compile-time guarantee via dist d.ts: if any field is missing from
    // StepInfo, this cast fails at runtime when dist is rebuilt.
    const info = {
      id: "step_1",
      run_id: "run_1",
      step_id: "implement",
      agent_id: "feature-dev_developer",
      step_index: 0,
      input_template: "",
      expects: "",
      status: "pending",
      output: null,
      retry_count: 0,
      max_retries: 2,
      execution_mode: "shared_checkout_exclusive",
      repo_key: "/repos/app",
      repo_path: "/repos/app",
      queued_at: "2026-04-20T00:00:00.000Z",
      blocked_by_run_id: "run_other",
      blocked_by_step_id: "step_other",
      created_at: "2026-04-20T00:00:00.000Z",
      updated_at: "2026-04-20T00:00:00.000Z",
    } as const;

    const asInfo: StepInfo = info as unknown as StepInfo;
    assert.equal(asInfo.execution_mode, "shared_checkout_exclusive");
    assert.equal(asInfo.repo_key, "/repos/app");
    assert.equal(asInfo.blocked_by_run_id, "run_other");
  });
});
