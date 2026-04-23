import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getDb } from "../dist/db.js";
import { cleanupAbandonedSteps } from "../dist/installer/step-ops.js";
import { checkStalledRuns, checkStuckSteps } from "../dist/medic/checks.js";

describe("per-step timeout thresholds", () => {
  const testRunIds: string[] = [];

  afterEach(() => {
    const db = getDb();
    for (const runId of testRunIds) {
      db.prepare("DELETE FROM stories WHERE run_id = ?").run(runId);
      db.prepare("DELETE FROM steps WHERE run_id = ?").run(runId);
      db.prepare("DELETE FROM runs WHERE id = ?").run(runId);
    }
    testRunIds.length = 0;
  });

  it("cleanupAbandonedSteps respects timeout_seconds per step", () => {
    const db = getDb();
    const now = new Date();
    const stale = new Date(now.getTime() - 11 * 60 * 1000).toISOString();

    const fastRunId = randomUUID();
    const slowRunId = randomUUID();
    const fastStepId = randomUUID();
    const slowStepId = randomUUID();

    db.prepare(
      `INSERT INTO runs (id, workflow_id, task, status, context, created_at, updated_at)
       VALUES (?, 'bug-fix', 'fast timeout', 'running', '{}', ?, ?)`
    ).run(fastRunId, stale, stale);
    db.prepare(
      `INSERT INTO runs (id, workflow_id, task, status, context, created_at, updated_at)
       VALUES (?, 'bug-fix', 'slow timeout', 'running', '{}', ?, ?)`
    ).run(slowRunId, stale, stale);

    db.prepare(
      `INSERT INTO steps (id, run_id, step_id, agent_id, step_index, input_template, expects, status, retry_count, max_retries, timeout_seconds, created_at, updated_at, type)
       VALUES (?, ?, 'verify', 'bug-fix_verifier', 0, 'verify', 'STATUS: done', 'running', 0, 2, 60, ?, ?, 'single')`
    ).run(fastStepId, fastRunId, stale, stale);
    db.prepare(
      `INSERT INTO steps (id, run_id, step_id, agent_id, step_index, input_template, expects, status, retry_count, max_retries, timeout_seconds, created_at, updated_at, type)
       VALUES (?, ?, 'verify', 'bug-fix_verifier', 0, 'verify', 'STATUS: done', 'running', 0, 2, 1800, ?, ?, 'single')`
    ).run(slowStepId, slowRunId, stale, stale);

    testRunIds.push(fastRunId, slowRunId);

    cleanupAbandonedSteps();

    const fast = db.prepare("SELECT status, abandoned_count FROM steps WHERE id = ?").get(fastStepId) as { status: string; abandoned_count: number };
    const slow = db.prepare("SELECT status, abandoned_count FROM steps WHERE id = ?").get(slowStepId) as { status: string; abandoned_count: number };

    assert.equal(fast.status, "pending");
    assert.equal(fast.abandoned_count, 1);
    assert.equal(slow.status, "running");
    assert.equal(slow.abandoned_count, 0);
  });

  it("medic checks use timeout_seconds instead of one global max", () => {
    const db = getDb();
    const now = new Date();
    const stale30m = new Date(now.getTime() - 30 * 60 * 1000).toISOString();

    const fastRunId = randomUUID();
    const slowRunId = randomUUID();
    const fastStepId = randomUUID();
    const slowStepId = randomUUID();

    db.prepare(
      `INSERT INTO runs (id, workflow_id, task, status, context, created_at, updated_at)
       VALUES (?, 'bug-fix', 'fast medic timeout', 'running', '{}', ?, ?)`
    ).run(fastRunId, stale30m, stale30m);
    db.prepare(
      `INSERT INTO runs (id, workflow_id, task, status, context, created_at, updated_at)
       VALUES (?, 'bug-fix', 'slow medic timeout', 'running', '{}', ?, ?)`
    ).run(slowRunId, stale30m, stale30m);

    db.prepare(
      `INSERT INTO steps (id, run_id, step_id, agent_id, step_index, input_template, expects, status, retry_count, max_retries, timeout_seconds, created_at, updated_at, type)
       VALUES (?, ?, 'verify', 'bug-fix_verifier', 0, 'verify', 'STATUS: done', 'running', 0, 2, 300, ?, ?, 'single')`
    ).run(fastStepId, fastRunId, stale30m, stale30m);
    db.prepare(
      `INSERT INTO steps (id, run_id, step_id, agent_id, step_index, input_template, expects, status, retry_count, max_retries, timeout_seconds, created_at, updated_at, type)
       VALUES (?, ?, 'verify', 'bug-fix_verifier', 0, 'verify', 'STATUS: done', 'running', 0, 2, 1800, ?, ?, 'single')`
    ).run(slowStepId, slowRunId, stale30m, stale30m);

    testRunIds.push(fastRunId, slowRunId);

    const stuck = checkStuckSteps();
    const stalled = checkStalledRuns();

    assert.ok(stuck.some((finding) => finding.runId === fastRunId), "short-timeout step should be flagged stuck");
    assert.ok(!stuck.some((finding) => finding.runId === slowRunId), "long-timeout step should not be flagged stuck yet");
    assert.ok(stalled.some((finding) => finding.runId === fastRunId), "short-timeout run should be flagged stalled");
    assert.ok(!stalled.some((finding) => finding.runId === slowRunId), "long-timeout run should not be flagged stalled yet");
  });
});
