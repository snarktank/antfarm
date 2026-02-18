/**
 * installer/run.ts unit tests
 *
 * Tests runWorkflow() — creates a run record and step records in SQLite.
 * Uses an in-memory database with mocked dependencies for isolation.
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

    CREATE TABLE event_loop_metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      lag_ms REAL NOT NULL,
      p50 REAL NOT NULL,
      p95 REAL NOT NULL,
      p99 REAL NOT NULL,
      max_lag REAL NOT NULL
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

// Provide a controllable mock for loadWorkflowSpec
let mockWorkflowSpec: any = null;

mock.module("../dist/installer/workflow-spec.js", {
  namedExports: {
    loadWorkflowSpec: async () => mockWorkflowSpec,
  },
});

mock.module("../dist/installer/paths.js", {
  namedExports: {
    resolveWorkflowDir: (id: string) => `/tmp/fake-workflows/${id}`,
  },
});

mock.module("../dist/installer/agent-cron.js", {
  namedExports: {
    ensureWorkflowCrons: async () => {},
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

// Import after mocks are set up
const { runWorkflow } = await import("../dist/installer/run.js");

// ── Helpers ─────────────────────────────────────────────────────────

function makeWorkflowSpec(overrides: Partial<{
  id: string;
  steps: any[];
  context: Record<string, string>;
  notifications: { url?: string };
}> = {}) {
  return {
    id: overrides.id ?? "test-workflow",
    name: "Test Workflow",
    agents: [{ id: "agent-a", workspace: { baseDir: "/tmp", files: { "f": "c" } } }],
    steps: overrides.steps ?? [
      { id: "step-1", agent: "agent-a", input: "do stuff", expects: "STATUS: done" },
    ],
    context: overrides.context,
    notifications: overrides.notifications,
  };
}

function getAllRuns(): any[] {
  return testDb.prepare("SELECT * FROM runs").all() as any[];
}

function getAllSteps(): any[] {
  return testDb.prepare("SELECT * FROM steps ORDER BY step_index ASC").all() as any[];
}

// ── Tests ───────────────────────────────────────────────────────────

describe("runWorkflow", () => {
  beforeEach(() => {
    testDb = createTestDb();
    mockWorkflowSpec = null;
  });

  it("inserts a run row with correct workflow_id, task, and status='running'", async () => {
    mockWorkflowSpec = makeWorkflowSpec({ id: "my-wf" });

    const result = await runWorkflow({
      workflowId: "my-wf",
      taskTitle: "Build feature X",
    });

    assert.equal(result.workflowId, "my-wf");
    assert.equal(result.task, "Build feature X");
    assert.equal(result.status, "running");

    const runs = getAllRuns();
    assert.equal(runs.length, 1);
    assert.equal(runs[0].workflow_id, "my-wf");
    assert.equal(runs[0].task, "Build feature X");
    assert.equal(runs[0].status, "running");
    assert.equal(runs[0].id, result.id);
  });

  it("first step gets status='pending', subsequent steps get status='waiting'", async () => {
    mockWorkflowSpec = makeWorkflowSpec({
      steps: [
        { id: "s1", agent: "agent-a", input: "first", expects: "done" },
        { id: "s2", agent: "agent-a", input: "second", expects: "done" },
        { id: "s3", agent: "agent-a", input: "third", expects: "done" },
      ],
    });

    await runWorkflow({ workflowId: "wf", taskTitle: "multi-step" });

    const steps = getAllSteps();
    assert.equal(steps.length, 3);
    assert.equal(steps[0].status, "pending", "first step should be pending");
    assert.equal(steps[1].status, "waiting", "second step should be waiting");
    assert.equal(steps[2].status, "waiting", "third step should be waiting");
  });

  it("steps are inserted with correct step_index order", async () => {
    mockWorkflowSpec = makeWorkflowSpec({
      steps: [
        { id: "alpha", agent: "agent-a", input: "a", expects: "done" },
        { id: "beta", agent: "agent-a", input: "b", expects: "done" },
      ],
    });

    await runWorkflow({ workflowId: "wf", taskTitle: "ordered" });

    const steps = getAllSteps();
    assert.equal(steps[0].step_index, 0);
    assert.equal(steps[0].step_id, "alpha");
    assert.equal(steps[1].step_index, 1);
    assert.equal(steps[1].step_id, "beta");
  });

  it("sets agent_id as workflow_id-agent on each step", async () => {
    mockWorkflowSpec = makeWorkflowSpec({
      id: "proj",
      steps: [
        { id: "s1", agent: "dev", input: "code", expects: "done" },
      ],
    });

    await runWorkflow({ workflowId: "proj", taskTitle: "agent check" });

    const steps = getAllSteps();
    assert.equal(steps[0].agent_id, "proj-dev");
  });

  it("notifyUrl param is stored on run record when provided", async () => {
    mockWorkflowSpec = makeWorkflowSpec();

    await runWorkflow({
      workflowId: "wf",
      taskTitle: "with notify",
      notifyUrl: "https://example.com/webhook",
    });

    const runs = getAllRuns();
    assert.equal(runs[0].notify_url, "https://example.com/webhook");
  });

  it("workflow notify_url is used when notifyUrl param is not provided", async () => {
    mockWorkflowSpec = makeWorkflowSpec({
      notifications: { url: "https://workflow.example.com/hook" },
    });

    await runWorkflow({ workflowId: "wf", taskTitle: "workflow notify" });

    const runs = getAllRuns();
    assert.equal(runs[0].notify_url, "https://workflow.example.com/hook");
  });

  it("notifyUrl param overrides workflow notifications.url", async () => {
    mockWorkflowSpec = makeWorkflowSpec({
      notifications: { url: "https://workflow.example.com/hook" },
    });

    await runWorkflow({
      workflowId: "wf",
      taskTitle: "override notify",
      notifyUrl: "https://override.example.com/hook",
    });

    const runs = getAllRuns();
    assert.equal(runs[0].notify_url, "https://override.example.com/hook");
  });

  it("notify_url is null when neither param nor workflow provides one", async () => {
    mockWorkflowSpec = makeWorkflowSpec();

    await runWorkflow({ workflowId: "wf", taskTitle: "no notify" });

    const runs = getAllRuns();
    assert.equal(runs[0].notify_url, null);
  });

  it("steps with loop config have loop_config column set as JSON string", async () => {
    mockWorkflowSpec = makeWorkflowSpec({
      steps: [
        {
          id: "loop-step",
          agent: "agent-a",
          input: "loop work",
          expects: "done",
          type: "loop",
          loop: { over: "stories", completion: "all_done", freshSession: true },
        },
        { id: "normal", agent: "agent-a", input: "normal work", expects: "done" },
      ],
    });

    await runWorkflow({ workflowId: "wf", taskTitle: "loop test" });

    const steps = getAllSteps();
    assert.equal(steps[0].step_id, "loop-step");
    assert.equal(steps[0].type, "loop");
    const loopConfig = JSON.parse(steps[0].loop_config);
    assert.equal(loopConfig.over, "stories");
    assert.equal(loopConfig.completion, "all_done");
    assert.equal(loopConfig.freshSession, true);

    assert.equal(steps[1].step_id, "normal");
    assert.equal(steps[1].type, "single");
    assert.equal(steps[1].loop_config, null);
  });

  it("stores workflow context merged with task in the run context", async () => {
    mockWorkflowSpec = makeWorkflowSpec({
      context: { repo: "/my/repo", branch: "main" },
    });

    await runWorkflow({ workflowId: "wf", taskTitle: "context test" });

    const runs = getAllRuns();
    const ctx = JSON.parse(runs[0].context);
    assert.equal(ctx.task, "context test");
    assert.equal(ctx.repo, "/my/repo");
    assert.equal(ctx.branch, "main");
  });

  it("uses default max_retries of 2 when step has no retry config", async () => {
    mockWorkflowSpec = makeWorkflowSpec({
      steps: [
        { id: "s1", agent: "agent-a", input: "work", expects: "done" },
      ],
    });

    await runWorkflow({ workflowId: "wf", taskTitle: "retries" });

    const steps = getAllSteps();
    assert.equal(steps[0].max_retries, 2);
  });

  it("respects max_retries from step config", async () => {
    mockWorkflowSpec = makeWorkflowSpec({
      steps: [
        { id: "s1", agent: "agent-a", input: "work", expects: "done", max_retries: 5 },
      ],
    });

    await runWorkflow({ workflowId: "wf", taskTitle: "custom retries" });

    const steps = getAllSteps();
    assert.equal(steps[0].max_retries, 5);
  });

  it("respects max_retries from on_fail config", async () => {
    mockWorkflowSpec = makeWorkflowSpec({
      steps: [
        { id: "s1", agent: "agent-a", input: "work", expects: "done", on_fail: { max_retries: 4 } },
      ],
    });

    await runWorkflow({ workflowId: "wf", taskTitle: "on_fail retries" });

    const steps = getAllSteps();
    assert.equal(steps[0].max_retries, 4);
  });

  it("rolls back transaction on insert failure", async () => {
    // Use a DB that will fail on step insert by making the steps table invalid
    const brokenDb = new DatabaseSync(":memory:");
    brokenDb.exec(`
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
    `);
    // No steps table — inserts will fail

    // Temporarily swap testDb
    const originalDb = testDb;
    testDb = brokenDb;

    mockWorkflowSpec = makeWorkflowSpec();

    await assert.rejects(
      () => runWorkflow({ workflowId: "wf", taskTitle: "should fail" }),
      (err: any) => err instanceof Error,
      "should throw on insert failure"
    );

    // Run should NOT be persisted due to rollback
    const runs = brokenDb.prepare("SELECT * FROM runs").all();
    assert.equal(runs.length, 0, "run should be rolled back");

    // Restore testDb
    testDb = originalDb;
  });
});
