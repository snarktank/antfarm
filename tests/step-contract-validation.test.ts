import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { getDb } from "../dist/db.js";
import { claimStep, completeStep } from "../dist/installer/step-ops.js";

describe("step contract validation", () => {
  const testRunIds: string[] = [];
  const tempRepos: string[] = [];

  afterEach(() => {
    const db = getDb();
    for (const runId of testRunIds) {
      db.prepare("DELETE FROM steps WHERE run_id = ?").run(runId);
      db.prepare("DELETE FROM runs WHERE id = ?").run(runId);
    }
    testRunIds.length = 0;

    for (const repo of tempRepos) {
      rmSync(repo, { recursive: true, force: true });
    }
    tempRepos.length = 0;
  });

  it("does not advance a step when completion omits STATUS", async () => {
    const db = getDb();
    const runId = randomUUID();
    const setupStepId = randomUUID();
    const fixStepId = randomUUID();
    const now = new Date().toISOString();

    db.prepare(
      `INSERT INTO runs (id, workflow_id, task, status, context, created_at, updated_at)
       VALUES (?, 'bug-fix', 'fix bug', 'running', ?, ?, ?)`
    ).run(runId, JSON.stringify({ repo: "/tmp/repo", branch: "bugfix/test" }), now, now);

    db.prepare(
      `INSERT INTO steps (id, run_id, step_id, agent_id, step_index, input_template, expects, status, retry_count, max_retries, created_at, updated_at, type)
       VALUES (?, ?, 'setup', 'bug-fix_setup', 2, 'setup', 'STATUS: done', 'running', 0, 2, ?, ?, 'single')`
    ).run(setupStepId, runId, now, now);

    db.prepare(
      `INSERT INTO steps (id, run_id, step_id, agent_id, step_index, input_template, expects, status, retry_count, max_retries, created_at, updated_at, type)
       VALUES (?, ?, 'fix', 'bug-fix_fixer', 3, 'fix {{build_cmd}} {{test_cmd}}', 'STATUS: done', 'waiting', 0, 2, ?, ?, 'single')`
    ).run(fixStepId, runId, now, now);

    testRunIds.push(runId);

    const result = await completeStep(setupStepId, "BUILD_CMD: npm run build\nTEST_CMD: npm test");
    assert.deepEqual(result, { advanced: false, runCompleted: false });

    const setup = db.prepare("SELECT status, retry_count, output FROM steps WHERE id = ?").get(setupStepId) as { status: string; retry_count: number; output: string };
    const fix = db.prepare("SELECT status FROM steps WHERE id = ?").get(fixStepId) as { status: string };
    const run = db.prepare("SELECT status FROM runs WHERE id = ?").get(runId) as { status: string };

    assert.equal(setup.status, "pending");
    assert.equal(setup.retry_count, 1);
    assert.match(setup.output, /missing STATUS/i);
    assert.equal(fix.status, "waiting");
    assert.equal(run.status, "running");
  });

  it("rejects missing STATUS even when prior run context already has status=done", async () => {
    const db = getDb();
    const runId = randomUUID();
    const stepId = randomUUID();
    const nextStepId = randomUUID();
    const now = new Date().toISOString();

    db.prepare(
      `INSERT INTO runs (id, workflow_id, task, status, context, created_at, updated_at)
       VALUES (?, 'bug-fix', 'fix bug', 'running', ?, ?, ?)`
    ).run(runId, JSON.stringify({ repo: "/tmp/repo", branch: "bugfix/test", status: "done", verified: "old value" }), now, now);

    db.prepare(
      `INSERT INTO steps (id, run_id, step_id, agent_id, step_index, input_template, expects, status, retry_count, max_retries, created_at, updated_at, type)
       VALUES (?, ?, 'verify', 'bug-fix_verifier', 0, 'verify', 'STATUS: done', 'running', 0, 2, ?, ?, 'single')`
    ).run(stepId, runId, now, now);

    db.prepare(
      `INSERT INTO steps (id, run_id, step_id, agent_id, step_index, input_template, expects, status, retry_count, max_retries, created_at, updated_at, type)
       VALUES (?, ?, 'pr', 'bug-fix_pr', 1, 'pr', 'STATUS: done', 'waiting', 0, 2, ?, ?, 'single')`
    ).run(nextStepId, runId, now, now);

    testRunIds.push(runId);

    const result = await completeStep(stepId, "VERIFIED: current output but no status");
    assert.deepEqual(result, { advanced: false, runCompleted: false });

    const step = db.prepare("SELECT status, retry_count, output FROM steps WHERE id = ?").get(stepId) as { status: string; retry_count: number; output: string };
    const next = db.prepare("SELECT status FROM steps WHERE id = ?").get(nextStepId) as { status: string };
    const run = db.prepare("SELECT context FROM runs WHERE id = ?").get(runId) as { context: string };
    const context = JSON.parse(run.context) as Record<string, string>;

    assert.equal(step.status, "pending");
    assert.equal(step.retry_count, 1);
    assert.match(step.output, /missing STATUS/i);
    assert.equal(next.status, "waiting");
    assert.equal(context.status, "done");
    assert.equal(context.verified, "old value");
  });

  it("fails closed when retry_step target is missing", async () => {
    const db = getDb();
    const runId = randomUUID();
    const stepId = randomUUID();
    const now = new Date().toISOString();

    db.prepare(
      `INSERT INTO runs (id, workflow_id, task, status, context, created_at, updated_at)
       VALUES (?, 'bug-fix', 'fix bug', 'running', ?, ?, ?)`
    ).run(runId, JSON.stringify({ repo: "/tmp/repo", branch: "bugfix/test" }), now, now);

    db.prepare(
      `INSERT INTO steps (id, run_id, step_id, agent_id, step_index, input_template, expects, status, retry_count, max_retries, created_at, updated_at, type)
       VALUES (?, ?, 'verify', 'bug-fix_verifier', 0, 'verify', 'STATUS: done', 'running', 0, 2, ?, ?, 'single')`
    ).run(stepId, runId, now, now);

    testRunIds.push(runId);

    const result = await completeStep(stepId, "STATUS: retry\nISSUES: not good");
    assert.deepEqual(result, { advanced: false, runCompleted: false });

    const step = db.prepare("SELECT status, retry_count, output FROM steps WHERE id = ?").get(stepId) as { status: string; retry_count: number; output: string };
    const run = db.prepare("SELECT status FROM runs WHERE id = ?").get(runId) as { status: string };

    assert.equal(step.status, "failed");
    assert.equal(step.retry_count, 1);
    assert.match(step.output, /Invalid workflow retry target/i);
    assert.equal(run.status, "failed");
  });

  it("backfills build and test commands during claimStep before template resolution", () => {
    const repo = mkdtempSync(path.join(tmpdir(), "antfarm-claim-backfill-"));
    tempRepos.push(repo);

    writeFileSync(path.join(repo, "package.json"), JSON.stringify({
      name: "claim-backfill-test",
      version: "1.0.0",
      scripts: {
        build: "node -e \"console.log('build ok')\"",
        test: "node --test",
      },
    }, null, 2));
    execFileSync("git", ["init", "-b", "main"], { cwd: repo, stdio: "ignore" });
    execFileSync("git", ["add", "package.json"], { cwd: repo, stdio: "ignore" });
    execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "init"], { cwd: repo, stdio: "ignore" });
    execFileSync("git", ["checkout", "-b", "bugfix/claim-backfill"], { cwd: repo, stdio: "ignore" });

    const db = getDb();
    const runId = randomUUID();
    const fixStepId = randomUUID();
    const fixerAgentId = `test-fixer-${randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();

    db.prepare(
      `INSERT INTO runs (id, workflow_id, task, status, context, created_at, updated_at)
       VALUES (?, 'bug-fix', 'fix bug', 'running', ?, ?, ?)`
    ).run(runId, JSON.stringify({ repo, branch: "main" }), now, now);

    db.prepare(
      `INSERT INTO steps (id, run_id, step_id, agent_id, step_index, input_template, expects, status, retry_count, max_retries, created_at, updated_at, type)
       VALUES (?, ?, 'fix', ?, 3, 'BUILD={{build_cmd}} TEST={{test_cmd}}', 'STATUS: done', 'pending', 0, 2, ?, ?, 'single')`
    ).run(fixStepId, runId, fixerAgentId, now, now);

    testRunIds.push(runId);

    const result = claimStep(fixerAgentId);
    assert.equal(result.found, true);
    assert.match(result.resolvedInput ?? "", /BUILD=npm run build/);
    assert.match(result.resolvedInput ?? "", /TEST=npm test/);
    assert.equal(result.cwd, repo);
  });
});
