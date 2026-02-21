import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";

const WORKFLOW_YAML = `
id: test-e2e-handoff
name: Test E2E Handoff
version: 1
handoff:
  mode: event
  maxDispatchRetries: 5
  retryBaseMs: 25
agents:
  - id: a
    workspace:
      baseDir: agents/a
      files:
        AGENTS.md: agents/a/AGENTS.md
  - id: b
    workspace:
      baseDir: agents/b
      files:
        AGENTS.md: agents/b/AGENTS.md
steps:
  - id: first
    agent: a
    input: "first {{task}}"
    expects: "STATUS: done"
  - id: second
    agent: b
    input: "second {{task}}"
    expects: "STATUS: done"
`;

async function waitFor<T>(fn: () => T, predicate: (value: T) => boolean, timeoutMs = 3000): Promise<T> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const value = fn();
    if (predicate(value)) return value;
    await new Promise((r) => setTimeout(r, 25));
  }
  return fn();
}

describe("event handoff e2e run", () => {
  let tmpDir: string;
  const prevStateDir = process.env.OPENCLAW_STATE_DIR;
  const prevDbPath = process.env.ANTFARM_DB_PATH;

  before(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "antfarm-e2e-run-"));
    process.env.OPENCLAW_STATE_DIR = tmpDir;
    process.env.ANTFARM_DB_PATH = path.join(tmpDir, "antfarm-e2e.db");

    const workflowDir = path.join(tmpDir, "antfarm", "workflows", "test-e2e-handoff");
    await fs.mkdir(workflowDir, { recursive: true });
    await fs.writeFile(path.join(workflowDir, "workflow.yml"), WORKFLOW_YAML, "utf-8");
  });

  after(async () => {
    const { setSpawnSessionOverrideForTests } = await import("../dist/installer/gateway-api.js");
    const { resetHandoffCache } = await import("../dist/installer/handoff.js");
    setSpawnSessionOverrideForTests(null);
    resetHandoffCache();

    if (prevStateDir !== undefined) process.env.OPENCLAW_STATE_DIR = prevStateDir;
    else delete process.env.OPENCLAW_STATE_DIR;
    if (prevDbPath !== undefined) process.env.ANTFARM_DB_PATH = prevDbPath;
    else delete process.env.ANTFARM_DB_PATH;
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("completes a full two-step run via immediate event dispatch", async () => {
    const { getDb } = await import("../dist/db.js");
    const { dispatchNextPendingStep } = await import("../dist/installer/step-dispatch.js");
    const { setSpawnSessionOverrideForTests } = await import("../dist/installer/gateway-api.js");
    const { completeStep } = await import("../dist/installer/step-ops.js");

    const db = getDb();
    const runId = crypto.randomUUID();
    const now = new Date().toISOString();

    db.prepare(
      "INSERT INTO runs (id, workflow_id, task, status, context, created_at, updated_at) VALUES (?, 'test-e2e-handoff', 'ship feature', 'running', '{\"task\":\"ship feature\"}', ?, ?)"
    ).run(runId, now, now);

    const firstStep = crypto.randomUUID();
    const secondStep = crypto.randomUUID();
    db.prepare(
      "INSERT INTO steps (id, run_id, step_id, agent_id, step_index, input_template, expects, status, dispatch_generation, created_at, updated_at, type) VALUES (?, ?, 'first', 'test-e2e-handoff_a', 0, 'first {{task}}', 'STATUS: done', 'pending', 1, ?, ?, 'single')"
    ).run(firstStep, runId, now, now);
    db.prepare(
      "INSERT INTO steps (id, run_id, step_id, agent_id, step_index, input_template, expects, status, dispatch_generation, created_at, updated_at, type) VALUES (?, ?, 'second', 'test-e2e-handoff_b', 1, 'second {{task}}', 'STATUS: done', 'waiting', 0, ?, ?, 'single')"
    ).run(secondStep, runId, now, now);

    setSpawnSessionOverrideForTests(async ({ task }) => {
      const marker = "CLAIMED STEP JSON:\n";
      const idx = task.lastIndexOf(marker);
      assert.ok(idx >= 0, "spawn task should include claimed step JSON");
      const jsonText = task.slice(idx + marker.length).trim();
      const claimed = JSON.parse(jsonText) as { stepId: string };
      completeStep(claimed.stepId, "STATUS: done\nCHANGES: auto\nTESTS: auto");
      return { ok: true, childSessionKey: `agent:mock:subagent:${crypto.randomUUID()}` };
    });

    await dispatchNextPendingStep(runId, "test");

    const run = await waitFor(
      () => db.prepare("SELECT status FROM runs WHERE id = ?").get(runId) as { status: string },
      (r) => r.status === "completed"
    );
    assert.equal(run.status, "completed");

    const steps = db.prepare("SELECT step_id, status FROM steps WHERE run_id = ? ORDER BY step_index ASC").all(runId) as Array<{ step_id: string; status: string }>;
    assert.equal(steps.length, 2);
    assert.equal(steps[0].step_id, "first");
    assert.equal(steps[0].status, "done");
    assert.equal(steps[1].step_id, "second");
    assert.equal(steps[1].status, "done");
  });
});
