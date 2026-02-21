import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

describe("completeStep idempotency", () => {
  const originalDbPath = process.env.ANTFARM_DB_PATH;
  let tmpDir: string;

  before(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "antfarm-complete-idempotency-"));
    process.env.ANTFARM_DB_PATH = path.join(tmpDir, "antfarm.db");
    const { getDb } = await import("../dist/db.js");
    getDb();
  });

  after(async () => {
    if (originalDbPath === undefined) delete process.env.ANTFARM_DB_PATH;
    else process.env.ANTFARM_DB_PATH = originalDbPath;
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("ignores duplicate completion for an already-done step", async () => {
    const { getDb } = await import("../dist/db.js");
    const { completeStep } = await import("../dist/installer/step-ops.js");
    const db = getDb();

    const runId = crypto.randomUUID();
    const planId = crypto.randomUUID();
    const setupId = crypto.randomUUID();
    const implementId = crypto.randomUUID();
    const now = new Date().toISOString();

    db.prepare(
      "INSERT INTO runs (id, workflow_id, task, status, context, created_at, updated_at) VALUES (?, 'feature-dev', 'task', 'running', '{}', ?, ?)"
    ).run(runId, now, now);

    db.prepare(
      "INSERT INTO steps (id, run_id, step_id, agent_id, step_index, input_template, expects, status, dispatch_generation, created_at, updated_at, type) VALUES (?, ?, 'plan', 'feature-dev_planner', 0, '', 'STATUS: done', 'running', 1, ?, ?, 'single')"
    ).run(planId, runId, now, now);

    db.prepare(
      "INSERT INTO steps (id, run_id, step_id, agent_id, step_index, input_template, expects, status, dispatch_generation, created_at, updated_at, type) VALUES (?, ?, 'setup', 'feature-dev_setup', 1, '', 'STATUS: done', 'waiting', 0, ?, ?, 'single')"
    ).run(setupId, runId, now, now);

    db.prepare(
      "INSERT INTO steps (id, run_id, step_id, agent_id, step_index, input_template, expects, status, dispatch_generation, created_at, updated_at, type) VALUES (?, ?, 'implement', 'feature-dev_developer', 2, '', 'STATUS: done', 'waiting', 0, ?, ?, 'single')"
    ).run(implementId, runId, now, now);

    const first = completeStep(planId, "STATUS: done");
    assert.equal(first.advanced, true);

    let setup = db.prepare("SELECT status FROM steps WHERE id = ?").get(setupId) as { status: string };
    let implement = db.prepare("SELECT status FROM steps WHERE id = ?").get(implementId) as { status: string };
    assert.equal(setup.status, "pending");
    assert.equal(implement.status, "waiting");

    const second = completeStep(planId, "STATUS: done");
    assert.equal(second.advanced, false);
    assert.equal(second.runCompleted, false);

    setup = db.prepare("SELECT status FROM steps WHERE id = ?").get(setupId) as { status: string };
    implement = db.prepare("SELECT status FROM steps WHERE id = ?").get(implementId) as { status: string };
    assert.equal(setup.status, "pending", "duplicate completion must not advance setup");
    assert.equal(implement.status, "waiting", "duplicate completion must not promote implement");
  });
});

