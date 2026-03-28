import { describe, it } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import crypto from "node:crypto";
import { DatabaseSync } from "node:sqlite";

const DIST_STEP_OPS = "../dist/installer/step-ops.js";

type StepOpsModule = typeof import("../src/installer/step-ops.js");

async function freshStepOps(dbPath: string): Promise<StepOpsModule> {
  process.env.ANTFARM_DB_PATH = dbPath;
  return import(`${DIST_STEP_OPS}?t=${Date.now()}-${Math.random()}`);
}

function createDb(dbPath: string): DatabaseSync {
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA foreign_keys=ON");
  db.exec(`
    CREATE TABLE runs (
      id TEXT PRIMARY KEY,
      workflow_id TEXT NOT NULL,
      task TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'running',
      context TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE steps (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL REFERENCES runs(id),
      step_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      step_index INTEGER NOT NULL,
      input_template TEXT NOT NULL,
      expects TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'waiting',
      output TEXT,
      retry_count INTEGER DEFAULT 0,
      max_retries INTEGER DEFAULT 2,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'single',
      loop_config TEXT,
      current_story_id TEXT,
      abandoned_count INTEGER DEFAULT 0
    );

    CREATE TABLE stories (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL REFERENCES runs(id),
      story_index INTEGER NOT NULL,
      story_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      acceptance_criteria TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      output TEXT,
      retry_count INTEGER DEFAULT 0,
      max_retries INTEGER DEFAULT 2,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  return db;
}

describe("claimStep verify_feedback defaults", () => {
  it("claims retry-capable single steps even before verify_feedback exists", async () => {
    const dbPath = path.join(os.tmpdir(), `antfarm-claim-step-${crypto.randomUUID()}.db`);
    const db = createDb(dbPath);
    const runId = crypto.randomUUID();
    const stepId = crypto.randomUUID();
    const t = new Date().toISOString();

    db.prepare(
      "INSERT INTO runs (id, workflow_id, task, status, context, created_at, updated_at) VALUES (?, 'bug-fix', 'task', 'running', ?, ?, ?)"
    ).run(runId, JSON.stringify({
      repo: "/tmp/repo",
      branch: "bugfix-branch",
      build_cmd: "npm run build",
      test_cmd: "npm test",
      affected_area: "src/app.ts",
      root_cause: "bad conditional",
      fix_approach: "tighten guard",
      problem_statement: "bug repro",
    }), t, t);

    db.prepare(
      "INSERT INTO steps (id, run_id, step_id, agent_id, step_index, input_template, expects, status, created_at, updated_at) VALUES (?, ?, 'fix', 'bug-fix_fixer', 3, ?, 'STATUS: done', 'pending', ?, ?)"
    ).run(stepId, runId, `REPO: {{repo}}\nVERIFY FEEDBACK: {{verify_feedback}}\nROOT CAUSE: {{root_cause}}`, t, t);

    db.close();

    try {
      const stepOps = await freshStepOps(dbPath);
      const claim = stepOps.claimStep("bug-fix_fixer");
      assert.equal(claim.found, true);
      assert.equal(claim.stepId, stepId);
      assert.match(claim.resolvedInput ?? "", /VERIFY FEEDBACK:\s*\nROOT CAUSE: bad conditional/);

      const verifyDb = new DatabaseSync(dbPath);
      const row = verifyDb.prepare("SELECT status FROM steps WHERE id = ?").get(stepId) as { status: string };
      assert.equal(row.status, "running");
      verifyDb.close();
    } finally {
      delete process.env.ANTFARM_DB_PATH;
      fs.unlinkSync(dbPath);
    }
  });
});
