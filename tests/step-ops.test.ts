/**
 * step-ops.ts unit tests
 *
 * Tests the step lifecycle state machine: claimStep(), completeStep(), failStep()
 * using an in-memory SQLite database with mocked dependencies.
 */

import { describe, it, beforeEach, mock } from "node:test";
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
      updated_at TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'single',
      loop_config TEXT,
      current_story_id TEXT,
      abandoned_count INTEGER DEFAULT 0
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

    CREATE TABLE concurrency_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      model TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      step_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'waiting',
      queued_at TEXT NOT NULL,
      acquired_at TEXT,
      released_at TEXT
    );

    CREATE TABLE workers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pid INTEGER NOT NULL,
      agent_id TEXT NOT NULL,
      step_id TEXT NOT NULL,
      model TEXT,
      unit_name TEXT,
      status TEXT NOT NULL DEFAULT 'running',
      spawned_at TEXT NOT NULL,
      completed_at TEXT
    );
  `);
  return db;
}

// ── Module mocks ────────────────────────────────────────────────────

mock.module("../dist/db.js", {
  namedExports: {
    getDb: () => testDb,
  },
});

mock.module("../dist/installer/agent-cron.js", {
  namedExports: {
    teardownWorkflowCronsIfIdle: async () => {},
  },
});

mock.module("../dist/installer/events.js", {
  namedExports: {
    emitEvent: () => {},
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

mock.module("../dist/installer/install.js", {
  namedExports: {
    getMaxRoleTimeoutSeconds: () => 600,
  },
});

mock.module("../dist/lib/frontend-detect.js", {
  namedExports: {
    isFrontendChange: () => false,
  },
});

mock.module("../dist/worker/concurrency.js", {
  namedExports: {
    ConcurrencyController: class {
      releaseSlotByStepId() {}
    },
  },
});

mock.module("../dist/worker/heartbeat.js", {
  namedExports: {
    stopHeartbeat: () => {},
  },
});

// Import after mocks are set up
const { claimStep, completeStep, failStep } = await import(
  "../dist/installer/step-ops.js"
);

// ── Helpers ─────────────────────────────────────────────────────────

function now(): string {
  return new Date().toISOString();
}

let idCounter = 0;
function uid(): string {
  idCounter++;
  return `test-${idCounter}-${Date.now()}`;
}

function insertRun(
  id: string,
  opts: { status?: string; context?: Record<string, string> } = {}
): void {
  const t = now();
  testDb
    .prepare(
      "INSERT INTO runs (id, workflow_id, task, status, context, created_at, updated_at) VALUES (?, 'wf', 'task', ?, ?, ?, ?)"
    )
    .run(id, opts.status ?? "running", JSON.stringify(opts.context ?? {}), t, t);
}

function insertStep(
  id: string,
  runId: string,
  opts: {
    agentId?: string;
    status?: string;
    stepId?: string;
    stepIndex?: number;
    inputTemplate?: string;
    retryCount?: number;
    maxRetries?: number;
    type?: string;
    loopConfig?: string | null;
    currentStoryId?: string | null;
  } = {}
): void {
  const t = now();
  testDb
    .prepare(
      `INSERT INTO steps (id, run_id, step_id, agent_id, step_index, input_template, expects, status, retry_count, max_retries, type, loop_config, current_story_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, '', ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      runId,
      opts.stepId ?? "step-1",
      opts.agentId ?? "agent-1",
      opts.stepIndex ?? 0,
      opts.inputTemplate ?? "do work",
      opts.status ?? "pending",
      opts.retryCount ?? 0,
      opts.maxRetries ?? 2,
      opts.type ?? "single",
      opts.loopConfig ?? null,
      opts.currentStoryId ?? null,
      t,
      t
    );
}

