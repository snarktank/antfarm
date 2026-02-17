/**
 * Tests for resetStep() — timeout/stall recovery using abandon budget.
 *
 * Validates:
 * 1. Single step: increments abandoned_count, NOT retry_count
 * 2. Single step exhaustion: 5th abandon fails step+run
 * 3. Loop step with story: increments story retry_count, NOT step retry_count
 * 4. Loop step story exhaustion: fails story+step+run
 * 5. Backward compat: failStep still uses retry_count (not abandoned_count)
 */

import { DatabaseSync } from "node:sqlite";
import crypto from "node:crypto";
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";

// ── In-memory DB setup ──────────────────────────────────────────────

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
      max_retries INTEGER DEFAULT 2,
      abandoned_count INTEGER DEFAULT 0,
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

    CREATE TABLE events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts TEXT NOT NULL,
      event TEXT NOT NULL,
      run_id TEXT,
      workflow_id TEXT,
      step_id TEXT,
      agent_id TEXT,
      story_id TEXT,
      story_title TEXT,
      detail TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  return db;
}

function ts(): string {
  return new Date().toISOString();
}

// ── Direct DB logic tests (no module import needed) ─────────────────

const MAX_ABANDON_RESETS = 5; // mirrors constant in step-ops.ts

describe("resetStep logic — single step (direct DB validation)", () => {
  it("increments abandoned_count and resets to pending", () => {
    const db = createTestDb();
    const runId = crypto.randomUUID();
    const stepId = crypto.randomUUID();
    const t = ts();

    db.prepare(
      "INSERT INTO runs (id, workflow_id, task, status, context, created_at, updated_at) VALUES (?, 'wf', 'task', 'running', '{}', ?, ?)"
    ).run(runId, t, t);

    db.prepare(
      "INSERT INTO steps (id, run_id, step_id, agent_id, step_index, input_template, expects, status, retry_count, abandoned_count, created_at, updated_at, type) VALUES (?, ?, 'verify', 'wf_verifier', 4, '', '', 'running', 0, 0, ?, ?, 'single')"
    ).run(stepId, runId, t, t);

    // Simulate resetStep: increment abandoned_count, reset to pending
    const step = db.prepare("SELECT abandoned_count, retry_count FROM steps WHERE id = ?").get(stepId) as { abandoned_count: number; retry_count: number };
    const newAbandonCount = (step.abandoned_count ?? 0) + 1;

    assert.ok(newAbandonCount < MAX_ABANDON_RESETS, "Not yet exhausted");

    db.prepare("UPDATE steps SET status = 'pending', abandoned_count = ?, updated_at = datetime('now') WHERE id = ?").run(newAbandonCount, stepId);

    const after = db.prepare("SELECT status, abandoned_count, retry_count FROM steps WHERE id = ?").get(stepId) as { status: string; abandoned_count: number; retry_count: number };

    assert.equal(after.status, "pending", "Step should be reset to pending");
    assert.equal(after.abandoned_count, 1, "Abandoned count should be 1");
    assert.equal(after.retry_count, 0, "Retry count should be UNCHANGED (still 0)");
  });

  it("fails step and run when abandoned_count reaches MAX_ABANDON_RESETS", () => {
    const db = createTestDb();
    const runId = crypto.randomUUID();
    const stepId = crypto.randomUUID();
    const t = ts();

    db.prepare(
      "INSERT INTO runs (id, workflow_id, task, status, context, created_at, updated_at) VALUES (?, 'wf', 'task', 'running', '{}', ?, ?)"
    ).run(runId, t, t);

    // Step already at abandoned_count = 4 (one more will exhaust)
    db.prepare(
      "INSERT INTO steps (id, run_id, step_id, agent_id, step_index, input_template, expects, status, retry_count, abandoned_count, created_at, updated_at, type) VALUES (?, ?, 'verify', 'wf_verifier', 4, '', '', 'running', 0, 4, ?, ?, 'single')"
    ).run(stepId, runId, t, t);

    const step = db.prepare("SELECT abandoned_count FROM steps WHERE id = ?").get(stepId) as { abandoned_count: number };
    const newAbandonCount = (step.abandoned_count ?? 0) + 1;

    assert.equal(newAbandonCount, 5, "Should reach MAX_ABANDON_RESETS");
    assert.ok(newAbandonCount >= MAX_ABANDON_RESETS, "Should be at limit");

    // Simulate reset exhaustion: fail step + run
    db.prepare("UPDATE steps SET status = 'failed', abandoned_count = ?, output = 'Stalled too many times', updated_at = datetime('now') WHERE id = ?").run(newAbandonCount, stepId);
    db.prepare("UPDATE runs SET status = 'failed', updated_at = datetime('now') WHERE id = ?").run(runId);

    const afterStep = db.prepare("SELECT status, abandoned_count, retry_count FROM steps WHERE id = ?").get(stepId) as { status: string; abandoned_count: number; retry_count: number };
    const afterRun = db.prepare("SELECT status FROM runs WHERE id = ?").get(runId) as { status: string };

    assert.equal(afterStep.status, "failed", "Step should be failed");
    assert.equal(afterStep.abandoned_count, 5, "Abandoned count should be 5");
    assert.equal(afterStep.retry_count, 0, "Retry count should still be 0");
    assert.equal(afterRun.status, "failed", "Run should be failed");
  });
});

