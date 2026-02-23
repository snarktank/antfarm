import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getDb } from "../dist/db.js";
import { claimStep } from "../dist/installer/step-ops.js";

/**
 * Regression tests for issue #245.
 *
 * These intentionally encode the desired orchestration gating behavior:
 * - do NOT claim downstream work when dependencies/artifacts are missing
 * - do NOT claim work when unresolved placeholders are present
 * - do NOT let downstream execution proceed while upstream step is unresolved/pending
 */

describe("issue #245: orchestration sequencing/output gating", () => {
  const createdRunIds: string[] = [];

  afterEach(() => {
    const db = getDb();
    for (const runId of createdRunIds) {
      db.prepare("DELETE FROM steps WHERE run_id = ?").run(runId);
      db.prepare("DELETE FROM runs WHERE id = ?").run(runId);
    }
    createdRunIds.length = 0;
  });

  function insertRun(context: Record<string, string> = {}): { runId: string; now: string } {
    const db = getDb();
    const runId = randomUUID();
    const now = new Date().toISOString();

    db.prepare(
      `INSERT INTO runs (id, workflow_id, task, status, context, created_at, updated_at)
       VALUES (?, 'feature-dev', 'issue-245 regression', 'running', ?, ?, ?)`
    ).run(runId, JSON.stringify(context), now, now);

    createdRunIds.push(runId);
    return { runId, now };
  }

  it("[issue #245] should NOT claim downstream step when required upstream artifact is missing", () => {
    const db = getDb();
    const { runId, now } = insertRun({});
    const downstreamAgent = `issue245-downstream-${randomUUID().slice(0, 8)}`;

    // Upstream planner is done, but did not provide required artifact: findings
    db.prepare(
      `INSERT INTO steps (id, run_id, step_id, agent_id, step_index, input_template, expects, status, created_at, updated_at, type)
       VALUES (?, ?, 'plan', 'issue245-planner', 0, 'generate findings', 'findings', 'done', ?, ?, 'single')`
    ).run(randomUUID(), runId, now, now);

    // Downstream template requires findings from context
    db.prepare(
      `INSERT INTO steps (id, run_id, step_id, agent_id, step_index, input_template, expects, status, created_at, updated_at, type)
       VALUES (?, ?, 'develop', ?, 1, 'Use findings: {{findings}}', 'status', 'pending', ?, ?, 'single')`
    ).run(randomUUID(), runId, downstreamAgent, now, now);

    const claim = claimStep(downstreamAgent);

    // Desired behavior: claim should be blocked until dependencies/artifacts are present
    assert.equal(claim.found, false, "downstream step must not be claimable when required artifact is missing");
  });

  it("[issue #245] should block claim when unresolved placeholders like [missing: ...] are present", () => {
    const db = getDb();
    const { runId, now } = insertRun({});
    const agentId = `issue245-placeholder-${randomUUID().slice(0, 8)}`;

    db.prepare(
      `INSERT INTO steps (id, run_id, step_id, agent_id, step_index, input_template, expects, status, created_at, updated_at, type)
       VALUES (?, ?, 'setup', ?, 0, 'REPO: [missing: repo]\nBRANCH: [missing: branch]', 'status', 'pending', ?, ?, 'single')`
    ).run(randomUUID(), runId, agentId, now, now);

    const claim = claimStep(agentId);

    // Desired behavior: unresolved placeholders should hard-block claim/execute.
    assert.equal(claim.found, false, "step with unresolved [missing: ...] placeholders must not be claimed");
  });

  it("[issue #245] should preserve progression: no downstream run while dependency step is unresolved", () => {
    const db = getDb();
    const { runId, now } = insertRun({});
    const downstreamAgent = `issue245-progress-${randomUUID().slice(0, 8)}`;

    // Upstream dependency is still unresolved (waiting).
    db.prepare(
      `INSERT INTO steps (id, run_id, step_id, agent_id, step_index, input_template, expects, status, created_at, updated_at, type)
       VALUES (?, ?, 'setup', 'issue245-setup', 0, 'prepare env', 'repo,branch', 'waiting', ?, ?, 'single')`
    ).run(randomUUID(), runId, now, now);

    // Downstream step should not be runnable while dependency step is unresolved.
    db.prepare(
      `INSERT INTO steps (id, run_id, step_id, agent_id, step_index, input_template, expects, status, created_at, updated_at, type)
       VALUES (?, ?, 'develop', ?, 1, 'implement feature', 'status', 'pending', ?, ?, 'single')`
    ).run(randomUUID(), runId, downstreamAgent, now, now);

    const claim = claimStep(downstreamAgent);

    assert.equal(claim.found, false, "downstream step must not be claimed while dependency is unresolved/pending");
  });
});
