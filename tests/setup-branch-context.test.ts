import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { getDb } from "../dist/db.js";
import { completeStep } from "../dist/installer/step-ops.js";

describe("setup step branch context sync", () => {
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

  it("captures the actual checked-out branch after setup completes", async () => {
    const repo = mkdtempSync(path.join(tmpdir(), "antfarm-setup-branch-"));
    tempRepos.push(repo);

    writeFileSync(path.join(repo, "package.json"), JSON.stringify({ name: "setup-branch-test", version: "1.0.0" }));
    execFileSync("git", ["init", "-b", "main"], { cwd: repo, stdio: "ignore" });
    execFileSync("git", ["add", "package.json"], { cwd: repo, stdio: "ignore" });
    execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "init"], { cwd: repo, stdio: "ignore" });
    execFileSync("git", ["checkout", "-b", "bugfix/main"], { cwd: repo, stdio: "ignore" });

    const db = getDb();
    const runId = randomUUID();
    const setupStepId = randomUUID();
    const fixStepId = randomUUID();
    const now = new Date().toISOString();

    db.prepare(
      `INSERT INTO runs (id, workflow_id, task, status, context, created_at, updated_at)
       VALUES (?, 'bug-fix', 'fix bug', 'running', ?, ?, ?)`
    ).run(runId, JSON.stringify({ repo, branch: "main" }), now, now);

    db.prepare(
      `INSERT INTO steps (id, run_id, step_id, agent_id, step_index, input_template, expects, status, retry_count, max_retries, created_at, updated_at, type)
       VALUES (?, ?, 'setup', 'bug-fix_setup', 2, 'setup', 'STATUS: done', 'running', 0, 2, ?, ?, 'single')`
    ).run(setupStepId, runId, now, now);

    db.prepare(
      `INSERT INTO steps (id, run_id, step_id, agent_id, step_index, input_template, expects, status, retry_count, max_retries, created_at, updated_at, type)
       VALUES (?, ?, 'fix', 'bug-fix_fixer', 3, 'fix', 'STATUS: done', 'waiting', 0, 2, ?, ?, 'single')`
    ).run(fixStepId, runId, now, now);

    testRunIds.push(runId);

    const result = await completeStep(setupStepId, [
      "STATUS: done",
      "BUILD_CMD: npm run build",
      "TEST_CMD: npm test",
      "BASELINE: build passes; tests fail on bugfix branch",
    ].join("\n"));

    assert.deepEqual(result, { advanced: true, runCompleted: false });

    const run = db.prepare("SELECT context FROM runs WHERE id = ?").get(runId) as { context: string };
    const context = JSON.parse(run.context) as Record<string, string>;
    assert.equal(context.branch, "bugfix/main");
  });

  it("backfills build and test commands from package.json when setup output omits them", async () => {
    const repo = mkdtempSync(path.join(tmpdir(), "antfarm-setup-fallback-"));
    tempRepos.push(repo);

    writeFileSync(path.join(repo, "package.json"), JSON.stringify({
      name: "setup-fallback-test",
      version: "1.0.0",
      scripts: {
        build: "node -e \"console.log('build ok')\"",
        test: "node --test test.js",
      },
    }, null, 2));
    execFileSync("git", ["init", "-b", "main"], { cwd: repo, stdio: "ignore" });
    execFileSync("git", ["add", "package.json"], { cwd: repo, stdio: "ignore" });
    execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "init"], { cwd: repo, stdio: "ignore" });
    execFileSync("git", ["checkout", "-b", "bugfix/setup-fallback"], { cwd: repo, stdio: "ignore" });

    const db = getDb();
    const runId = randomUUID();
    const setupStepId = randomUUID();
    const fixStepId = randomUUID();
    const now = new Date().toISOString();

    db.prepare(
      `INSERT INTO runs (id, workflow_id, task, status, context, created_at, updated_at)
       VALUES (?, 'bug-fix', 'fix bug', 'running', ?, ?, ?)`
    ).run(runId, JSON.stringify({ repo, branch: "main", status: "done" }), now, now);

    db.prepare(
      `INSERT INTO steps (id, run_id, step_id, agent_id, step_index, input_template, expects, status, retry_count, max_retries, created_at, updated_at, type)
       VALUES (?, ?, 'setup', 'bug-fix_setup', 2, 'setup', 'STATUS: done', 'running', 0, 2, ?, ?, 'single')`
    ).run(setupStepId, runId, now, now);

    db.prepare(
      `INSERT INTO steps (id, run_id, step_id, agent_id, step_index, input_template, expects, status, retry_count, max_retries, created_at, updated_at, type)
       VALUES (?, ?, 'fix', 'bug-fix_fixer', 3, 'fix {{build_cmd}} {{test_cmd}}', 'STATUS: done', 'waiting', 0, 2, ?, ?, 'single')`
    ).run(fixStepId, runId, now, now);

    testRunIds.push(runId);

    const result = await completeStep(setupStepId, "STATUS: done");
    assert.deepEqual(result, { advanced: true, runCompleted: false });

    const run = db.prepare("SELECT context FROM runs WHERE id = ?").get(runId) as { context: string };
    const context = JSON.parse(run.context) as Record<string, string>;
    assert.equal(context.branch, "bugfix/setup-fallback");
    assert.equal(context.build_cmd, "npm run build");
    assert.equal(context.test_cmd, "npm test");

    const fix = db.prepare("SELECT status FROM steps WHERE id = ?").get(fixStepId) as { status: string };
    assert.equal(fix.status, "pending");
  });
});