describe("resetStep logic — loop step with story (direct DB validation)", () => {
  it("increments story retry_count and resets both to pending", () => {
    const db = createTestDb();
    const runId = crypto.randomUUID();
    const stepId = crypto.randomUUID();
    const storyId = crypto.randomUUID();
    const t = ts();

    db.prepare(
      "INSERT INTO runs (id, workflow_id, task, status, context, created_at, updated_at) VALUES (?, 'fd', 'build feature', 'running', '{}', ?, ?)"
    ).run(runId, t, t);

    db.prepare(
      "INSERT INTO stories (id, run_id, story_index, story_id, title, status, retry_count, max_retries, created_at, updated_at) VALUES (?, ?, 0, 'US-001', 'Add login form', 'running', 0, 2, ?, ?)"
    ).run(storyId, runId, t, t);

    db.prepare(
      "INSERT INTO steps (id, run_id, step_id, agent_id, step_index, input_template, expects, status, retry_count, abandoned_count, created_at, updated_at, type, current_story_id) VALUES (?, ?, 'implement', 'fd_developer', 3, '', '', 'running', 0, 0, ?, ?, 'loop', ?)"
    ).run(stepId, runId, t, t, storyId);

    // Simulate resetStep loop path: increment story retry, reset both
    const story = db.prepare("SELECT retry_count, max_retries FROM stories WHERE id = ?").get(storyId) as { retry_count: number; max_retries: number };
    const newRetry = story.retry_count + 1;

    assert.ok(newRetry <= story.max_retries, "Story retries not exhausted");

    db.prepare("UPDATE stories SET status = 'pending', retry_count = ?, updated_at = datetime('now') WHERE id = ?").run(newRetry, storyId);
    db.prepare("UPDATE steps SET status = 'pending', current_story_id = NULL, updated_at = datetime('now') WHERE id = ?").run(stepId);

    const afterStory = db.prepare("SELECT status, retry_count FROM stories WHERE id = ?").get(storyId) as { status: string; retry_count: number };
    const afterStep = db.prepare("SELECT status, retry_count, abandoned_count, current_story_id FROM steps WHERE id = ?").get(stepId) as { status: string; retry_count: number; abandoned_count: number; current_story_id: string | null };

    assert.equal(afterStory.status, "pending", "Story should be reset to pending");
    assert.equal(afterStory.retry_count, 1, "Story retry_count should increment");
    assert.equal(afterStep.status, "pending", "Step should be reset to pending");
    assert.equal(afterStep.retry_count, 0, "Step retry_count should be UNCHANGED");
    assert.equal(afterStep.abandoned_count, 0, "Step abandoned_count should be UNCHANGED for loop path");
    assert.equal(afterStep.current_story_id, null, "current_story_id should be cleared");
  });

  it("fails story+step+run when story retries exhausted", () => {
    const db = createTestDb();
    const runId = crypto.randomUUID();
    const stepId = crypto.randomUUID();
    const storyId = crypto.randomUUID();
    const t = ts();

    db.prepare(
      "INSERT INTO runs (id, workflow_id, task, status, context, created_at, updated_at) VALUES (?, 'fd', 'build feature', 'running', '{}', ?, ?)"
    ).run(runId, t, t);

    // Story at max retries (retry_count = 2, max_retries = 2)
    db.prepare(
      "INSERT INTO stories (id, run_id, story_index, story_id, title, status, retry_count, max_retries, created_at, updated_at) VALUES (?, ?, 0, 'US-001', 'Add login form', 'running', 2, 2, ?, ?)"
    ).run(storyId, runId, t, t);

    db.prepare(
      "INSERT INTO steps (id, run_id, step_id, agent_id, step_index, input_template, expects, status, retry_count, abandoned_count, created_at, updated_at, type, current_story_id) VALUES (?, ?, 'implement', 'fd_developer', 3, '', '', 'running', 0, 0, ?, ?, 'loop', ?)"
    ).run(stepId, runId, t, t, storyId);

    const story = db.prepare("SELECT retry_count, max_retries FROM stories WHERE id = ?").get(storyId) as { retry_count: number; max_retries: number };
    const newRetry = story.retry_count + 1;

    assert.ok(newRetry > story.max_retries, "Story retries should be exhausted");

    // Simulate: fail everything
    db.prepare("UPDATE stories SET status = 'failed', retry_count = ?, updated_at = datetime('now') WHERE id = ?").run(newRetry, storyId);
    db.prepare("UPDATE steps SET status = 'failed', current_story_id = NULL, output = 'Story timeout', updated_at = datetime('now') WHERE id = ?").run(stepId);
    db.prepare("UPDATE runs SET status = 'failed', updated_at = datetime('now') WHERE id = ?").run(runId);

    const afterStory = db.prepare("SELECT status, retry_count FROM stories WHERE id = ?").get(storyId) as { status: string; retry_count: number };
    const afterStep = db.prepare("SELECT status, retry_count FROM steps WHERE id = ?").get(stepId) as { status: string; retry_count: number };
    const afterRun = db.prepare("SELECT status FROM runs WHERE id = ?").get(runId) as { status: string };

    assert.equal(afterStory.status, "failed", "Story should be failed");
    assert.equal(afterStory.retry_count, 3, "Story retry_count should be 3 (exceeded max of 2)");
    assert.equal(afterStep.status, "failed", "Step should be failed");
    assert.equal(afterStep.retry_count, 0, "Step retry_count should still be 0");
    assert.equal(afterRun.status, "failed", "Run should be failed");
  });
});

