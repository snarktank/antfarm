import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import { execSync } from "node:child_process";
import { getDb } from "../dist/db.js";
import { completeStep } from "../dist/installer/step-ops.js";

describe("single-step retry_step flow", () => {
  let tmpDir: string;
  const testRunIds: string[] = [];

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "antfarm-retry-"));
    execSync("git init && git checkout -b main", { cwd: tmpDir, stdio: "ignore" });
    fs.writeFileSync(path.join(tmpDir, "package.json"), JSON.stringify({ name: "retry-test", scripts: { test: "node --test" } }, null, 2));
    execSync("git add . && git commit -m 'init'", { cwd: tmpDir, stdio: "ignore" });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    const db = getDb();
    for (const runId of testRunIds) {
      db.prepare("DELETE FROM steps WHERE run_id = ?").run(runId);
      db.prepare("DELETE FROM runs WHERE id = ?").run(runId);
    }
    testRunIds.length = 0;
  });

  it("routes STATUS: retry back to the configured retry_step instead of advancing", async () => {
    const db = getDb();
    const runId = randomUUID();
    const now = new Date().toISOString();
    const fixStepId = randomUUID();
    const verifyStepId = randomUUID();
    const prStepId = randomUUID();

    const context = JSON.stringify({
      repo: tmpDir,
      branch: "bugfix/test-retry",
      task: "fix bug",
      changes: "updated math.js",
      regression_test: "added regression test",
      root_cause: "bad operator",
      problem_statement: "add subtracts",
      test_cmd: "npm test",
    });

    db.prepare(
      `INSERT INTO runs (id, workflow_id, task, status, context, created_at, updated_at)
       VALUES (?, 'bug-fix', 'fix bug', 'running', ?, ?, ?)`
    ).run(runId, context, now, now);

    db.prepare(
      `INSERT INTO steps (id, run_id, step_id, agent_id, step_index, input_template, expects, status, retry_count, max_retries, created_at, updated_at, type)
       VALUES (?, ?, 'fix', 'bug-fix_fixer', 3, 'fix', 'STATUS: done', 'done', 0, 2, ?, ?, 'single')`
    ).run(fixStepId, runId, now, now);

    db.prepare(
      `INSERT INTO steps (id, run_id, step_id, agent_id, step_index, input_template, expects, status, retry_count, max_retries, created_at, updated_at, type)
       VALUES (?, ?, 'verify', 'bug-fix_verifier', 4, 'verify', 'STATUS: done', 'running', 0, 3, ?, ?, 'single')`
    ).run(verifyStepId, runId, now, now);

    db.prepare(
      `INSERT INTO steps (id, run_id, step_id, agent_id, step_index, input_template, expects, status, retry_count, max_retries, created_at, updated_at, type)
       VALUES (?, ?, 'pr', 'bug-fix_pr', 5, 'pr', 'STATUS: done', 'waiting', 0, 2, ?, ?, 'single')`
    ).run(prStepId, runId, now, now);

    testRunIds.push(runId);

    const result = await completeStep(verifyStepId, [
      'STATUS: retry',
      'ISSUES: verifier found a mismatch',
    ].join('\n'));

    assert.deepEqual(result, { advanced: false, runCompleted: false });

    const fix = db.prepare("SELECT status FROM steps WHERE id = ?").get(fixStepId) as { status: string };
    const verify = db.prepare("SELECT status, retry_count FROM steps WHERE id = ?").get(verifyStepId) as { status: string; retry_count: number };
    const pr = db.prepare("SELECT status FROM steps WHERE id = ?").get(prStepId) as { status: string };
    const run = db.prepare("SELECT status, context FROM runs WHERE id = ?").get(runId) as { status: string; context: string };
    const updatedContext = JSON.parse(run.context) as Record<string, string>;

    assert.equal(fix.status, "pending");
    assert.equal(verify.status, "waiting");
    assert.equal(verify.retry_count, 1);
    assert.equal(pr.status, "waiting");
    assert.equal(run.status, "running");
    assert.equal(updatedContext.verify_feedback, "verifier found a mismatch");
    assert.equal(updatedContext.status, "retry");
  });
});
