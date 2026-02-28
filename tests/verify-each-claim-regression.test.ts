import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

type ClaimResult = {
  found: boolean;
  stepId?: string;
  runId?: string;
  resolvedInput?: string;
};

type DbModule = {
  getDb: () => {
    prepare: (sql: string) => {
      run: (...args: unknown[]) => void;
      get: (...args: unknown[]) => unknown;
    };
  };
};

type StepOpsModule = {
  claimStep: (agentId: string) => ClaimResult;
};

const STEP_OPS_URL = pathToFileURL(path.resolve(import.meta.dirname, "../dist/installer/step-ops.js")).href;
const DB_URL = pathToFileURL(path.resolve(import.meta.dirname, "../dist/db.js")).href;

let originalHome: string | undefined;
let tmpHome: string;
let dbModule: DbModule;
let stepOpsModule: StepOpsModule;
let sqlite: ReturnType<DbModule["getDb"]>;

async function loadFreshModules(): Promise<void> {
  const nonce = `${Date.now()}-${Math.random()}`;
  dbModule = await import(`${DB_URL}?v=${nonce}`) as DbModule;
  stepOpsModule = await import(`${STEP_OPS_URL}?v=${nonce}`) as StepOpsModule;
  sqlite = dbModule.getDb();
}

function now(): string {
  return new Date().toISOString();
}

describe("claimStep verify_each regression", () => {
  before(async () => {
    originalHome = process.env.HOME;
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "antfarm-verify-each-"));
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

  it("allows verify step claim when preceding loop is running and waiting for verify_each", async () => {
    const runId = crypto.randomUUID();
    const t = now();
    const implementDbId = crypto.randomUUID();
    const verifyDbId = crypto.randomUUID();

    sqlite.prepare(
      "INSERT INTO runs (id, workflow_id, task, status, context, created_at, updated_at) VALUES (?, 'feature-dev', 'task', 'running', '{}', ?, ?)"
    ).run(runId, t, t);

    sqlite.prepare(
      "INSERT INTO steps (id, run_id, step_id, agent_id, step_index, input_template, expects, status, type, loop_config, current_story_id, created_at, updated_at) VALUES (?, ?, 'implement', 'feature-dev_developer', 2, 'implement', 'STATUS: done', 'running', 'loop', ?, NULL, ?, ?)"
    ).run(
      implementDbId,
      runId,
      JSON.stringify({ over: "stories", completion: "all_done", verifyEach: true, verifyStep: "verify" }),
      t,
      t
    );

    sqlite.prepare(
      "INSERT INTO steps (id, run_id, step_id, agent_id, step_index, input_template, expects, status, type, created_at, updated_at) VALUES (?, ?, 'verify', 'feature-dev_verifier', 3, 'verify-input', 'STATUS: done', 'pending', 'single', ?, ?)"
    ).run(verifyDbId, runId, t, t);

    const result = stepOpsModule.claimStep("feature-dev_verifier");

    assert.equal(result.found, true);
    assert.equal(result.stepId, verifyDbId);
    assert.equal(result.runId, runId);
  });

  it("does not bypass other pending steps that are unrelated to verify_each", async () => {
    const runId = crypto.randomUUID();
    const t = now();
    const implementDbId = crypto.randomUUID();
    const reviewDbId = crypto.randomUUID();

    sqlite.prepare(
      "INSERT INTO runs (id, workflow_id, task, status, context, created_at, updated_at) VALUES (?, 'feature-dev', 'task', 'running', '{}', ?, ?)"
    ).run(runId, t, t);

    sqlite.prepare(
      "INSERT INTO steps (id, run_id, step_id, agent_id, step_index, input_template, expects, status, type, loop_config, current_story_id, created_at, updated_at) VALUES (?, ?, 'implement', 'feature-dev_developer', 2, 'implement', 'STATUS: done', 'running', 'loop', ?, NULL, ?, ?)"
    ).run(
      implementDbId,
      runId,
      JSON.stringify({ over: "stories", completion: "all_done", verifyEach: true, verifyStep: "verify" }),
      t,
      t
    );

    sqlite.prepare(
      "INSERT INTO steps (id, run_id, step_id, agent_id, step_index, input_template, expects, status, type, created_at, updated_at) VALUES (?, ?, 'review', 'feature-dev_reviewer', 6, 'review-input', 'STATUS: done', 'pending', 'single', ?, ?)"
    ).run(reviewDbId, runId, t, t);

    const result = stepOpsModule.claimStep("feature-dev_reviewer");
    assert.equal(result.found, false);
  });
});
