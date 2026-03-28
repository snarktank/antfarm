import { DatabaseSync } from "node:sqlite";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function createTestDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
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

const STALL_THRESHOLD_MS = (1800 + 5 * 60) * 1000 * 2;

function findStalledRuns(db: DatabaseSync): Array<{ id: string; last_step_update: string }> {
  return db.prepare(`
    SELECT r.id,
           (
             SELECT s2.updated_at
             FROM steps s2
             WHERE s2.run_id = r.id
             ORDER BY julianday(s2.updated_at) DESC, s2.updated_at DESC
             LIMIT 1
           ) as last_step_update
    FROM runs r
    WHERE r.status = 'running'
      AND (
        SELECT MAX(julianday(s.updated_at))
        FROM steps s
        WHERE s.run_id = r.id
      ) IS NOT NULL
      AND (julianday('now') - (
        SELECT MAX(julianday(s.updated_at))
        FROM steps s
        WHERE s.run_id = r.id
      )) * 86400000 > ?
  `).all(STALL_THRESHOLD_MS) as Array<{ id: string; last_step_update: string }>;
}

async function loadChecksModule(dbPath: string) {
  process.env.ANTFARM_DB_PATH = dbPath;
  return import(`../dist/medic/checks.js?test=${Date.now()}-${Math.random()}`);
}

describe('medic stalled run detection', () => {
  it('uses the newest step by actual timestamp when formats are mixed', () => {
    const db = createTestDb();
    db.prepare(
      "INSERT INTO runs (id, workflow_id, task, status, context, created_at, updated_at) VALUES ('run-1', 'feature-dev', 'task', 'running', '{}', datetime('now', '-8 hours'), datetime('now'))"
    ).run();

    db.prepare(
      "INSERT INTO steps (id, run_id, step_id, agent_id, step_index, input_template, expects, status, created_at, updated_at) VALUES ('step-old', 'run-1', 'plan', 'planner', 0, '', '', 'done', datetime('now', '-8 hours'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-6 hours'))"
    ).run();

    db.prepare(
      "INSERT INTO steps (id, run_id, step_id, agent_id, step_index, input_template, expects, status, created_at, updated_at) VALUES ('step-fresh', 'run-1', 'verify', 'verifier', 1, '', '', 'pending', datetime('now', '-10 minutes'), datetime('now', '-10 minutes'))"
    ).run();

    const stalled = findStalledRuns(db);
    assert.equal(stalled.length, 0, 'fresh sqlite timestamp should prevent false stalled-run alarms');
  });

  it('still flags genuinely stale runs', () => {
    const db = createTestDb();
    db.prepare(
      "INSERT INTO runs (id, workflow_id, task, status, context, created_at, updated_at) VALUES ('run-2', 'security-audit', 'task', 'running', '{}', datetime('now', '-8 hours'), datetime('now', '-8 hours'))"
    ).run();

    db.prepare(
      "INSERT INTO steps (id, run_id, step_id, agent_id, step_index, input_template, expects, status, created_at, updated_at) VALUES ('step-stale', 'run-2', 'fix', 'fixer', 0, '', '', 'running', datetime('now', '-8 hours'), datetime('now', '-3 hours'))"
    ).run();

    const stalled = findStalledRuns(db);
    assert.equal(stalled.length, 1);
    assert.equal(stalled[0].id, 'run-2');
  });

  it('does not flag a verify_each loop parked while verify is active', async () => {
    const dbPath = path.join(os.tmpdir(), `antfarm-medic-checks-${Date.now()}-${Math.random()}.db`);
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

    db.prepare(
      "INSERT INTO runs (id, workflow_id, task, status, context, created_at, updated_at) VALUES ('run-loop', 'feature-dev', 'task', 'running', '{}', datetime('now', '-2 hours'), datetime('now', '-10 minutes'))"
    ).run();

    db.prepare(
      "INSERT INTO steps (id, run_id, step_id, agent_id, step_index, input_template, expects, status, created_at, updated_at, type, loop_config, current_story_id) VALUES ('loop-step', 'run-loop', 'implement', 'feature-dev_developer', 0, '', '', 'running', datetime('now', '-2 hours'), datetime('now', '-40 minutes'), 'loop', ?, NULL)"
    ).run('{"verifyEach":true,"verifyStep":"verify"}');

    db.prepare(
      "INSERT INTO steps (id, run_id, step_id, agent_id, step_index, input_template, expects, status, created_at, updated_at, type) VALUES ('verify-step', 'run-loop', 'verify', 'feature-dev_verifier', 1, '', '', 'running', datetime('now', '-45 minutes'), datetime('now', '-5 minutes'), 'single')"
    ).run();

    db.close();

    try {
      const checks = await loadChecksModule(dbPath);
      const findings = checks.checkStuckSteps();
      assert.deepEqual(findings, []);
    } finally {
      delete process.env.ANTFARM_DB_PATH;
      fs.unlinkSync(dbPath);
    }
  });

  it('does not flag a verify_each loop parked while verify is waiting for the next cycle', async () => {
    const dbPath = path.join(os.tmpdir(), `antfarm-medic-waiting-${Date.now()}-${Math.random()}.db`);
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

    db.prepare(
      "INSERT INTO runs (id, workflow_id, task, status, context, created_at, updated_at) VALUES ('run-wait', 'feature-dev', 'task', 'running', '{}', datetime('now', '-2 hours'), datetime('now', '-10 minutes'))"
    ).run();

    db.prepare(
      "INSERT INTO steps (id, run_id, step_id, agent_id, step_index, input_template, expects, status, created_at, updated_at, type, loop_config, current_story_id) VALUES ('loop-step', 'run-wait', 'implement', 'feature-dev_developer', 0, '', '', 'running', datetime('now', '-2 hours'), datetime('now', '-40 minutes'), 'loop', ?, NULL)"
    ).run('{"verifyEach":true,"verifyStep":"verify"}');

    db.prepare(
      "INSERT INTO steps (id, run_id, step_id, agent_id, step_index, input_template, expects, status, created_at, updated_at, type) VALUES ('verify-step', 'run-wait', 'verify', 'feature-dev_verifier', 1, '', '', 'waiting', datetime('now', '-45 minutes'), datetime('now', '-35 minutes'), 'single')"
    ).run();

    db.close();

    try {
      const checks = await loadChecksModule(dbPath);
      const findings = checks.checkStuckSteps();
      assert.deepEqual(findings, []);
    } finally {
      delete process.env.ANTFARM_DB_PATH;
      fs.unlinkSync(dbPath);
    }
  });
});
