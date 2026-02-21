import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

const WORKFLOW_YAML = `
id: test-handoff
name: Test Handoff
version: 1
handoff:
  mode: event
  maxDispatchRetries: 5
  retryBaseMs: 50
agents:
  - id: dev
    workspace:
      baseDir: agents/dev
      files:
        AGENTS.md: agents/dev/AGENTS.md
steps:
  - id: implement
    agent: dev
    input: "do work {{task}}"
    expects: "STATUS: done"
`;

describe("step dispatch", () => {
  let tmpDir: string;
  const prevStateDir = process.env.OPENCLAW_STATE_DIR;
  const prevDbPath = process.env.ANTFARM_DB_PATH;

  before(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "antfarm-dispatch-test-"));
    process.env.OPENCLAW_STATE_DIR = tmpDir;
    process.env.ANTFARM_DB_PATH = path.join(tmpDir, "antfarm-test.db");

    const workflowDir = path.join(tmpDir, "antfarm", "workflows", "test-handoff");
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

  it("dedupes duplicate dispatch triggers for the same step generation", async () => {
    const { getDb } = await import("../dist/db.js");
    const { dispatchNextPendingStep } = await import("../dist/installer/step-dispatch.js");
    const { setSpawnSessionOverrideForTests } = await import("../dist/installer/gateway-api.js");

    const db = getDb();
    const runId = crypto.randomUUID();
    const stepUuid = crypto.randomUUID();
    const now = new Date().toISOString();

    db.prepare(
      "INSERT INTO runs (id, workflow_id, task, status, context, created_at, updated_at) VALUES (?, 'test-handoff', 'task', 'running', '{}', ?, ?)"
    ).run(runId, now, now);
    db.prepare(
      "INSERT INTO steps (id, run_id, step_id, agent_id, step_index, input_template, expects, status, dispatch_generation, created_at, updated_at) VALUES (?, ?, 'implement', 'test-handoff_dev', 0, 'do work {{task}}', 'STATUS: done', 'pending', 1, ?, ?)"
    ).run(stepUuid, runId, now, now);

    setSpawnSessionOverrideForTests(async () => ({ ok: true, childSessionKey: "agent:test-handoff_dev:subagent:abc" }));

    await dispatchNextPendingStep(runId, "test");
    await dispatchNextPendingStep(runId, "test");

    const dispatchRows = db.prepare("SELECT dispatch_status FROM step_dispatches WHERE run_id = ?").all(runId) as Array<{ dispatch_status: string }>;
    assert.equal(dispatchRows.length, 1);
    assert.equal(dispatchRows[0].dispatch_status, "spawned");
  });

  it("retries failed dispatch and succeeds on reconcile", async () => {
    const { getDb } = await import("../dist/db.js");
    const { dispatchNextPendingStep, reconcileDispatches } = await import("../dist/installer/step-dispatch.js");
    const { setSpawnSessionOverrideForTests } = await import("../dist/installer/gateway-api.js");

    const db = getDb();
    const runId = crypto.randomUUID();
    const stepUuid = crypto.randomUUID();
    const now = new Date().toISOString();

    db.prepare(
      "INSERT INTO runs (id, workflow_id, task, status, context, created_at, updated_at) VALUES (?, 'test-handoff', 'task', 'running', '{}', ?, ?)"
    ).run(runId, now, now);
    db.prepare(
      "INSERT INTO steps (id, run_id, step_id, agent_id, step_index, input_template, expects, status, dispatch_generation, created_at, updated_at) VALUES (?, ?, 'implement', 'test-handoff_dev', 0, 'do work {{task}}', 'STATUS: done', 'pending', 1, ?, ?)"
    ).run(stepUuid, runId, now, now);

    let calls = 0;
    setSpawnSessionOverrideForTests(async () => {
      calls += 1;
      if (calls === 1) return { ok: false, error: "gateway down" };
      return { ok: true, childSessionKey: "agent:test-handoff_dev:subagent:retry-ok" };
    });

    await dispatchNextPendingStep(runId, "test");

    const first = db.prepare(
      "SELECT dispatch_status, dispatch_attempt, next_retry_at FROM step_dispatches WHERE run_id = ?"
    ).get(runId) as { dispatch_status: string; dispatch_attempt: number; next_retry_at: string | null };
    assert.equal(first.dispatch_status, "retrying");
    assert.equal(first.dispatch_attempt, 1);
    assert.ok(first.next_retry_at);

    db.prepare("UPDATE step_dispatches SET next_retry_at = ? WHERE run_id = ?").run(new Date(Date.now() - 1000).toISOString(), runId);
    await reconcileDispatches();

    const second = db.prepare(
      "SELECT dispatch_status, dispatch_attempt FROM step_dispatches WHERE run_id = ?"
    ).get(runId) as { dispatch_status: string; dispatch_attempt: number };
    assert.equal(second.dispatch_status, "spawned");
    assert.equal(second.dispatch_attempt, 2);
  });
});
