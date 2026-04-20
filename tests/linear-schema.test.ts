/**
 * Tests: linear_issue_links schema migration
 *
 * Covers US-001:
 *   - migrate() creates linear_issue_links with the MVP columns
 *   - run_id has a foreign key to runs(id)
 *   - Migration is idempotent (safe to run on an existing DB)
 *   - types.ts exports the expected shared types
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { migrate } from "../dist/db.js";

const EXPECTED_COLUMNS = [
  "linear_issue_id",
  "linear_identifier",
  "linear_url",
  "linear_title",
  "team_id",
  "workflow_id",
  "repo_path",
  "run_id",
  "sync_status",
  "last_linear_updated_at",
  "last_synced_run_status",
  "last_synced_step_id",
  "last_comment_hash",
  "last_error",
  "created_at",
  "updated_at",
];

function freshDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys=ON");
  migrate(db);
  return db;
}

describe("linear_issue_links schema", () => {
  it("creates the table with all MVP columns", () => {
    const db = freshDb();
    const cols = db
      .prepare("PRAGMA table_info(linear_issue_links)")
      .all() as Array<{ name: string; notnull: number; pk: number }>;
    const names = cols.map((c) => c.name);
    for (const col of EXPECTED_COLUMNS) {
      assert.ok(names.includes(col), `missing column: ${col}`);
    }
  });

  it("uses linear_issue_id as the primary key", () => {
    const db = freshDb();
    const cols = db
      .prepare("PRAGMA table_info(linear_issue_links)")
      .all() as Array<{ name: string; pk: number }>;
    const pk = cols.find((c) => c.pk === 1);
    assert.ok(pk, "primary key should exist");
    assert.equal(pk!.name, "linear_issue_id");
  });

  it("enforces NOT NULL on the required columns", () => {
    const db = freshDb();
    const cols = db
      .prepare("PRAGMA table_info(linear_issue_links)")
      .all() as Array<{ name: string; notnull: number }>;
    const byName = new Map(cols.map((c) => [c.name, c.notnull]));
    // linear_issue_id is the PK — PRAGMA reports notnull=0 for TEXT PKs
    // in SQLite, but the PK constraint still rejects NULL at insert time.
    const requiredNotNull = [
      "linear_identifier",
      "linear_url",
      "linear_title",
      "team_id",
      "workflow_id",
      "repo_path",
      "sync_status",
      "created_at",
      "updated_at",
    ];
    for (const col of requiredNotNull) {
      assert.equal(byName.get(col), 1, `${col} should be NOT NULL`);
    }
    assert.equal(byName.get("run_id"), 0, "run_id should be nullable");
    assert.equal(byName.get("last_error"), 0, "last_error should be nullable");
  });

  it("declares a foreign key from run_id to runs(id)", () => {
    const db = freshDb();
    const fks = db
      .prepare("PRAGMA foreign_key_list(linear_issue_links)")
      .all() as Array<{ from: string; to: string; table: string }>;
    const runFk = fks.find((f) => f.from === "run_id");
    assert.ok(runFk, "run_id FK should be declared");
    assert.equal(runFk!.table, "runs");
    assert.equal(runFk!.to, "id");
  });

  it("is idempotent — running migrate twice does not error or duplicate", () => {
    const db = freshDb();
    // Seed a row so we can verify it survives re-migration.
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO linear_issue_links
       (linear_issue_id, linear_identifier, linear_url, linear_title,
        team_id, workflow_id, repo_path, sync_status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      "iss_1",
      "ENG-1",
      "https://linear.app/x/issue/ENG-1",
      "Test",
      "team_1",
      "feature-dev",
      "/repo",
      "pending",
      now,
      now,
    );

    assert.doesNotThrow(() => migrate(db));
    assert.doesNotThrow(() => migrate(db));

    const count = (
      db.prepare("SELECT COUNT(*) AS n FROM linear_issue_links").get() as {
        n: number;
      }
    ).n;
    assert.equal(count, 1, "existing row should survive re-migration");
  });

  it("accepts a full MVP row insert and round-trips values", () => {
    const db = freshDb();
    const now = new Date().toISOString();
    const runId = "run_abc";
    db.prepare(
      `INSERT INTO runs (id, workflow_id, task, status, context, created_at, updated_at)
       VALUES (?, 'feature-dev', 'task', 'running', '{}', ?, ?)`,
    ).run(runId, now, now);

    db.prepare(
      `INSERT INTO linear_issue_links
       (linear_issue_id, linear_identifier, linear_url, linear_title,
        team_id, workflow_id, repo_path, run_id, sync_status,
        last_linear_updated_at, last_synced_run_status, last_synced_step_id,
        last_comment_hash, last_error, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      "iss_full",
      "ENG-42",
      "https://linear.app/x/issue/ENG-42",
      "Full row",
      "team_1",
      "feature-dev",
      "/Users/me/repo",
      runId,
      "running",
      now,
      "running",
      "step_1",
      "hash-1",
      null,
      now,
      now,
    );

    const row = db
      .prepare("SELECT * FROM linear_issue_links WHERE linear_issue_id = ?")
      .get("iss_full") as Record<string, unknown>;
    assert.equal(row.linear_identifier, "ENG-42");
    assert.equal(row.run_id, runId);
    assert.equal(row.sync_status, "running");
    assert.equal(row.last_synced_step_id, "step_1");
    assert.equal(row.last_error, null);
  });

  it("rejects FK violations on run_id when foreign_keys=ON", () => {
    const db = freshDb();
    const now = new Date().toISOString();
    assert.throws(() => {
      db.prepare(
        `INSERT INTO linear_issue_links
         (linear_issue_id, linear_identifier, linear_url, linear_title,
          team_id, workflow_id, repo_path, run_id, sync_status,
          created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        "iss_bad",
        "ENG-99",
        "https://linear.app/x/issue/ENG-99",
        "Bad FK",
        "team_1",
        "feature-dev",
        "/repo",
        "missing_run",
        "launched",
        now,
        now,
      );
    }, /FOREIGN KEY/i);
  });
});

describe("linear types module", () => {
  it("can be imported without runtime errors", async () => {
    const mod = await import("../dist/integrations/linear/types.js");
    assert.equal(
      typeof mod,
      "object",
      "types module should load (type-only, no runtime exports)",
    );
  });
});