function insertStory(
  id: string,
  runId: string,
  opts: {
    storyIndex?: number;
    storyId?: string;
    status?: string;
    retryCount?: number;
    maxRetries?: number;
  } = {}
): void {
  const t = now();
  testDb
    .prepare(
      `INSERT INTO stories (id, run_id, story_index, story_id, title, description, acceptance_criteria, status, retry_count, max_retries, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'Test Story', 'A story', '["AC1"]', ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      runId,
      opts.storyIndex ?? 0,
      opts.storyId ?? "s1",
      opts.status ?? "pending",
      opts.retryCount ?? 0,
      opts.maxRetries ?? 2,
      t,
      t
    );
}

function getStep(id: string): any {
  return testDb.prepare("SELECT * FROM steps WHERE id = ?").get(id);
}

function getRun(id: string): any {
  return testDb.prepare("SELECT * FROM runs WHERE id = ?").get(id);
}

function getStory(id: string): any {
  return testDb.prepare("SELECT * FROM stories WHERE id = ?").get(id);
}

// ── Tests ───────────────────────────────────────────────────────────

describe("claimStep", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("transitions step from 'pending' to 'running' and returns step data", () => {
    const runId = uid();
    const stepId = uid();
    insertRun(runId);
    insertStep(stepId, runId, { agentId: "agent-1", status: "pending" });

    const result = claimStep("agent-1");

    assert.equal(result.found, true, "should find a step to claim");
    assert.equal(result.stepId, stepId, "should return the correct step ID");
    assert.equal(result.runId, runId, "should return the correct run ID");
    assert.ok(result.resolvedInput, "should return resolved input");

    const step = getStep(stepId);
    assert.equal(step.status, "running", "step should be 'running' after claim");
  });

  it("returns { found: false } when no pending steps exist", () => {
    const result = claimStep("agent-with-no-work");

    assert.equal(result.found, false, "should not find any step");
    assert.equal(result.stepId, undefined, "stepId should be undefined");
    assert.equal(result.runId, undefined, "runId should be undefined");
  });

  it("returns { found: false } when pending steps exist but run is failed", () => {
    const runId = uid();
    const stepId = uid();
    insertRun(runId, { status: "failed" });
    insertStep(stepId, runId, { agentId: "agent-1", status: "pending" });

    const result = claimStep("agent-1");

    assert.equal(result.found, false, "should not claim step for a failed run");
  });

  it("resolves template placeholders in input", () => {
    const runId = uid();
    const stepId = uid();
    insertRun(runId, { context: { repo: "/my/repo", branch: "main" } });
    insertStep(stepId, runId, {
      agentId: "agent-1",
      status: "pending",
      inputTemplate: "Work on {{repo}} branch {{branch}}",
    });

    const result = claimStep("agent-1");

    assert.equal(result.found, true);
    assert.ok(
      result.resolvedInput!.includes("/my/repo"),
      "should resolve repo placeholder"
    );
    assert.ok(
      result.resolvedInput!.includes("main"),
      "should resolve branch placeholder"
    );
  });
});

describe("completeStep", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("sets status='done' and stores output for a single step", () => {
    const runId = uid();
    const stepId = uid();
    insertRun(runId);
    insertStep(stepId, runId, { status: "running" });

    const result = completeStep(stepId, "STATUS: done\nCHANGES: fixed bug");

    const step = getStep(stepId);
    assert.equal(step.status, "done", "step should be marked done");
    assert.equal(step.output, "STATUS: done\nCHANGES: fixed bug", "output should be stored");
  });

  it("merges KEY: value output into run context", () => {
    const runId = uid();
    const stepId = uid();
    insertRun(runId, { context: { existing: "value" } });
    insertStep(stepId, runId, { status: "running" });

    completeStep(stepId, "STATUS: done\nCHANGES: updated file");

    const run = getRun(runId);
    const context = JSON.parse(run.context);
    assert.equal(context.status, "done", "should merge STATUS into context");
    assert.equal(context.changes, "updated file", "should merge CHANGES into context");
    assert.equal(context.existing, "value", "should preserve existing context");
  });

  it("returns { advanced: false, runCompleted: false } for a failed run", () => {
    const runId = uid();
    const stepId = uid();
    insertRun(runId, { status: "failed" });
    insertStep(stepId, runId, { status: "running" });

    const result = completeStep(stepId, "STATUS: done");

    assert.equal(result.advanced, false);
    assert.equal(result.runCompleted, false);
  });

  it("advances pipeline when next waiting step exists", () => {
    const runId = uid();
    const stepId1 = uid();
    const stepId2 = uid();
    insertRun(runId);
    insertStep(stepId1, runId, { status: "running", stepIndex: 0 });
    insertStep(stepId2, runId, { status: "waiting", stepIndex: 1, stepId: "step-2" });

    const result = completeStep(stepId1, "STATUS: done");

    assert.equal(result.advanced, true, "should advance pipeline");
    const step2 = getStep(stepId2);
    assert.equal(step2.status, "pending", "next step should become pending");
  });

  it("completes run when no more steps remain", () => {
    const runId = uid();
    const stepId = uid();
    insertRun(runId);
    insertStep(stepId, runId, { status: "running", stepIndex: 0 });

    const result = completeStep(stepId, "STATUS: done");

    assert.equal(result.runCompleted, true, "run should be completed");
    const run = getRun(runId);
    assert.equal(run.status, "completed", "run status should be 'completed'");
  });

  it("throws when step ID does not exist", () => {
    assert.throws(
      () => completeStep("nonexistent-id", "output"),
      /Step not found/,
      "should throw for unknown step ID"
    );
  });
});

describe("failStep", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("increments retry_count and sets status='pending' when retries remain", () => {
    const runId = uid();
    const stepId = uid();
    insertRun(runId);
    insertStep(stepId, runId, {
      status: "running",
      retryCount: 0,
      maxRetries: 2,
    });

    const result = failStep(stepId, "something broke");

    assert.equal(result.retrying, true, "should be retrying");
    assert.equal(result.runFailed, false, "run should not fail yet");

    const step = getStep(stepId);
    assert.equal(step.status, "pending", "step should be reset to pending for retry");
    assert.equal(step.retry_count, 1, "retry_count should be incremented");
  });

  it("sets status='failed' when retry_count >= max_retries", () => {
    const runId = uid();
    const stepId = uid();
    insertRun(runId);
    insertStep(stepId, runId, {
      status: "running",
      retryCount: 2,
      maxRetries: 2,
    });

    const result = failStep(stepId, "final failure");

    assert.equal(result.retrying, false, "should not be retrying");
    assert.equal(result.runFailed, true, "run should fail");

    const step = getStep(stepId);
    assert.equal(step.status, "failed", "step should be failed");
    assert.equal(step.output, "final failure", "error should be stored as output");
    assert.equal(step.retry_count, 3, "retry_count should be incremented past max");

    const run = getRun(runId);
    assert.equal(run.status, "failed", "run should be marked failed");
  });

  it("applies per-story retry for loop steps with current_story_id", () => {
    const runId = uid();
    const stepId = uid();
    const storyId = uid();
    insertRun(runId);
    insertStep(stepId, runId, {
      status: "running",
      type: "loop",
      currentStoryId: storyId,
      loopConfig: JSON.stringify({ over: "stories", completion: "all_done" }),
    });
    insertStory(storyId, runId, { retryCount: 0, maxRetries: 2 });

    const result = failStep(stepId, "story error");

    assert.equal(result.retrying, true, "should retry the story");
    assert.equal(result.runFailed, false, "run should not fail");

    const story = getStory(storyId);
    assert.equal(story.status, "pending", "story should be reset to pending");
    assert.equal(story.retry_count, 1, "story retry_count should increment");

    const step = getStep(stepId);
    assert.equal(step.status, "pending", "loop step should be reset to pending");
    assert.equal(step.current_story_id, null, "current_story_id should be cleared");
  });

  it("fails story and run when story retries exhausted", () => {
    const runId = uid();
    const stepId = uid();
    const storyId = uid();
    insertRun(runId);
    insertStep(stepId, runId, {
      status: "running",
      type: "loop",
      currentStoryId: storyId,
      loopConfig: JSON.stringify({ over: "stories", completion: "all_done" }),
    });
    insertStory(storyId, runId, { retryCount: 2, maxRetries: 2 });

    const result = failStep(stepId, "story exhausted");

    assert.equal(result.retrying, false, "should not retry");
    assert.equal(result.runFailed, true, "run should fail");

    const story = getStory(storyId);
    assert.equal(story.status, "failed", "story should be failed");
    assert.equal(story.retry_count, 3, "story retry_count should be incremented past max");

    const step = getStep(stepId);
    assert.equal(step.status, "failed", "step should be failed");

    const run = getRun(runId);
    assert.equal(run.status, "failed", "run should be failed");
  });

  it("throws when step ID does not exist", () => {
    assert.throws(
      () => failStep("nonexistent-id", "error"),
      /Step not found/,
      "should throw for unknown step ID"
    );
  });
});
