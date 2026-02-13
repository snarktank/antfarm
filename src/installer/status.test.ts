import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { getDb } from "../db.js";
import { stopWorkflow } from "./status.js";
import type { StopWorkflowResult } from "./status.js";

// Helper to create a test run with steps
function createTestRun(opts: {
  runId: string;
  workflowId: string;
  status?: string;
  steps?: Array<{ stepId: string; status: string; output?: string | null }>;
}) {
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare(
    "INSERT INTO runs (id, workflow_id, task, status, context, created_at, updated_at) VALUES (?, ?, ?, ?, '{}', ?, ?)"
  ).run(opts.runId, opts.workflowId, "test task", opts.status ?? "running", now, now);

  if (opts.steps) {
    for (let i = 0; i < opts.steps.length; i++) {
      const s = opts.steps[i];
      db.prepare(
        "INSERT INTO steps (id, run_id, step_id, agent_id, step_index, input_template, expects, status, output, created_at, updated_at) VALUES (?, ?, ?, ?, ?, '', '', ?, ?, ?, ?)"
      ).run(
        crypto.randomUUID(),
        opts.runId,
        s.stepId,
        "test-agent",
        i,
        s.status,
        s.output ?? null,
        now,
        now
      );
    }
  }
}

// Helper to clean up a test run and its steps
function cleanupTestRun(runId: string) {
  const db = getDb();
  db.prepare("DELETE FROM steps WHERE run_id = ?").run(runId);
  db.prepare("DELETE FROM runs WHERE id = ?").run(runId);
}

describe("stopWorkflow", () => {
  const testRunIds: string[] = [];

  afterEach(() => {
    for (const id of testRunIds) {
      cleanupTestRun(id);
    }
    testRunIds.length = 0;
  });

  it("stops a running workflow with mixed step statuses and returns correct cancelled count", async () => {
    const runId = crypto.randomUUID();
    testRunIds.push(runId);
    createTestRun({
      runId,
      workflowId: "test-wf-1",
      status: "running",
      steps: [
        { stepId: "plan", status: "done", output: "plan output" },
        { stepId: "implement", status: "running" },
        { stepId: "verify", status: "waiting" },
        { stepId: "deploy", status: "pending" },
      ],
    });

    const result = await stopWorkflow(runId);
    assert.equal(result.status, "ok");
    if (result.status !== "ok") return; // narrow type
    assert.equal(result.runId, runId);
    assert.equal(result.workflowId, "test-wf-1");
    assert.equal(result.cancelledSteps, 3); // running + waiting + pending

    // Verify DB state
    const db = getDb();
    const run = db.prepare("SELECT status FROM runs WHERE id = ?").get(runId) as { status: string };
    assert.equal(run.status, "cancelled");

    const steps = db.prepare("SELECT step_id, status, output FROM steps WHERE run_id = ? ORDER BY step_index").all(runId) as Array<{ step_id: string; status: string; output: string | null }>;
    assert.equal(steps[0].status, "done"); // done step unchanged
    assert.equal(steps[0].output, "plan output"); // done step output unchanged
    assert.equal(steps[1].status, "failed");
    assert.equal(steps[1].output, "Cancelled by user");
    assert.equal(steps[2].status, "failed");
    assert.equal(steps[2].output, "Cancelled by user");
    assert.equal(steps[3].status, "failed");
    assert.equal(steps[3].output, "Cancelled by user");
  });

  it("returns not_found for a non-existent run", async () => {
    const result = await stopWorkflow("nonexistent-run-id-12345");
    assert.equal(result.status, "not_found");
    if (result.status !== "not_found") return;
    assert.ok(result.message.includes("nonexistent-run-id-12345"));
  });

  it("returns already_done for an already completed run", async () => {
    const runId = crypto.randomUUID();
    testRunIds.push(runId);
    createTestRun({
      runId,
      workflowId: "test-wf-2",
      status: "completed",
      steps: [{ stepId: "plan", status: "done" }],
    });

    const result = await stopWorkflow(runId);
    assert.equal(result.status, "already_done");
    if (result.status !== "already_done") return;
    assert.ok(result.message.includes("completed"));
  });

  it("returns already_done for an already cancelled run", async () => {
    const runId = crypto.randomUUID();
    testRunIds.push(runId);
    createTestRun({
      runId,
      workflowId: "test-wf-3",
      status: "cancelled",
      steps: [{ stepId: "plan", status: "failed" }],
    });

    const result = await stopWorkflow(runId);
    assert.equal(result.status, "already_done");
    if (result.status !== "already_done") return;
    assert.ok(result.message.includes("cancelled"));
  });

  it("supports prefix matching with first 8 chars of UUID", async () => {
    const runId = crypto.randomUUID();
    testRunIds.push(runId);
    createTestRun({
      runId,
      workflowId: "test-wf-4",
      status: "running",
      steps: [{ stepId: "plan", status: "waiting" }],
    });

    const prefix = runId.slice(0, 8);
    const result = await stopWorkflow(prefix);
    assert.equal(result.status, "ok");
    if (result.status !== "ok") return;
    assert.equal(result.runId, runId);
    assert.equal(result.cancelledSteps, 1);
  });

  it("does NOT change done steps to failed", async () => {
    const runId = crypto.randomUUID();
    testRunIds.push(runId);
    createTestRun({
      runId,
      workflowId: "test-wf-5",
      status: "running",
      steps: [
        { stepId: "step-a", status: "done", output: "original output" },
        { stepId: "step-b", status: "done", output: "also done" },
        { stepId: "step-c", status: "running" },
      ],
    });

    const result = await stopWorkflow(runId);
    assert.equal(result.status, "ok");
    if (result.status !== "ok") return;
    assert.equal(result.cancelledSteps, 1); // only the running step

    // Verify done steps are untouched
    const db = getDb();
    const steps = db.prepare("SELECT step_id, status, output FROM steps WHERE run_id = ? ORDER BY step_index").all(runId) as Array<{ step_id: string; status: string; output: string | null }>;
    assert.equal(steps[0].status, "done");
    assert.equal(steps[0].output, "original output");
    assert.equal(steps[1].status, "done");
    assert.equal(steps[1].output, "also done");
    assert.equal(steps[2].status, "failed");
    assert.equal(steps[2].output, "Cancelled by user");
  });
});
