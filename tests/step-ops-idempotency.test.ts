import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

type Db = {
  prepare: (sql: string) => {
    run: (...args: unknown[]) => void;
    get: (...args: unknown[]) => unknown;
  };
};

type DbModule = { getDb: () => Db };
type StepOpsModule = {
  completeStep: (stepId: string, output: string) => { advanced: boolean; runCompleted: boolean };
};

const STEP_OPS_URL = pathToFileURL(path.resolve(import.meta.dirname, "../dist/installer/step-ops.js")).href;
const DB_URL = pathToFileURL(path.resolve(import.meta.dirname, "../dist/db.js")).href;

let originalHome: string | undefined;
let tmpHome: string;
let dbModule: DbModule;
let stepOpsModule: StepOpsModule;
let sqlite: Db;

async function loadFreshModules(): Promise<void> {
  const nonce = `${Date.now()}-${Math.random()}`;
  dbModule = await import(`${DB_URL}?v=${nonce}`) as DbModule;
  stepOpsModule = await import(`${STEP_OPS_URL}?v=${nonce}`) as StepOpsModule;
  sqlite = dbModule.getDb();
}

function now(): string {
  return new Date().toISOString();
}

describe("step-ops output validation guards", () => {
  before(async () => {
    originalHome = process.env.HOME;
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "antfarm-idempotency-"));
    process.env.HOME = tmpHome;
    await loadFreshModules();
  });

  beforeEach(() => {
    sqlite.prepare("DELETE FROM stories").run();
    sqlite.prepare("DELETE FROM steps").run();
    sqlite.prepare("DELETE FROM runs").run();
  });

  after(() => {
    if (originalHome !== undefined) {
      process.env.HOME = originalHome;
    } else {
      delete process.env.HOME;
    }
    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  it("fails setup completion early when BUILD_CMD/TEST_CMD are missing", () => {
    const runId = crypto.randomUUID();
    const stepId = crypto.randomUUID();
    const t = now();

    sqlite.prepare(
      "INSERT INTO runs (id, workflow_id, task, status, context, created_at, updated_at) VALUES (?, 'feature-dev', 'task', 'running', '{\"repo\":\"/tmp/repo\",\"branch\":\"feature/x\"}', ?, ?)"
    ).run(runId, t, t);
    sqlite.prepare(
      "INSERT INTO steps (id, run_id, step_id, agent_id, step_index, input_template, expects, status, type, created_at, updated_at) VALUES (?, ?, 'setup', 'feature-dev_setup', 1, 'input', 'STATUS: done', 'running', 'single', ?, ?)"
    ).run(stepId, runId, t, t);

    const result = stepOpsModule.completeStep(stepId, "STATUS: done\nCI_NOTES: baseline checked");
    assert.deepEqual(result, { advanced: false, runCompleted: false });

    const step = sqlite.prepare("SELECT status, output FROM steps WHERE id = ?").get(stepId) as { status: string; output: string };
    assert.equal(step.status, "failed");
    assert.match(step.output, /missing required key\(s\) build_cmd, test_cmd/);

    const run = sqlite.prepare("SELECT status FROM runs WHERE id = ?").get(runId) as { status: string };
    assert.equal(run.status, "failed");
  });

  it("fails completion when output is empty and required STATUS key is missing", () => {
    const runId = crypto.randomUUID();
    const stepId = crypto.randomUUID();
    const t = now();

    sqlite.prepare(
      "INSERT INTO runs (id, workflow_id, task, status, context, created_at, updated_at) VALUES (?, 'feature-dev', 'task', 'running', '{}', ?, ?)"
    ).run(runId, t, t);
    sqlite.prepare(
      "INSERT INTO steps (id, run_id, step_id, agent_id, step_index, input_template, expects, status, type, created_at, updated_at) VALUES (?, ?, 'plan', 'feature-dev_planner', 0, 'input', 'STATUS: done', 'running', 'single', ?, ?)"
    ).run(stepId, runId, t, t);

    const result = stepOpsModule.completeStep(stepId, "");
    assert.deepEqual(result, { advanced: false, runCompleted: false });

    const step = sqlite.prepare("SELECT status, output FROM steps WHERE id = ?").get(stepId) as { status: string; output: string };
    assert.equal(step.status, "failed");
    assert.match(step.output, /missing required key\(s\) status/);

    const run = sqlite.prepare("SELECT status FROM runs WHERE id = ?").get(runId) as { status: string };
    assert.equal(run.status, "failed");
  });

  it("fails plan completion when REPO/BRANCH keys are missing", () => {
    const runId = crypto.randomUUID();
    const stepId = crypto.randomUUID();
    const t = now();

    sqlite.prepare(
      "INSERT INTO runs (id, workflow_id, task, status, context, created_at, updated_at) VALUES (?, 'feature-dev', 'task', 'running', '{}', ?, ?)"
    ).run(runId, t, t);
    sqlite.prepare(
      "INSERT INTO steps (id, run_id, step_id, agent_id, step_index, input_template, expects, status, type, created_at, updated_at) VALUES (?, ?, 'plan', 'feature-dev_planner', 0, 'input', 'STATUS: done', 'running', 'single', ?, ?)"
    ).run(stepId, runId, t, t);

    const result = stepOpsModule.completeStep(stepId, "STATUS: done");
    assert.deepEqual(result, { advanced: false, runCompleted: false });

    const step = sqlite.prepare("SELECT status, output FROM steps WHERE id = ?").get(stepId) as { status: string; output: string };
    assert.equal(step.status, "failed");
    assert.match(step.output, /missing required key\(s\) repo, branch/);

    const run = sqlite.prepare("SELECT status FROM runs WHERE id = ?").get(runId) as { status: string };
    assert.equal(run.status, "failed");
  });
});
