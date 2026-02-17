/**
 * installer/status.ts unit tests
 *
 * Tests getWorkflowStatus() and listRuns() with a mocked db module.
 * Covers exact task match, substring match, run ID prefix match,
 * not-found with recent runs list, not-found with no runs, and listRuns.
 */

import { describe, it, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";

// ── Mock state ──────────────────────────────────────────────────────

type PreparedResult = {
  getResults: Map<string, unknown>;
  allResults: Map<string, unknown[]>;
};

let preparedStatements: PreparedResult = {
  getResults: new Map(),
  allResults: new Map(),
};

// Track which SQL queries are called with which params
let queryCalls: Array<{ sql: string; params: unknown[] }> = [];

// ── Module mocks ────────────────────────────────────────────────────

mock.module("node:os", {
  defaultExport: {
    homedir: () => "/fake/home",
  },
});

mock.module("node:fs", {
  defaultExport: {
    mkdirSync: () => {},
    statSync: () => ({ size: 0 }),
    appendFileSync: () => {},
    readFileSync: () => "",
  },
});

mock.module("../dist/db.js", {
  namedExports: {
    getDb: () => ({
      prepare: (sql: string) => ({
        get: (...params: unknown[]) => {
          queryCalls.push({ sql, params });
          return preparedStatements.getResults.get(sql);
        },
        all: (...params: unknown[]) => {
          queryCalls.push({ sql, params });
          return preparedStatements.allResults.get(sql) ?? [];
        },
      }),
    }),
  },
});

// Import after mocks
const { getWorkflowStatus, listRuns } = await import(
  "../dist/installer/status.js"
);

// ── Helpers ─────────────────────────────────────────────────────────

function makeRun(overrides: Record<string, unknown> = {}) {
  return {
    id: "run-abc-123",
    workflow_id: "wf-1",
    task: "Deploy feature X",
    status: "running",
    context: "{}",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeStep(overrides: Record<string, unknown> = {}) {
  return {
    id: "step-001",
    run_id: "run-abc-123",
    step_id: "plan",
    agent_id: "agent-1",
    step_index: 0,
    input_template: "Do the thing",
    expects: "output",
    status: "completed",
    output: "Done",
    retry_count: 0,
    max_retries: 2,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

const SQL_EXACT = "SELECT * FROM runs WHERE LOWER(task) = LOWER(?) ORDER BY created_at DESC LIMIT 1";
const SQL_SUBSTR = "SELECT * FROM runs WHERE LOWER(task) LIKE '%' || LOWER(?) || '%' ORDER BY created_at DESC LIMIT 1";
const SQL_ID_PREFIX = "SELECT * FROM runs WHERE id LIKE ? || '%' ORDER BY created_at DESC LIMIT 1";
const SQL_ALL_RUNS = "SELECT id, task, status, created_at FROM runs ORDER BY created_at DESC LIMIT 20";
const SQL_STEPS = "SELECT * FROM steps WHERE run_id = ? ORDER BY step_index ASC";
const SQL_LIST_RUNS = "SELECT * FROM runs ORDER BY created_at DESC";

function resetMocks() {
  preparedStatements = {
    getResults: new Map(),
    allResults: new Map(),
  };
  queryCalls = [];
}

// ── Tests ────────────────────────────────────────────────────────────

describe("installer/status", () => {
  beforeEach(() => {
    resetMocks();
  });

  // ── getWorkflowStatus ─────────────────────────────────────────────

  describe("getWorkflowStatus", () => {
    it("finds run by exact task match and returns steps", () => {
      const run = makeRun();
      const steps = [makeStep(), makeStep({ id: "step-002", step_index: 1, status: "waiting" })];

      preparedStatements.getResults.set(SQL_EXACT, run);
      preparedStatements.allResults.set(SQL_STEPS, steps);

      const result = getWorkflowStatus("Deploy feature X");
      assert.equal(result.status, "ok");
      assert.deepEqual(result.run, run);
      assert.equal(result.steps.length, 2);
      assert.equal(result.steps[0].id, "step-001");
      assert.equal(result.steps[1].id, "step-002");
    });

    it("falls back to substring match when exact match fails", () => {
      const run = makeRun({ task: "Deploy feature X to production" });
      const steps = [makeStep()];

      // Exact match returns nothing
      preparedStatements.getResults.set(SQL_EXACT, undefined);
      // Substring match finds it
      preparedStatements.getResults.set(SQL_SUBSTR, run);
      preparedStatements.allResults.set(SQL_STEPS, steps);

      const result = getWorkflowStatus("feature X");
      assert.equal(result.status, "ok");
      assert.deepEqual(result.run, run);
    });

    it("falls back to run ID prefix match when task matches fail", () => {
      const run = makeRun({ id: "run-abc-123" });
      const steps = [makeStep()];

      preparedStatements.getResults.set(SQL_EXACT, undefined);
      preparedStatements.getResults.set(SQL_SUBSTR, undefined);
      preparedStatements.getResults.set(SQL_ID_PREFIX, run);
      preparedStatements.allResults.set(SQL_STEPS, steps);

      const result = getWorkflowStatus("run-abc");
      assert.equal(result.status, "ok");
      assert.deepEqual(result.run, run);
    });

    it("returns not_found with recent runs list when no match and runs exist", () => {
      preparedStatements.getResults.set(SQL_EXACT, undefined);
      preparedStatements.getResults.set(SQL_SUBSTR, undefined);
      preparedStatements.getResults.set(SQL_ID_PREFIX, undefined);
      preparedStatements.allResults.set(SQL_ALL_RUNS, [
        { id: "run-aaa-111111", task: "First task that is somewhat long", status: "completed", created_at: "2026-01-01" },
        { id: "run-bbb-222222", task: "Second task", status: "running", created_at: "2026-01-02" },
      ]);

      const result = getWorkflowStatus("nonexistent query");
      assert.equal(result.status, "not_found");
      assert.ok(result.message.includes('No run matching "nonexistent query"'));
      assert.ok(result.message.includes("Recent runs:"));
      assert.ok(result.message.includes("run-aaa-"));
      assert.ok(result.message.includes("run-bbb-"));
      assert.ok(result.message.includes("[completed]"));
      assert.ok(result.message.includes("[running]"));
    });

    it("returns not_found with 'No workflow runs found' when no runs exist", () => {
      preparedStatements.getResults.set(SQL_EXACT, undefined);
      preparedStatements.getResults.set(SQL_SUBSTR, undefined);
      preparedStatements.getResults.set(SQL_ID_PREFIX, undefined);
      preparedStatements.allResults.set(SQL_ALL_RUNS, []);

      const result = getWorkflowStatus("anything");
      assert.equal(result.status, "not_found");
      assert.equal(result.message, "No workflow runs found.");
    });

    it("returns ok with empty steps array when run has no steps", () => {
      const run = makeRun();
      preparedStatements.getResults.set(SQL_EXACT, run);
      preparedStatements.allResults.set(SQL_STEPS, []);

      const result = getWorkflowStatus("Deploy feature X");
      assert.equal(result.status, "ok");
      assert.deepEqual(result.run, run);
      assert.deepEqual(result.steps, []);
    });

    it("returns correct data for a completed run", () => {
      const run = makeRun({ status: "completed" });
      const steps = [
        makeStep({ status: "completed", output: "Step 1 done" }),
        makeStep({ id: "step-002", step_index: 1, status: "completed", output: "Step 2 done" }),
      ];

      preparedStatements.getResults.set(SQL_EXACT, run);
      preparedStatements.allResults.set(SQL_STEPS, steps);

      const result = getWorkflowStatus("Deploy feature X");
      assert.equal(result.status, "ok");
      assert.equal(result.run.status, "completed");
      assert.equal(result.steps.length, 2);
      assert.equal(result.steps[0].status, "completed");
      assert.equal(result.steps[1].status, "completed");
    });

    it("returns correct data for a failed run", () => {
      const run = makeRun({ status: "failed" });
      const steps = [
        makeStep({ status: "completed" }),
        makeStep({ id: "step-002", step_index: 1, status: "failed", output: "Error occurred" }),
      ];

      preparedStatements.getResults.set(SQL_EXACT, run);
      preparedStatements.allResults.set(SQL_STEPS, steps);

      const result = getWorkflowStatus("Deploy feature X");
      assert.equal(result.status, "ok");
      assert.equal(result.run.status, "failed");
      assert.equal(result.steps[1].status, "failed");
      assert.equal(result.steps[1].output, "Error occurred");
    });

    it("case-insensitive exact match works", () => {
      const run = makeRun({ task: "Deploy Feature X" });
      preparedStatements.getResults.set(SQL_EXACT, run);
      preparedStatements.allResults.set(SQL_STEPS, []);

      const result = getWorkflowStatus("deploy feature x");
      assert.equal(result.status, "ok");
      assert.deepEqual(result.run, run);
    });

    it("truncates long task names in not_found message", () => {
      const longTask = "A".repeat(100);
      preparedStatements.getResults.set(SQL_EXACT, undefined);
      preparedStatements.getResults.set(SQL_SUBSTR, undefined);
      preparedStatements.getResults.set(SQL_ID_PREFIX, undefined);
      preparedStatements.allResults.set(SQL_ALL_RUNS, [
        { id: "run-aaa-111111", task: longTask, status: "running", created_at: "2026-01-01" },
      ]);

      const result = getWorkflowStatus("no match");
      assert.equal(result.status, "not_found");
      // The task gets sliced to 60 chars in the message
      assert.ok(result.message.includes("A".repeat(60)));
      assert.ok(!result.message.includes("A".repeat(61)));
    });
  });

  // ── listRuns ──────────────────────────────────────────────────────

  describe("listRuns", () => {
    it("returns all runs from database", () => {
      const runs = [
        makeRun({ id: "run-1", task: "Task A" }),
        makeRun({ id: "run-2", task: "Task B" }),
        makeRun({ id: "run-3", task: "Task C" }),
      ];
      preparedStatements.allResults.set(SQL_LIST_RUNS, runs);

      const result = listRuns();
      assert.equal(result.length, 3);
      assert.equal(result[0].id, "run-1");
      assert.equal(result[1].id, "run-2");
      assert.equal(result[2].id, "run-3");
    });

    it("returns empty array when no runs exist", () => {
      preparedStatements.allResults.set(SQL_LIST_RUNS, []);

      const result = listRuns();
      assert.deepEqual(result, []);
    });

    it("returns runs with all fields populated", () => {
      const run = makeRun({
        id: "run-full",
        workflow_id: "wf-test",
        task: "Full test",
        status: "running",
        context: '{"key":"value"}',
        created_at: "2026-02-01T10:00:00Z",
        updated_at: "2026-02-01T11:00:00Z",
      });
      preparedStatements.allResults.set(SQL_LIST_RUNS, [run]);

      const result = listRuns();
      assert.equal(result.length, 1);
      assert.equal(result[0].workflow_id, "wf-test");
      assert.equal(result[0].context, '{"key":"value"}');
    });
  });
});
