import { DatabaseSync } from "node:sqlite";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

function createDb(dbPath: string): DatabaseSync {
  const db = new DatabaseSync(dbPath);
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
  `);
  return db;
}

describe("installWorkflow active run guard", () => {
  it("refuses to reinstall a workflow while active runs exist", async () => {
    const dbPath = path.join(os.tmpdir(), `antfarm-install-guard-${crypto.randomUUID()}.db`);
    const db = createDb(dbPath);
    db.prepare(
      "INSERT INTO runs (id, workflow_id, task, status, context, created_at, updated_at) VALUES (?, 'feature-dev', ?, 'running', '{}', datetime('now', '-1 hour'), datetime('now'))"
    ).run("run-active", "verification run still in flight");
    db.close();

    process.env.ANTFARM_DB_PATH = dbPath;

    try {
      const installMod = await import(`../dist/installer/install.js?test=${Date.now()}-${Math.random()}`);
      await assert.rejects(
        () => installMod.installWorkflow({ workflowId: "feature-dev" }),
        /Cannot install workflow "feature-dev" while 1 active run\(s\) exist/
      );
    } finally {
      delete process.env.ANTFARM_DB_PATH;
      fs.unlinkSync(dbPath);
    }
  });
});
