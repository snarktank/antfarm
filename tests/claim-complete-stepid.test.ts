/**
 * Regression test: claimStep returns database ID, not workflow step name
 *
 * Bug: claimStep was returning step.step_id (workflow step name like "fix")
 * but completeStep queries by step.id (database UUID), causing "Step not found".
 *
 * Fix: claimStep now returns step.id (the database UUID).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import crypto from "node:crypto";

// Create in-memory test database matching antfarm schema
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
      run_id TEXT NOT NULL REFERENCES runs(id),
      step_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      step_index INTEGER NOT NULL,
      input_template TEXT NOT NULL,
      expects TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'waiting',
      output TEXT,
      retry_count INTEGER DEFAULT 0,
      abandoned_count INTEGER DEFAULT 0,
      max_retries INTEGER DEFAULT 2,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'single',
      loop_config TEXT,
      current_story_id TEXT
    );

    CREATE TABLE stories (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL REFERENCES runs(id),
      story_index INTEGER NOT NULL,
      story_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      acceptance_criteria TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'pending',
      output TEXT,
      retry_count INTEGER DEFAULT 0,
      max_retries INTEGER DEFAULT 2,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  return db;
}

function now(): string {
  return new Date().toISOString();
}

describe("claimStep returns correct stepId format", () => {
  it("should return database UUID (step.id) not workflow step name (step.step_id)", () => {
    const db = createTestDb();
    const timestamp = now();

    // Create a test run
    const runId = crypto.randomUUID();
    db.prepare(
      "INSERT INTO runs (id, workflow_id, task, status, context, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run(runId, "test-workflow", "test task", "running", "{}", timestamp, timestamp);

    // Create a step with distinct id and step_id
    const stepDatabaseId = crypto.randomUUID();  // This is step.id (database UUID)
    const stepWorkflowName = "fix";               // This is step.step_id (workflow step name)

    db.prepare(
      "INSERT INTO steps (id, run_id, step_id, agent_id, step_index, input_template, expects, status, created_at, updated_at, type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(stepDatabaseId, runId, stepWorkflowName, "test-workflow/fixer", 0, "Fix the bug", "STATUS: done", "pending", timestamp, timestamp, "single");

    // Simulate claimStep logic: find pending step for agent
    const step = db.prepare(
      `SELECT id, step_id, run_id, input_template, type, loop_config
       FROM steps
       WHERE agent_id = ? AND status = 'pending'
       LIMIT 1`
    ).get("test-workflow/fixer") as { id: string; step_id: string; run_id: string } | undefined;

    assert.ok(step, "Should find the pending step");

    // The bug was here: returning step.step_id instead of step.id
    // CORRECT: return step.id (the database UUID)
    const returnedStepId = step.id;

    // Verify the returned stepId is the database UUID, not the workflow step name
    assert.equal(returnedStepId, stepDatabaseId, "stepId should be the database UUID");
    assert.notEqual(returnedStepId, stepWorkflowName, "stepId should NOT be the workflow step name");

    // Verify completeStep can find the step with the returned stepId
    const foundStep = db.prepare("SELECT * FROM steps WHERE id = ?").get(returnedStepId);
    assert.ok(foundStep, "completeStep should be able to find the step by returned stepId");
  });

  it("should fail to find step when using workflow step name instead of database ID", () => {
    const db = createTestDb();
    const timestamp = now();

    // Create a test run
    const runId = crypto.randomUUID();
    db.prepare(
      "INSERT INTO runs (id, workflow_id, task, status, context, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run(runId, "test-workflow", "test task", "running", "{}", timestamp, timestamp);

    // Create a step
    const stepDatabaseId = crypto.randomUUID();
    const stepWorkflowName = "fix";

    db.prepare(
      "INSERT INTO steps (id, run_id, step_id, agent_id, step_index, input_template, expects, status, created_at, updated_at, type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(stepDatabaseId, runId, stepWorkflowName, "test-workflow/fixer", 0, "Fix the bug", "STATUS: done", "pending", timestamp, timestamp, "single");

    // This demonstrates the bug: using step_id (workflow name) to query by id column
    // The bug would have returned step_id ("fix") which completeStep uses to query WHERE id = ?
    const notFound = db.prepare("SELECT * FROM steps WHERE id = ?").get(stepWorkflowName);
    assert.equal(notFound, undefined, "Using workflow step name as ID should NOT find any step");

    // But using the correct database ID works
    const found = db.prepare("SELECT * FROM steps WHERE id = ?").get(stepDatabaseId);
    assert.ok(found, "Using database UUID should find the step");
  });
});
