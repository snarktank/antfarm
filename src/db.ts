import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

let _db: DatabaseSync | null = null;
let _dbOpenedAt = 0;
let _dbPath: string | null = null;
const DB_MAX_AGE_MS = 5000;

function resolveDbPath(): string {
  const env = process.env.ANTFARM_DB_PATH?.trim();
  if (env) return env;
  return path.join(os.homedir(), ".openclaw", "antfarm", "antfarm.db");
}

export function getDb(): DatabaseSync {
  const now = Date.now();
  const dbPath = resolveDbPath();
  if (_db && _dbPath === dbPath && (now - _dbOpenedAt) < DB_MAX_AGE_MS) return _db;
  if (_db) { try { _db.close(); } catch {} }

  const dbDir = path.dirname(dbPath);
  fs.mkdirSync(dbDir, { recursive: true });
  _db = new DatabaseSync(dbPath);
  _dbPath = dbPath;
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
      updated_at TEXT NOT NULL
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

    CREATE TABLE IF NOT EXISTS step_dispatches (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL REFERENCES runs(id),
      step_uuid TEXT NOT NULL REFERENCES steps(id),
      step_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      dispatch_generation INTEGER NOT NULL,
      idempotency_key TEXT NOT NULL,
      dispatch_attempt INTEGER NOT NULL DEFAULT 1,
      dispatch_status TEXT NOT NULL,
      child_session_key TEXT,
      last_error TEXT,
      next_retry_at TEXT,
      claimed_at TEXT,
      spawned_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_step_dispatches_unique_gen ON step_dispatches(run_id, step_uuid, dispatch_generation)");
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_step_dispatches_idempotency ON step_dispatches(idempotency_key)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_step_dispatches_retry ON step_dispatches(dispatch_status, next_retry_at)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_step_dispatches_step ON step_dispatches(run_id, step_uuid)");

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
  if (!colNames.has("abandoned_count")) {
    db.exec("ALTER TABLE steps ADD COLUMN abandoned_count INTEGER DEFAULT 0");
  }
  if (!colNames.has("dispatch_generation")) {
    db.exec("ALTER TABLE steps ADD COLUMN dispatch_generation INTEGER NOT NULL DEFAULT 0");
  }

  // Add columns to runs table for backwards compat
  const runCols = db.prepare("PRAGMA table_info(runs)").all() as Array<{ name: string }>;
  const runColNames = new Set(runCols.map((c) => c.name));
  if (!runColNames.has("notify_url")) {
    db.exec("ALTER TABLE runs ADD COLUMN notify_url TEXT");
  }
  if (!runColNames.has("run_number")) {
    db.exec("ALTER TABLE runs ADD COLUMN run_number INTEGER");
    // Backfill existing runs with sequential numbers based on creation order
    db.exec(`
      UPDATE runs SET run_number = (
        SELECT COUNT(*) FROM runs r2 WHERE r2.created_at <= runs.created_at
      ) WHERE run_number IS NULL
    `);
  }
}

export function nextRunNumber(): number {
  const db = getDb();
  const row = db.prepare("SELECT COALESCE(MAX(run_number), 0) + 1 AS next FROM runs").get() as { next: number };
  return row.next;
}

export function getDbPath(): string {
  return resolveDbPath();
}
