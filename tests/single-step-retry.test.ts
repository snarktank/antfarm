import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

let tempRoot: string;

beforeEach(() => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "antfarm-retry-"));
  process.env.HOME = tempRoot;
  process.env.OPENCLAW_STATE_DIR = path.join(tempRoot, ".openclaw");

  const workflowDir = path.join(process.env.OPENCLAW_STATE_DIR, "antfarm", "workflows", "retry-wf");
  fs.mkdirSync(workflowDir, { recursive: true });
  fs.writeFileSync(
    path.join(workflowDir, "workflow.yml"),
    `id: retry-wf
agents:
  - id: developer
    workspace:
      baseDir: agents/developer
      files:
        AGENTS.md: agents/developer/AGENTS.md
  - id: qa
    workspace:
      baseDir: agents/qa
      files:
        AGENTS.md: agents/qa/AGENTS.md
steps:
  - id: implement
    agent: developer
    input: |
      Implement
    expects: "STATUS: done"
  - id: qa
    agent: qa
    input: |
      Validate
    expects: "STATUS: done"
    on_fail:
      retry_step: implement
      max_retries: 2
`
  );
});

describe("single-step retry handling", () => {
  it("requeues the configured retry_step when a single step returns STATUS: retry", async () => {
    const { getDb } = await import("../dist/db.js?case=" + crypto.randomUUID());
    const { completeStep } = await import("../dist/installer/step-ops.js?case=" + crypto.randomUUID());

    const db = getDb();
    const runId = crypto.randomUUID();
    const implementId = crypto.randomUUID();
    const qaId = crypto.randomUUID();
    const now = new Date().toISOString();

    db.prepare(
      "INSERT INTO runs (id, workflow_id, task, status, context, created_at, updated_at) VALUES (?, 'retry-wf', 'task', 'running', '{}', ?, ?)"
    ).run(runId, now, now);

    db.prepare(
      "INSERT INTO steps (id, run_id, step_id, agent_id, step_index, input_template, expects, status, retry_count, max_retries, created_at, updated_at) VALUES (?, ?, 'implement', 'retry-wf_developer', 0, '', 'STATUS: done', 'done', 0, 2, ?, ?)"
    ).run(implementId, runId, now, now);

    db.prepare(
      "INSERT INTO steps (id, run_id, step_id, agent_id, step_index, input_template, expects, status, retry_count, max_retries, created_at, updated_at) VALUES (?, ?, 'qa', 'retry-wf_qa', 1, '', 'STATUS: done', 'running', 0, 2, ?, ?)"
    ).run(qaId, runId, now, now);

    const result = completeStep(qaId, "STATUS: retry\nISSUES: runtime crash in booking submit");

    assert.deepEqual(result, { advanced: false, runCompleted: false });

    const implement = db.prepare("SELECT status FROM steps WHERE id = ?").get(implementId) as { status: string };
    const qa = db.prepare("SELECT status, retry_count, output FROM steps WHERE id = ?").get(qaId) as { status: string; retry_count: number; output: string };
    const run = db.prepare("SELECT status, context FROM runs WHERE id = ?").get(runId) as { status: string; context: string };

    assert.equal(implement.status, "pending");
    assert.equal(qa.status, "waiting");
    assert.equal(qa.retry_count, 1);
    assert.match(qa.output, /STATUS: retry/);
    assert.equal(run.status, "running");

    const context = JSON.parse(run.context) as Record<string, string>;
    assert.equal(context.status, "retry");
    assert.equal(context.issues, "runtime crash in booking submit");
    assert.equal(context.verify_feedback, "runtime crash in booking submit");
  });
});
