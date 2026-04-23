import { afterEach, beforeEach, describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { getDb } from "../dist/db.js";
import { runWorkflow } from "../dist/installer/run.js";
import { claimStep, completeStep } from "../dist/installer/step-ops.js";
import { getWorkflowStatus } from "../dist/installer/status.js";

const WORKFLOW_ID = `smoke-${randomUUID().slice(0, 8)}`;
const WORKFLOW_DIR = path.join(os.homedir(), ".openclaw", "antfarm", "workflows", WORKFLOW_ID);

describe("workflow smoke e2e", () => {
  let repoDir: string;
  let originalCwd: string;
  let originalFetch: typeof globalThis.fetch;
  let capturedJobs: any[];
  const createdRunIds: string[] = [];

  beforeEach(() => {
    originalCwd = process.cwd();
    capturedJobs = [];
    originalFetch = globalThis.fetch;
    globalThis.fetch = mock.fn(async (_url: any, opts: any) => {
      const body = JSON.parse(opts.body);
      if (body.args?.job) capturedJobs.push(body.args.job);
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true, result: { id: `job-${capturedJobs.length}` } }),
        text: async () => "ok",
      };
    }) as any;

    repoDir = fs.mkdtempSync(path.join(os.tmpdir(), "antfarm-smoke-repo-"));
    execFileSync("git", ["init", "-b", "main"], { cwd: repoDir, stdio: "ignore" });
    fs.writeFileSync(path.join(repoDir, "README.md"), "# smoke test\n");
    fs.writeFileSync(
      path.join(repoDir, "package.json"),
      JSON.stringify({
        name: "antfarm-smoke-repo",
        version: "1.0.0",
        scripts: {
          test: "node --test",
        },
      }, null, 2),
    );
    execFileSync("git", ["add", "."], { cwd: repoDir, stdio: "ignore" });
    execFileSync(
      "git",
      ["-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "init"],
      { cwd: repoDir, stdio: "ignore" },
    );
    execFileSync("git", ["checkout", "-b", "smoke/e2e"], { cwd: repoDir, stdio: "ignore" });

    fs.mkdirSync(WORKFLOW_DIR, { recursive: true });
    fs.writeFileSync(
      path.join(WORKFLOW_DIR, "workflow.yml"),
      `id: ${WORKFLOW_ID}
name: Smoke E2E
version: 1
polling:
  model: default
  timeoutSeconds: 120
agents:
  - id: starter
    workspace:
      baseDir: agents/starter
      files:
        AGENTS.md: ./workflow.yml
  - id: finisher
    workspace:
      baseDir: agents/finisher
      files:
        AGENTS.md: ./workflow.yml
steps:
  - id: start
    agent: starter
    input: |
      Start the smoke run.

      TASK: {{task}}
      REPO: {{repo}}

      Reply with:
      STATUS: done
      NOTE: smoke started
    expects: "STATUS: done"
  - id: finish
    agent: finisher
    input: |
      Finish the smoke run.

      TASK: {{task}}
      NOTE: {{note}}

      Reply with:
      STATUS: done
      VERIFIED: smoke finished
    expects: "STATUS: done"
`,
    );
  });

  afterEach(() => {
    process.chdir(originalCwd);
    globalThis.fetch = originalFetch;

    const db = getDb();
    for (const runId of createdRunIds) {
      db.prepare("DELETE FROM stories WHERE run_id = ?").run(runId);
      db.prepare("DELETE FROM steps WHERE run_id = ?").run(runId);
      db.prepare("DELETE FROM runs WHERE id = ?").run(runId);
    }
    createdRunIds.length = 0;

    fs.rmSync(repoDir, { recursive: true, force: true });
    fs.rmSync(WORKFLOW_DIR, { recursive: true, force: true });
  });

  it("runs a tiny workflow from run -> claim -> complete -> completed", async () => {
    process.chdir(repoDir);

    const run = await runWorkflow({
      workflowId: WORKFLOW_ID,
      taskTitle: "smoke e2e workflow",
    });
    createdRunIds.push(run.id);

    assert.equal(run.status, "running");
    assert.equal(capturedJobs.length, 2, "should create one cron per workflow agent");

    const firstClaim = claimStep(`${WORKFLOW_ID}_starter`);
    assert.equal(firstClaim.found, true, "starter step should be claimable");
    assert.match(firstClaim.resolvedInput ?? "", /TASK: smoke e2e workflow/);
    assert.equal(fs.realpathSync(firstClaim.cwd!), fs.realpathSync(repoDir));

    const firstComplete = await completeStep(firstClaim.stepId!, "STATUS: done\nNOTE: smoke started");
    assert.deepEqual(firstComplete, { advanced: true, runCompleted: false });

    const secondClaim = claimStep(`${WORKFLOW_ID}_finisher`);
    assert.equal(secondClaim.found, true, "finisher step should be claimable after pipeline advance");
    assert.match(secondClaim.resolvedInput ?? "", /NOTE: smoke started/);

    const secondComplete = await completeStep(secondClaim.stepId!, "STATUS: done\nVERIFIED: smoke finished");
    assert.deepEqual(secondComplete, { advanced: false, runCompleted: true });

    const status = getWorkflowStatus(run.id);
    assert.equal(status.status, "ok");
    if (status.status !== "ok") throw new Error("run status missing");
    assert.equal(status.run.status, "completed");
    assert.deepEqual(status.steps.map((step) => step.status), ["done", "done"]);
  });
});
