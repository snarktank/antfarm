import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { pathToFileURL } from "node:url";

const tempHomes: string[] = [];
const originalHome = process.env.HOME;

function makeTempHome(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "antfarm-db-migration-"));
  tempHomes.push(dir);
  return dir;
}

async function importFreshDbModule() {
  const moduleUrl = `${pathToFileURL(path.join(process.cwd(), "dist/db.js")).href}?t=${Date.now()}-${Math.random()}`;
  return import(moduleUrl);
}

afterEach(() => {
  process.env.HOME = originalHome;
  while (tempHomes.length > 0) {
    const dir = tempHomes.pop()!;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("db migration: execution-scope freeze metadata", () => {
  it("creates scope freeze columns and run_scope_items table for new databases", async () => {
    const fakeHome = makeTempHome();
    process.env.HOME = fakeHome;

    const { getDb } = await importFreshDbModule();
    const db = getDb();

    const runCols = db.prepare("PRAGMA table_info(runs)").all() as Array<{ name: string }>;
    const runColNames = new Set(runCols.map((c) => c.name));

    assert.ok(runColNames.has("scope_status"));
    assert.ok(runColNames.has("scope_frozen_at"));
    assert.ok(runColNames.has("scope_version"));

    const scopeTable = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'run_scope_items'")
      .get() as { name: string } | undefined;

    assert.equal(scopeTable?.name, "run_scope_items");

    // Idempotency check: reopening should not throw and schema remains present.
    const dbAgain = getDb();
    const scopeCols = dbAgain.prepare("PRAGMA table_info(run_scope_items)").all() as Array<{ name: string }>;
    assert.ok(scopeCols.length > 0);
  });

  it("adds scope freeze columns to existing runs table without data loss", async () => {
    const fakeHome = makeTempHome();
    process.env.HOME = fakeHome;

    const dbDir = path.join(fakeHome, ".openclaw", "antfarm");
    fs.mkdirSync(dbDir, { recursive: true });
    const dbPath = path.join(dbDir, "antfarm.db");

    const legacyDb = new DatabaseSync(dbPath);
    legacyDb.exec(`
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

      CREATE TABLE stories (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL REFERENCES runs(id),
        story_index INTEGER NOT NULL,
        story_id TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        acceptance_criteria TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        output TEXT,
        retry_count INTEGER DEFAULT 0,
        max_retries INTEGER DEFAULT 2,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);

    legacyDb
      .prepare(
        "INSERT INTO runs (id, workflow_id, task, status, context, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
      )
      .run("run-legacy", "feature-dev", "legacy task", "running", "{}", "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z");
    legacyDb.close();

    const { getDb } = await importFreshDbModule();
    const migratedDb = getDb();

    const migrated = migratedDb
      .prepare("SELECT id, scope_status, scope_frozen_at, scope_version FROM runs WHERE id = ?")
      .get("run-legacy") as
      | { id: string; scope_status: string; scope_frozen_at: string | null; scope_version: number }
      | undefined;

    assert.ok(migrated, "existing run row should still exist");
    assert.equal(migrated!.scope_status, "unfrozen");
    assert.equal(migrated!.scope_frozen_at, null);
    assert.equal(migrated!.scope_version, 0);

    const scopeTable = migratedDb
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'run_scope_items'")
      .get() as { name: string } | undefined;
    assert.equal(scopeTable?.name, "run_scope_items");
  });
});
