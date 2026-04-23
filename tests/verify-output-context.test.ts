import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getDb } from "../dist/db.js";
import { completeStep } from "../dist/installer/step-ops.js";

describe("verify output context propagation", () => {
  const testRunIds: string[] = [];

  afterEach(() => {
    const db = getDb();
    for (const runId of testRunIds) {
      db.prepare("DELETE FROM steps WHERE run_id = ?").run(runId);
      db.prepare("DELETE FROM runs WHERE id = ?").run(runId);
    }
    testRunIds.length = 0;
  });

  it("stores VERIFIED output in run context so downstream PR steps can resolve it", async () => {
    const db = getDb();
    const runId = randomUUID();
    const now = new Date().toISOString();
    const verifyStepId = randomUUID();
    const prStepId = randomUUID();

    const context = JSON.stringify({
      repo: "/tmp/repo",
      branch: "bugfix/test",
      test_cmd: "npm test",
      changes: "updated math.js",
      regression_test: "added regression test",
      root_cause: "bad operator",
      problem_statement: "add subtracts",
    });

    db.prepare(
      `INSERT INTO runs (id, workflow_id, task, status, context, created_at, updated_at)
       VALUES (?, 'bug-fix', 'fix bug', 'running', ?, ?, ?)`
    ).run(runId, context, now, now);

    db.prepare(
      `INSERT INTO steps (id, run_id, step_id, agent_id, step_index, input_template, expects, status, retry_count, max_retries, created_at, updated_at, type)
       VALUES (?, ?, 'verify', 'bug-fix_verifier', 4, 'verify', 'STATUS: done', 'running', 0, 3, ?, ?, 'single')`
    ).run(verifyStepId, runId, now, now);

    db.prepare(
      `INSERT INTO steps (id, run_id, step_id, agent_id, step_index, input_template, expects, status, retry_count, max_retries, created_at, updated_at, type)
       VALUES (?, ?, 'pr', 'bug-fix_pr', 5, 'VERIFIED: {{verified}}', 'STATUS: done', 'waiting', 0, 2, ?, ?, 'single')`
    ).run(prStepId, runId, now, now);

    testRunIds.push(runId);

    const result = await completeStep(verifyStepId, [
      "STATUS: done",
      "VERIFIED: confirmed fix matches root cause and regression test fails without it",
    ].join("\n"));

    assert.deepEqual(result, { advanced: true, runCompleted: false });

    const run = db.prepare("SELECT context FROM runs WHERE id = ?").get(runId) as { context: string };
    const updatedContext = JSON.parse(run.context) as Record<string, string>;
    assert.equal(
      updatedContext.verified,
      "confirmed fix matches root cause and regression test fails without it",
    );
  });
});