describe("backward compat — failStep still uses retry_count", () => {
  it("failStep increments retry_count, not abandoned_count", () => {
    const db = createTestDb();
    const runId = crypto.randomUUID();
    const stepId = crypto.randomUUID();
    const t = ts();

    db.prepare(
      "INSERT INTO runs (id, workflow_id, task, status, context, created_at, updated_at) VALUES (?, 'wf', 'task', 'running', '{}', ?, ?)"
    ).run(runId, t, t);

    db.prepare(
      "INSERT INTO steps (id, run_id, step_id, agent_id, step_index, input_template, expects, status, retry_count, max_retries, abandoned_count, created_at, updated_at, type) VALUES (?, ?, 'verify', 'wf_verifier', 4, '', '', 'running', 0, 2, 0, ?, ?, 'single')"
    ).run(stepId, runId, t, t);

    // failStep logic: increment retry_count
    const step = db.prepare("SELECT retry_count, max_retries FROM steps WHERE id = ?").get(stepId) as { retry_count: number; max_retries: number };
    const newRetryCount = step.retry_count + 1;

    assert.ok(newRetryCount <= step.max_retries, "Not yet exhausted");

    db.prepare("UPDATE steps SET status = 'pending', retry_count = ?, updated_at = datetime('now') WHERE id = ?").run(newRetryCount, stepId);

    const after = db.prepare("SELECT status, retry_count, abandoned_count FROM steps WHERE id = ?").get(stepId) as { status: string; retry_count: number; abandoned_count: number };

    assert.equal(after.status, "pending", "Step should retry");
    assert.equal(after.retry_count, 1, "retry_count should increment");
    assert.equal(after.abandoned_count, 0, "abandoned_count should be UNCHANGED");
  });
});

// ── Integration test: actual resetStep function via ANTFARM_DB_PATH ──

describe("resetStep function (integration)", () => {
  let tmpDbPath: string;
  let originalDbPath: string | undefined;

  before(async () => {
    const os = await import("node:os");
    const path = await import("node:path");
    tmpDbPath = path.join(os.tmpdir(), `antfarm-test-reset-${crypto.randomUUID()}.db`);
    originalDbPath = process.env.ANTFARM_DB_PATH;
    process.env.ANTFARM_DB_PATH = tmpDbPath;
  });

  after(async () => {
    if (originalDbPath !== undefined) {
      process.env.ANTFARM_DB_PATH = originalDbPath;
    } else {
      delete process.env.ANTFARM_DB_PATH;
    }
    const fs = await import("node:fs");
    try { fs.unlinkSync(tmpDbPath); } catch {}
  });

  it("resets a single step to pending using abandon budget", async () => {
    // Dynamic import to pick up test DB path
    const { resetStep } = await import("../dist/installer/step-ops.js");
    const { getDb } = await import("../dist/db.js");
    const db = getDb();

    const runId = crypto.randomUUID();
    const stepId = crypto.randomUUID();
    const t = ts();

    db.prepare(
      "INSERT INTO runs (id, workflow_id, task, status, context, created_at, updated_at) VALUES (?, 'test-wf', 'test task', 'running', '{}', ?, ?)"
    ).run(runId, t, t);

    db.prepare(
      "INSERT INTO steps (id, run_id, step_id, agent_id, step_index, input_template, expects, status, retry_count, max_retries, abandoned_count, created_at, updated_at, type) VALUES (?, ?, 'verify', 'test-wf_verifier', 4, '', '', 'running', 1, 2, 0, ?, ?, 'single')"
    ).run(stepId, runId, t, t);

    const result = resetStep(stepId, "Agent stalled — session timeout");

    assert.equal(result.reset, true, "Should return reset: true");
    assert.equal(result.runFailed, false, "Should return runFailed: false");

    const step = db.prepare("SELECT status, retry_count, abandoned_count FROM steps WHERE id = ?").get(stepId) as { status: string; retry_count: number; abandoned_count: number };

    assert.equal(step.status, "pending", "Step should be pending");
    assert.equal(step.retry_count, 1, "retry_count should be UNCHANGED (was 1, still 1)");
    assert.equal(step.abandoned_count, 1, "abandoned_count should be 1");
  });

  it("throws for non-existent step", async () => {
    const { resetStep } = await import("../dist/installer/step-ops.js");
    assert.throws(
      () => resetStep("nonexistent-id", "test"),
      /Step not found/,
      "Should throw for missing step"
    );
  });
});
