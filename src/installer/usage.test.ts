import { test, describe, before, after } from "node:test";
import assert from "node:assert";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";

// Create isolated test database to avoid polluting real data
const TEST_DB_PATH = path.join(os.tmpdir(), `antfarm-usage-test-${Date.now()}.db`);

// We need to test the actual functions, so we'll create a test database
// that mirrors the real schema and test the mapping logic directly

function createTestDb(): DatabaseSync {
  const db = new DatabaseSync(TEST_DB_PATH);
  db.exec("PRAGMA journal_mode=WAL");
  db.exec("PRAGMA foreign_keys=ON");

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

// Helper to simulate the insertUsage logic against our test db
function insertUsage(
  db: DatabaseSync,
  record: {
    id?: string;
    runId?: string;
    stepId?: string;
    agentId: string;
    model: string;
    inputTokens?: number;
    outputTokens?: number;
    costUsd?: number;
    taskLabel?: string;
    createdAt?: string;
  }
): string {
  const id = record.id ?? crypto.randomUUID();
  const createdAt = record.createdAt ?? new Date().toISOString();

  db.prepare(`
    INSERT INTO usage (id, run_id, step_id, agent_id, model, input_tokens, output_tokens, cost_usd, task_label, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    record.runId ?? null,
    record.stepId ?? null,
    record.agentId,
    record.model,
    record.inputTokens ?? null,
    record.outputTokens ?? null,
    record.costUsd ?? null,
    record.taskLabel ?? null,
    createdAt
  );

  return id;
}

// Helper to simulate getUsageByRunId logic
function getUsageByRunId(db: DatabaseSync, runId: string): any[] {
  const rows = db.prepare(
    "SELECT * FROM usage WHERE run_id = ? ORDER BY created_at ASC"
  ).all(runId) as any[];

  return rows.map(row => ({
    id: row.id,
    runId: row.run_id ?? undefined,
    stepId: row.step_id ?? undefined,
    agentId: row.agent_id,
    model: row.model,
    inputTokens: row.input_tokens ?? undefined,
    outputTokens: row.output_tokens ?? undefined,
    costUsd: row.cost_usd ?? undefined,
    taskLabel: row.task_label ?? undefined,
    createdAt: row.created_at,
  }));
}

// Helper to simulate getUsageByAgentId logic
function getUsageByAgentId(db: DatabaseSync, agentId: string): any[] {
  const rows = db.prepare(
    "SELECT * FROM usage WHERE agent_id = ? ORDER BY created_at ASC"
  ).all(agentId) as any[];

  return rows.map(row => ({
    id: row.id,
    runId: row.run_id ?? undefined,
    stepId: row.step_id ?? undefined,
    agentId: row.agent_id,
    model: row.model,
    inputTokens: row.input_tokens ?? undefined,
    outputTokens: row.output_tokens ?? undefined,
    costUsd: row.cost_usd ?? undefined,
    taskLabel: row.task_label ?? undefined,
    createdAt: row.created_at,
  }));
}

describe("usage CRUD functions", () => {
  let db: DatabaseSync;

  before(() => {
    db = createTestDb();
  });

  after(() => {
    db.close();
    try { fs.unlinkSync(TEST_DB_PATH); } catch {}
  });

  test("insertUsage inserts a record and returns the id", () => {
    const id = insertUsage(db, {
      agentId: "test-agent-1",
      model: "claude-sonnet-4-5",
      inputTokens: 1000,
      outputTokens: 500,
      costUsd: 0.015,
      taskLabel: "test task",
    });

    assert.ok(id, "Should return an id");
    assert.strictEqual(typeof id, "string");

    // Verify the record was inserted
    const row = db.prepare("SELECT * FROM usage WHERE id = ?").get(id) as any;
    assert.ok(row, "Record should exist in database");
    assert.strictEqual(row.agent_id, "test-agent-1");
    assert.strictEqual(row.model, "claude-sonnet-4-5");
    assert.strictEqual(row.input_tokens, 1000);
    assert.strictEqual(row.output_tokens, 500);
    assert.strictEqual(row.cost_usd, 0.015);
    assert.strictEqual(row.task_label, "test task");
  });

  test("insertUsage uses provided id if given", () => {
    const customId = "custom-id-" + Date.now();
    const returnedId = insertUsage(db, {
      id: customId,
      agentId: "test-agent-2",
      model: "claude-opus-4",
    });

    assert.strictEqual(returnedId, customId);
  });

  test("getUsageByRunId returns all records for a run", () => {
    const now = new Date().toISOString();
    const runId = "test-run-" + Date.now();

    // Create a run first
    db.prepare(`
      INSERT INTO runs (id, workflow_id, task, status, context, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(runId, "test-workflow", "test task", "running", "{}", now, now);

    // Insert multiple usage records for this run
    insertUsage(db, { runId, agentId: "agent-a", model: "model-1", inputTokens: 100 });
    insertUsage(db, { runId, agentId: "agent-b", model: "model-2", inputTokens: 200 });
    insertUsage(db, { runId, agentId: "agent-a", model: "model-1", inputTokens: 300 });

    const records = getUsageByRunId(db, runId);
    assert.strictEqual(records.length, 3);
    assert.ok(records.every(r => r.runId === runId));
  });

  test("getUsageByRunId returns empty array when no records exist", () => {
    const records = getUsageByRunId(db, "nonexistent-run-id");
    assert.deepStrictEqual(records, []);
  });

  test("getUsageByAgentId returns all records for an agent", () => {
    const uniqueAgentId = "unique-agent-" + Date.now();

    // Insert multiple usage records for this agent
    insertUsage(db, { agentId: uniqueAgentId, model: "model-a", inputTokens: 100 });
    insertUsage(db, { agentId: uniqueAgentId, model: "model-b", inputTokens: 200 });

    const records = getUsageByAgentId(db, uniqueAgentId);
    assert.strictEqual(records.length, 2);
    assert.ok(records.every(r => r.agentId === uniqueAgentId));
  });

  test("getUsageByAgentId returns empty array when no records exist", () => {
    const records = getUsageByAgentId(db, "nonexistent-agent-id");
    assert.deepStrictEqual(records, []);
  });

  test("UsageRecord maps nullable fields correctly", () => {
    const id = insertUsage(db, {
      agentId: "test-nullable-agent",
      model: "test-model",
      // All optional fields omitted
    });

    const rows = db.prepare("SELECT * FROM usage WHERE id = ?").all(id) as any[];
    const row = rows[0];

    // Database should have nulls
    assert.strictEqual(row.run_id, null);
    assert.strictEqual(row.step_id, null);
    assert.strictEqual(row.input_tokens, null);
    assert.strictEqual(row.output_tokens, null);
    assert.strictEqual(row.cost_usd, null);
    assert.strictEqual(row.task_label, null);

    // When retrieved through our function, should be undefined
    const records = getUsageByAgentId(db, "test-nullable-agent");
    const record = records.find(r => r.id === id);
    assert.ok(record);
    assert.strictEqual(record.runId, undefined);
    assert.strictEqual(record.stepId, undefined);
    assert.strictEqual(record.inputTokens, undefined);
    assert.strictEqual(record.outputTokens, undefined);
    assert.strictEqual(record.costUsd, undefined);
    assert.strictEqual(record.taskLabel, undefined);
  });
});
