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
  failStep: (stepId: string, error: string) => Promise<{ retrying: boolean; runFailed: boolean }>;
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

describe("step-ops idempotency guards", () => {
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

  it("completeStep is a no-op when step is not running", () => {
    const runId = crypto.randomUUID();
    const stepId = crypto.randomUUID();
    const t = now();

    sqlite.prepare(
      "INSERT INTO runs (id, workflow_id, task, status, context, created_at, updated_at) VALUES (?, 'wf', 'task', 'running', '{}', ?, ?)"
    ).run(runId, t, t);
    sqlite.prepare(
      "INSERT INTO steps (id, run_id, step_id, agent_id, step_index, input_template, expects, status, type, created_at, updated_at) VALUES (?, ?, 'plan', 'wf_planner', 0, 'input', 'STATUS: done', 'done', 'single', ?, ?)"
    ).run(stepId, runId, t, t);

    const result = stepOpsModule.completeStep(stepId, "STATUS: done\nCHANGES: duplicate completion");
    assert.deepEqual(result, { advanced: false, runCompleted: false });

    const run = sqlite.prepare("SELECT context FROM runs WHERE id = ?").get(runId) as { context: string };
    assert.equal(run.context, "{}", "run context must remain unchanged");
  });

  it("failStep is a no-op for already-completed steps", async () => {
    const runId = crypto.randomUUID();
    const stepId = crypto.randomUUID();
    const t = now();

    sqlite.prepare(
      "INSERT INTO runs (id, workflow_id, task, status, context, created_at, updated_at) VALUES (?, 'wf', 'task', 'running', '{}', ?, ?)"
    ).run(runId, t, t);
    sqlite.prepare(
      "INSERT INTO steps (id, run_id, step_id, agent_id, step_index, input_template, expects, status, retry_count, max_retries, type, created_at, updated_at) VALUES (?, ?, 'verify', 'wf_verifier', 1, 'input', 'STATUS: done', 'done', 0, 2, 'single', ?, ?)"
    ).run(stepId, runId, t, t);

    const result = await stepOpsModule.failStep(stepId, "late failure");
    assert.deepEqual(result, { retrying: false, runFailed: false });

    const run = sqlite.prepare("SELECT status FROM runs WHERE id = ?").get(runId) as { status: string };
    assert.equal(run.status, "running", "run must not be failed by a late failStep");
  });

  it("STORIES_JSON insertion is idempotent for same payload and rejects different payloads", () => {
    const runId = crypto.randomUUID();
    const t = now();
    const stepA = crypto.randomUUID();
    const stepB = crypto.randomUUID();
    const stepC = crypto.randomUUID();
    const stepD = crypto.randomUUID();

    sqlite.prepare(
      "INSERT INTO runs (id, workflow_id, task, status, context, created_at, updated_at) VALUES (?, 'wf', 'task', 'running', '{}', ?, ?)"
    ).run(runId, t, t);

    sqlite.prepare(
      "INSERT INTO steps (id, run_id, step_id, agent_id, step_index, input_template, expects, status, type, created_at, updated_at) VALUES (?, ?, 'plan-a', 'wf_planner', 0, 'input', 'STATUS: done', 'running', 'single', ?, ?)"
    ).run(stepA, runId, t, t);
    sqlite.prepare(
      "INSERT INTO steps (id, run_id, step_id, agent_id, step_index, input_template, expects, status, type, created_at, updated_at) VALUES (?, ?, 'plan-b', 'wf_planner', 1, 'input', 'STATUS: done', 'running', 'single', ?, ?)"
    ).run(stepB, runId, t, t);
    sqlite.prepare(
      "INSERT INTO steps (id, run_id, step_id, agent_id, step_index, input_template, expects, status, type, created_at, updated_at) VALUES (?, ?, 'plan-c', 'wf_planner', 2, 'input', 'STATUS: done', 'running', 'single', ?, ?)"
    ).run(stepC, runId, t, t);
    sqlite.prepare(
      "INSERT INTO steps (id, run_id, step_id, agent_id, step_index, input_template, expects, status, type, created_at, updated_at) VALUES (?, ?, 'plan-d', 'wf_planner', 3, 'input', 'STATUS: done', 'running', 'single', ?, ?)"
    ).run(stepD, runId, t, t);

    const payloadA = `STATUS: done\nSTORIES_JSON: [{"id":"US-001","title":"T1","description":"D1","acceptanceCriteria":["A1"]}]`;
    const payloadB = `STATUS: done\nSTORIES_JSON: [{"id":"US-999","title":"T2","description":"D2","acceptanceCriteria":["A2"]}]`;
    const payloadC = `STATUS: done\nSTORIES_JSON: [{"id":"US-001","title":"T1 updated","description":"D1 updated","acceptanceCriteria":["A1","A2"]}]`;

    stepOpsModule.completeStep(stepA, payloadA);
    stepOpsModule.completeStep(stepB, payloadA); // idempotent re-submission should no-op

    const storyCount = sqlite.prepare("SELECT COUNT(*) as cnt FROM stories WHERE run_id = ?").get(runId) as { cnt: number };
    assert.equal(storyCount.cnt, 1);

    assert.throws(
      () => stepOpsModule.completeStep(stepC, payloadB),
      /Run already has stories; refusing to append a different STORIES_JSON payload/
    );
    assert.throws(
      () => stepOpsModule.completeStep(stepD, payloadC),
      /Run already has stories; refusing to append a different STORIES_JSON payload/
    );
  });
});
