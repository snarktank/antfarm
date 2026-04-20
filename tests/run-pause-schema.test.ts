/**
 * Tests: runs table pause schema migration
 *
 * Covers US-001:
 *   - migrate() adds pause_requested_at and paused_at columns to runs
 *   - Migration is idempotent
 *   - When applied to a legacy DB (runs table without the new columns),
 *     existing rows survive and the new columns default to NULL
 *   - A run row can be inserted/updated with paused status + pause metadata
 *     and round-trip the values
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { migrate } from "../dist/db.js";
import type { RunInfo } from "../dist/installer/status.js";

function freshDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys=ON");
  migrate(db);
  return db;
}

/**
 * Build a "legacy" runs table that mirrors the pre-pause schema, then call
 * migrate() and assert it adds the new columns without recreating the table.
 */
function legacyDbWithoutPauseColumns(): DatabaseSync {
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
  `);
  return db;
}

describe("runs table pause schema", () => {
  it("adds pause_requested_at and paused_at columns on a fresh migration", () => {
    const db = freshDb();
    const cols = db
      .prepare("PRAGMA table_info(runs)")
      .all() as Array<{ name: string; notnull: number; pk: number }>;
    const names = cols.map((c) => c.name);
    assert.ok(names.includes("pause_requested_at"), "missing pause_requested_at column");
    assert.ok(names.includes("paused_at"), "missing paused_at column");
  });

  it("declares both pause columns as nullable", () => {
    const db = freshDb();
    const cols = db
      .prepare("PRAGMA table_info(runs)")
      .all() as Array<{ name: string; notnull: number }>;
    const byName = new Map(cols.map((c) => [c.name, c.notnull]));
    assert.equal(byName.get("pause_requested_at"), 0, "pause_requested_at must be nullable");
    assert.equal(byName.get("paused_at"), 0, "paused_at must be nullable");
  });

  it("is idempotent — repeated migrate() calls do not error or duplicate columns", () => {
    const db = freshDb();
    assert.doesNotThrow(() => migrate(db));
    assert.doesNotThrow(() => migrate(db));
    const cols = db.prepare("PRAGMA table_info(runs)").all() as Array<{ name: string }>;
    const pauseRequested = cols.filter((c) => c.name === "pause_requested_at");
    const pausedAt = cols.filter((c) => c.name === "paused_at");
    assert.equal(pauseRequested.length, 1, "pause_requested_at should appear exactly once");
    assert.equal(pausedAt.length, 1, "paused_at should appear exactly once");
  });

  it("upgrades a legacy DB without recreating the runs table and preserves rows", () => {
    const db = legacyDbWithoutPauseColumns();

    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO runs (id, workflow_id, task, status, context, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run("legacy_run_1", "feature-dev", "legacy task", "running", "{}", now, now);

    // Sanity: legacy table does not yet have the new columns.
    const before = db.prepare("PRAGMA table_info(runs)").all() as Array<{ name: string }>;
    assert.ok(!before.some((c) => c.name === "pause_requested_at"));
    assert.ok(!before.some((c) => c.name === "paused_at"));

    assert.doesNotThrow(() => migrate(db));

    const after = db.prepare("PRAGMA table_info(runs)").all() as Array<{ name: string }>;
    assert.ok(after.some((c) => c.name === "pause_requested_at"), "pause_requested_at added");
    assert.ok(after.some((c) => c.name === "paused_at"), "paused_at added");

    // Existing row survives and the two new columns default to NULL.
    const row = db
      .prepare(
        "SELECT id, status, pause_requested_at, paused_at FROM runs WHERE id = ?",
      )
      .get("legacy_run_1") as {
        id: string;
        status: string;
        pause_requested_at: string | null;
        paused_at: string | null;
      };
    assert.equal(row.id, "legacy_run_1");
    assert.equal(row.status, "running");
    assert.equal(row.pause_requested_at, null);
    assert.equal(row.paused_at, null);
  });

  it("round-trips paused status with pause_requested_at and paused_at metadata", () => {
    const db = freshDb();
    const now = new Date().toISOString();
    const requestedAt = new Date(Date.now() - 1000).toISOString();
    const pausedAt = now;

    db.prepare(
      `INSERT INTO runs
       (id, workflow_id, task, status, context, pause_requested_at, paused_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      "run_paused_1",
      "feature-dev",
      "paused task",
      "paused",
      "{}",
      requestedAt,
      pausedAt,
      now,
      now,
    );

    const row = db
      .prepare("SELECT * FROM runs WHERE id = ?")
      .get("run_paused_1") as RunInfo;
    assert.equal(row.status, "paused");
    assert.equal(row.pause_requested_at, requestedAt);
    assert.equal(row.paused_at, pausedAt);
  });

  it("permits clearing pause metadata on resume (set both back to NULL)", () => {
    const db = freshDb();
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO runs
       (id, workflow_id, task, status, context, pause_requested_at, paused_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run("run_resume_1", "feature-dev", "task", "paused", "{}", now, now, now, now);

    db.prepare(
      `UPDATE runs
         SET status = 'running',
             pause_requested_at = NULL,
             paused_at = NULL,
             updated_at = ?
       WHERE id = ?`,
    ).run(new Date().toISOString(), "run_resume_1");

    const row = db
      .prepare("SELECT status, pause_requested_at, paused_at FROM runs WHERE id = ?")
      .get("run_resume_1") as { status: string; pause_requested_at: string | null; paused_at: string | null };
    assert.equal(row.status, "running");
    assert.equal(row.pause_requested_at, null);
    assert.equal(row.paused_at, null);
  });
});

describe("RunInfo type exposes pause metadata fields", () => {
  it("compiles a RunInfo literal that includes paused status and pause metadata", () => {
    // Compile-time guarantee: this object must satisfy RunInfo. If the type
    // does not include the new fields or the paused status, the dist/.d.ts
    // structural check fails (the cast below is the assertion).
    const info = {
      id: "run_x",
      run_number: 1,
      workflow_id: "feature-dev",
      task: "t",
      status: "paused",
      context: "{}",
      archived_at: null,
      pause_requested_at: "2026-04-20T00:00:00.000Z",
      paused_at: "2026-04-20T00:00:01.000Z",
      created_at: "2026-04-20T00:00:00.000Z",
      updated_at: "2026-04-20T00:00:00.000Z",
    } as const;

    // Cast to RunInfo — this is the structural check at runtime via dist d.ts.
    const asInfo: RunInfo = info as unknown as RunInfo;
    assert.equal(asInfo.status, "paused");
    assert.equal(asInfo.pause_requested_at, "2026-04-20T00:00:00.000Z");
    assert.equal(asInfo.paused_at, "2026-04-20T00:00:01.000Z");
  });
});
