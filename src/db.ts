import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const DB_DIR = path.join(os.homedir(), ".openclaw", "antfarm");
const DB_PATH = path.join(DB_DIR, "antfarm.db");

let _db: DatabaseSync | null = null;
let _dbOpenedAt = 0;
const DB_MAX_AGE_MS = 5000;

export function getDb(): DatabaseSync {
  const now = Date.now();
  if (_db && (now - _dbOpenedAt) < DB_MAX_AGE_MS) return _db;
  if (_db) { try { _db.close(); } catch {} }

  fs.mkdirSync(DB_DIR, { recursive: true });
  _db = new DatabaseSync(DB_PATH);
  _dbOpenedAt = now;
  _db.exec("PRAGMA journal_mode=WAL");
  _db.exec("PRAGMA foreign_keys=ON");
  migrate(_db);
  return _db;
}

function migrate(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS runs (
      id TEXT PRIMARY KEY,
      workflow_id TEXT NOT NULL,
      task TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'running',
      context TEXT NOT NULL DEFAULT '{}',
      project_key TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS steps (
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
      claimed_at TEXT,
      lease_expires_at TEXT,
      claimant_agent_id TEXT
    );

    CREATE TABLE IF NOT EXISTS stories (
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

  // Add columns to steps table for backwards compat
  const cols = db.prepare("PRAGMA table_info(steps)").all() as Array<{ name: string }>;
  const colNames = new Set(cols.map((c) => c.name));

  if (!colNames.has("type")) {
    db.exec("ALTER TABLE steps ADD COLUMN type TEXT NOT NULL DEFAULT 'single'");
  }
  if (!colNames.has("loop_config")) {
    db.exec("ALTER TABLE steps ADD COLUMN loop_config TEXT");
  }
  if (!colNames.has("current_story_id")) {
    db.exec("ALTER TABLE steps ADD COLUMN current_story_id TEXT");
  }
  if (!colNames.has("claimed_at")) {
    db.exec("ALTER TABLE steps ADD COLUMN claimed_at TEXT");
  }
  if (!colNames.has("lease_expires_at")) {
    db.exec("ALTER TABLE steps ADD COLUMN lease_expires_at TEXT");
  }
  if (!colNames.has("claimant_agent_id")) {
    db.exec("ALTER TABLE steps ADD COLUMN claimant_agent_id TEXT");
  }

  // Add columns to runs table for backwards compat
  const runCols = db.prepare("PRAGMA table_info(runs)").all() as Array<{ name: string }>;
  const runColNames = new Set(runCols.map((c) => c.name));
  if (!runColNames.has("notify_url")) {
    db.exec("ALTER TABLE runs ADD COLUMN notify_url TEXT");
  }
  if (!runColNames.has("project_key")) {
    db.exec("ALTER TABLE runs ADD COLUMN project_key TEXT");
  }

  // DB-level guardrail: prevent out-of-order waiting->pending promotion.
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS steps_block_out_of_order_pending
    BEFORE UPDATE OF status ON steps
    WHEN NEW.status = 'pending' AND OLD.status = 'waiting'
      AND EXISTS (
        SELECT 1
        FROM steps prev
        WHERE prev.run_id = NEW.run_id
          AND prev.step_index < NEW.step_index
          AND prev.status != 'done'
      )
      AND NOT EXISTS (
        SELECT 1
        FROM steps loop
        WHERE loop.run_id = NEW.run_id
          AND loop.type = 'loop'
          AND loop.status = 'running'
          AND json_extract(loop.loop_config, '$.verifyEach') = 1
          AND json_extract(loop.loop_config, '$.verifyStep') = NEW.step_id
      )
    BEGIN
      SELECT RAISE(ABORT, 'invalid step transition: out-of-order pending promotion');
    END;
  `);
}

export function getDbPath(): string {
  return DB_PATH;
}
