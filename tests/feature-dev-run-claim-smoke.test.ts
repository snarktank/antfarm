import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { runWorkflow } from "../dist/installer/run.js";
import { claimStep } from "../dist/installer/step-ops.js";
import { getDb } from "../dist/db.js";

const createdRunIds: string[] = [];

afterEach(() => {
  const db = getDb();
  for (const runId of createdRunIds) {
    db.prepare("DELETE FROM steps WHERE run_id = ?").run(runId);
    db.prepare("DELETE FROM runs WHERE id = ?").run(runId);
  }
  createdRunIds.length = 0;
});

describe("feature-dev smoke: run creation and planner claim", () => {
  it("creates a running run and allows planner to claim first pending plan step", async () => {
    const taskTitle = `[SMOKE] Validate feature-dev pipeline with MiniMax-M2.5 (${Date.now()})`;
    const run = await runWorkflow({ workflowId: "feature-dev", taskTitle });
    createdRunIds.push(run.id);

    assert.ok(run.id && run.id.length > 0, "runWorkflow should return a non-empty run id");

    const db = getDb();
    const runRow = db
      .prepare("SELECT id, status FROM runs WHERE id = ?")
      .get(run.id) as { id: string; status: string } | undefined;

    assert.ok(runRow, "run should be persisted to DB");
    assert.equal(runRow!.status, "running", "new run should be persisted with running status");

    const firstStep = db
      .prepare(
        "SELECT id, step_id, agent_id, status FROM steps WHERE run_id = ? ORDER BY step_index ASC LIMIT 1"
      )
      .get(run.id) as { id: string; step_id: string; agent_id: string; status: string } | undefined;

    assert.ok(firstStep, "first workflow step should exist");
    assert.equal(firstStep!.step_id, "plan", "first step should be plan");
    assert.equal(firstStep!.agent_id, "feature-dev_planner", "first step agent should be feature-dev_planner");
    assert.equal(firstStep!.status, "pending", "planner step should be pending before claim");

    const claim = claimStep("feature-dev_planner");
    assert.equal(claim.found, true, "planner should be able to claim work");
    assert.ok(claim.runId && claim.runId.length > 0, "claimed response should contain runId");
    assert.ok(claim.stepId && claim.stepId.length > 0, "claimed response should contain stepId");

    const claimedStep = db
      .prepare("SELECT status FROM steps WHERE id = ?")
      .get(claim.stepId) as { status: string } | undefined;
    assert.equal(claimedStep?.status, "running", "planner step should transition to running after claim");

    assert.ok(claim.resolvedInput, "claim result should include resolved input");
    assert.ok(claim.resolvedInput!.includes("TASK:"), "resolved input should contain task block header");
    assert.ok(
      claim.resolvedInput!.includes(taskTitle),
      "resolved input should include the task content"
    );
  });
});
