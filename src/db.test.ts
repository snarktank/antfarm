import { test, describe, before, after } from "node:test";
import assert from "node:assert";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// Test with an in-memory or temp database to avoid polluting real data
const TEST_DB_PATH = path.join(os.tmpdir(), `antfarm-test-${Date.now()}.db`);

function createTestDb(): DatabaseSync {
  const db = new DatabaseSync(TEST_DB_PATH);
  db.exec("PRAGMA journal_mode=WAL");
  db.exec("PRAGMA foreign_keys=ON");
  
  // Copy the migrate logic from db.ts
  db.exec(`
    CREATE TABLE IF NOT EXISTS runs (
      id TEXT PRIMARY KEY,
      workflow_id TEXT NOT NULL,
      task TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'running',
      context TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS steps (
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

    CREATE TABLE IF NOT EXISTS stories (
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

    CREATE TABLE IF NOT EXISTS usage (
      id TEXT PRIMARY KEY,
      run_id TEXT REFERENCES runs(id),
      step_id TEXT,
      agent_id TEXT NOT NULL,
      model TEXT NOT NULL,
      input_tokens INTEGER,
      output_tokens INTEGER,
      cost_usd REAL,
      task_label TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_usage_agent_id ON usage(agent_id);
    CREATE INDEX IF NOT EXISTS idx_usage_model ON usage(model);
    CREATE INDEX IF NOT EXISTS idx_usage_created_at ON usage(created_at);
  `);
  
  return db;
}

describe("usage table", () => {
  let db: DatabaseSync;

  before(() => {
    db = createTestDb();
  });

  after(() => {
    db.close();
    try { fs.unlinkSync(TEST_DB_PATH); } catch {}
  });

  test("usage table exists with correct columns", () => {
    const cols = db.prepare("PRAGMA table_info(usage)").all() as Array<{ name: string; type: string; notnull: number }>;
    const colMap = new Map(cols.map(c => [c.name, c]));

    // Check all required columns exist
    const requiredCols = ["id", "run_id", "step_id", "agent_id", "model", "input_tokens", "output_tokens", "cost_usd", "task_label", "created_at"];
    for (const col of requiredCols) {
      assert.ok(colMap.has(col), `Column ${col} should exist`);
    }

    // Check column types
    assert.strictEqual(colMap.get("id")?.type, "TEXT");
    assert.strictEqual(colMap.get("run_id")?.type, "TEXT");
    assert.strictEqual(colMap.get("step_id")?.type, "TEXT");
    assert.strictEqual(colMap.get("agent_id")?.type, "TEXT");
    assert.strictEqual(colMap.get("model")?.type, "TEXT");
    assert.strictEqual(colMap.get("input_tokens")?.type, "INTEGER");
    assert.strictEqual(colMap.get("output_tokens")?.type, "INTEGER");
    assert.strictEqual(colMap.get("cost_usd")?.type, "REAL");
    assert.strictEqual(colMap.get("task_label")?.type, "TEXT");
    assert.strictEqual(colMap.get("created_at")?.type, "TEXT");

    // Check NOT NULL constraints
    assert.strictEqual(colMap.get("agent_id")?.notnull, 1, "agent_id should be NOT NULL");
    assert.strictEqual(colMap.get("model")?.notnull, 1, "model should be NOT NULL");
    assert.strictEqual(colMap.get("created_at")?.notnull, 1, "created_at should be NOT NULL");
    
    // run_id and step_id should be nullable
    assert.strictEqual(colMap.get("run_id")?.notnull, 0, "run_id should be nullable");
    assert.strictEqual(colMap.get("step_id")?.notnull, 0, "step_id should be nullable");
  });

  test("indexes exist on agent_id, model, and created_at", () => {
    const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='usage'").all() as Array<{ name: string }>;
    const indexNames = indexes.map(i => i.name);

    assert.ok(indexNames.includes("idx_usage_agent_id"), "Index on agent_id should exist");
    assert.ok(indexNames.includes("idx_usage_model"), "Index on model should exist");
    assert.ok(indexNames.includes("idx_usage_created_at"), "Index on created_at should exist");
  });

  test("can insert usage record without run_id (standalone tracking)", () => {
    const now = new Date().toISOString();
    const stmt = db.prepare(`
      INSERT INTO usage (id, agent_id, model, input_tokens, output_tokens, cost_usd, task_label, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run("test-usage-1", "feature-dev/developer", "claude-sonnet-4-5", 1000, 500, 0.015, "test task", now);

    const row = db.prepare("SELECT * FROM usage WHERE id = ?").get("test-usage-1") as Record<string, unknown>;
    assert.strictEqual(row.agent_id, "feature-dev/developer");
    assert.strictEqual(row.model, "claude-sonnet-4-5");
    assert.strictEqual(row.input_tokens, 1000);
    assert.strictEqual(row.output_tokens, 500);
    assert.strictEqual(row.cost_usd, 0.015);
    assert.strictEqual(row.run_id, null);
  });

  test("can insert usage record with run_id (workflow tracking)", () => {
    const now = new Date().toISOString();
    
    // First insert a run
    db.prepare(`
      INSERT INTO runs (id, workflow_id, task, status, context, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run("test-run-1", "feature-dev", "test task", "running", "{}", now, now);

    // Now insert usage with run_id
    db.prepare(`
      INSERT INTO usage (id, run_id, step_id, agent_id, model, input_tokens, output_tokens, cost_usd, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run("test-usage-2", "test-run-1", "step-1", "feature-dev/developer", "claude-opus-4", 2000, 1000, 0.10, now);

    const row = db.prepare("SELECT * FROM usage WHERE id = ?").get("test-usage-2") as Record<string, unknown>;
    assert.strictEqual(row.run_id, "test-run-1");
    assert.strictEqual(row.step_id, "step-1");
  });
});
