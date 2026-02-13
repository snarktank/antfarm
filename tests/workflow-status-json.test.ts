import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { getDb } from "../dist/db.js";
import { getWorkflowStatusJson } from "../dist/installer/status.js";

const TEST_RUN_ID = "__test_run_status_json_" + Date.now();
const TEST_STEP_1_ID = "__test_step_1_" + Date.now();
const TEST_STEP_2_ID = "__test_step_2_" + Date.now();

describe("getWorkflowStatusJson integration", () => {
  before(() => {
    const db = getDb();
    const now = new Date().toISOString();

    db.prepare(
      `INSERT INTO runs (id, workflow_id, task, status, context, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(TEST_RUN_ID, "test-workflow", "Test JSON output task", "running", "{}", now, now);

    db.prepare(
      `INSERT INTO steps (id, run_id, step_id, agent_id, step_index, input_template, expects, status, output, retry_count, max_retries, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(TEST_STEP_1_ID, TEST_RUN_ID, "planner", "test-workflow/planner", 0, "", "", "done", null, 0, 2, now, now);

    db.prepare(
      `INSERT INTO steps (id, run_id, step_id, agent_id, step_index, input_template, expects, status, output, retry_count, max_retries, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(TEST_STEP_2_ID, TEST_RUN_ID, "developer", "test-workflow/developer", 1, "", "", "running", null, 0, 2, now, now);
  });

  after(() => {
    const db = getDb();
    db.prepare("DELETE FROM steps WHERE run_id = ?").run(TEST_RUN_ID);
    db.prepare("DELETE FROM runs WHERE id = ?").run(TEST_RUN_ID);
  });

  it("returns correct JSON structure with all required fields", () => {
    const result = getWorkflowStatusJson(TEST_RUN_ID);

    // Verify top-level fields
    assert.equal(result.runId, TEST_RUN_ID);
    assert.equal(result.workflow, "test-workflow");
    assert.equal(result.task, "Test JSON output task");
    assert.equal(result.status, "running");
    assert.ok("createdAt" in result);
    assert.ok(typeof result.createdAt === "string");

    // Verify steps array
    assert.ok(Array.isArray(result.steps));
    const steps = result.steps as Array<{ name: string; status: string; agent: string }>;
    assert.equal(steps.length, 2);

    // Verify step fields
    assert.equal(steps[0].name, "planner");
    assert.equal(steps[0].status, "done");
    assert.equal(steps[0].agent, "test-workflow/planner");

    assert.equal(steps[1].name, "developer");
    assert.equal(steps[1].status, "running");
    assert.equal(steps[1].agent, "test-workflow/developer");
  });

  it("produces valid JSON output", () => {
    const result = getWorkflowStatusJson(TEST_RUN_ID);
    const serialized = JSON.stringify(result);
    assert.ok(serialized.length > 0);
    const parsed = JSON.parse(serialized);
    assert.equal(parsed.runId, TEST_RUN_ID);
  });

  it("returns not_found for nonexistent run", () => {
    const result = getWorkflowStatusJson("__nonexistent_run_xyz__");
    assert.equal(result.status, "not_found");
    assert.ok("message" in result);
  });
});
