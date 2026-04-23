import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getDb } from "../dist/db.js";
import { completeStep, failStep } from "../dist/installer/step-ops.js";

describe("non-running step guards", () => {
  const testRunIds: string[] = [];

  afterEach(() => {
    const db = getDb();
    for (const runId of testRunIds) {
      db.prepare("DELETE FROM steps WHERE run_id = ?").run(runId);
      db.prepare("DELETE FROM runs WHERE id = ?").run(runId);
    }
    testRunIds.length = 0;
  });

  it("ignores duplicate completion on an already-done step", async () => {
    const db = getDb();
    const runId = randomUUID();
    const stepId = randomUUID();
    const nextStepId = randomUUID();
    const laterStepId = randomUUID();
    const now = new Date().toISOString();

    db.prepare(
      `INSERT INTO runs (id, workflow_id, task, status, context, created_at, updated_at)
       VALUES (?, 'bug-fix', 'fix bug', 'running', '{}', ?, ?)`
    ).run(runId, now, now);

    db.prepare(
      `INSERT INTO steps (id, run_id, step_id, agent_id, step_index, input_template, expects, status, retry_count, max_retries, created_at, updated_at, type)
       VALUES (?, ?, 'fix', 'bug-fix_fixer', 0, 'fix', 'STATUS: done', 'running', 0, 2, ?, ?, 'single')`
    ).run(stepId, runId, now, now);

    db.prepare(
      `INSERT INTO steps (id, run_id, step_id, agent_id, step_index, input_template, expects, status, retry_count, max_retries, created_at, updated_at, type)
       VALUES (?, ?, 'verify', 'bug-fix_verifier', 1, 'verify', 'STATUS: done', 'waiting', 0, 2, ?, ?, 'single')`
    ).run(nextStepId, runId, now, now);

    db.prepare(
      `INSERT INTO steps (id, run_id, step_id, agent_id, step_index, input_template, expects, status, retry_count, max_retries, created_at, updated_at, type)
       VALUES (?, ?, 'pr', 'bug-fix_pr', 2, 'pr', 'STATUS: done', 'waiting', 0, 2, ?, ?, 'single')`
    ).run(laterStepId, runId, now, now);

    testRunIds.push(runId);

    const first = await completeStep(stepId, "STATUS: done\nBUILD_CMD: npm run build\nTEST_CMD: npm test");
    assert.deepEqual(first, { advanced: true, runCompleted: false });

    let fixStep = db.prepare("SELECT status FROM steps WHERE id = ?").get(nextStepId) as { status: string };
    let verifyStep = db.prepare("SELECT status FROM steps WHERE id = ?").get(laterStepId) as { status: string };
    assert.equal(fixStep.status, "pending");
    assert.equal(verifyStep.status, "waiting");

    const duplicate = await completeStep(stepId, "STATUS: done\nBUILD_CMD: npm run build\nTEST_CMD: npm test");
    assert.deepEqual(duplicate, { advanced: false, runCompleted: false });

    fixStep = db.prepare("SELECT status FROM steps WHERE id = ?").get(nextStepId) as { status: string };
    verifyStep = db.prepare("SELECT status FROM steps WHERE id = ?").get(laterStepId) as { status: string };
    assert.equal(fixStep.status, "pending");
    assert.equal(verifyStep.status, "waiting");
  });

  it("ignores late failStep on an already-done step", async () => {
    const db = getDb();
    const runId = randomUUID();
    const stepId = randomUUID();
    const now = new Date().toISOString();

    db.prepare(
      `INSERT INTO runs (id, workflow_id, task, status, context, created_at, updated_at)
       VALUES (?, 'bug-fix', 'fix bug', 'running', '{}', ?, ?)`
    ).run(runId, now, now);

    db.prepare(
      `INSERT INTO steps (id, run_id, step_id, agent_id, step_index, input_template, expects, status, retry_count, max_retries, created_at, updated_at, type)
       VALUES (?, ?, 'fix', 'bug-fix_fixer', 0, 'fix', 'STATUS: done', 'done', 0, 2, ?, ?, 'single')`
    ).run(stepId, runId, now, now);

    testRunIds.push(runId);

    const result = await failStep(stepId, 'late failure');
    assert.deepEqual(result, { retrying: false, runFailed: false });

    const step = db.prepare("SELECT status, retry_count FROM steps WHERE id = ?").get(stepId) as { status: string; retry_count: number };
    const run = db.prepare("SELECT status FROM runs WHERE id = ?").get(runId) as { status: string };
    assert.equal(step.status, 'done');
    assert.equal(step.retry_count, 0);
    assert.equal(run.status, 'running');
  });
});
