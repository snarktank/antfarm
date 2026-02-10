import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const DEFAULT_DB_DIR = path.join(os.homedir(), ".openclaw", "antfarm");

function resolveDbPath(): string {
  const envPath = process.env.ANTFARM_DB_PATH?.trim();
  if (envPath) return path.resolve(envPath);
  return path.join(DEFAULT_DB_DIR, "antfarm.db");
}

let _db: DatabaseSync | null = null;
let _dbOpenedAt = 0;
const DB_MAX_AGE_MS = 5000;

export function getDb(): DatabaseSync {
  const now = Date.now();
  if (_db && (now - _dbOpenedAt) < DB_MAX_AGE_MS) return _db;
  if (_db) { try { _db.close(); } catch {} }

  const dbPath = resolveDbPath();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  _db = new DatabaseSync(dbPath);
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

    CREATE TABLE IF NOT EXISTS usage (
      id TEXT PRIMARY KEY,
      run_id TEXT,
      step_id TEXT,
      agent_id TEXT NOT NULL,
      model TEXT NOT NULL,
      input_tokens INTEGER,
      output_tokens INTEGER,
      cache_read_tokens INTEGER,
      cache_write_tokens INTEGER,
      cost_usd REAL,
      task_label TEXT,
      source_key TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_usage_agent_id ON usage(agent_id);
    CREATE INDEX IF NOT EXISTS idx_usage_model ON usage(model);
    CREATE INDEX IF NOT EXISTS idx_usage_created_at ON usage(created_at);
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

  const usageCols = db.prepare("PRAGMA table_info(usage)").all() as Array<{ name: string }>;
  const usageColNames = new Set(usageCols.map((c) => c.name));

  if (!usageColNames.has("cache_read_tokens")) {
    db.exec("ALTER TABLE usage ADD COLUMN cache_read_tokens INTEGER");
  }
  if (!usageColNames.has("cache_write_tokens")) {
    db.exec("ALTER TABLE usage ADD COLUMN cache_write_tokens INTEGER");
  }
  if (!usageColNames.has("source_key")) {
    db.exec("ALTER TABLE usage ADD COLUMN source_key TEXT");
  }

  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_usage_source_key ON usage(source_key)");
}

export function getDbPath(): string {
  return resolveDbPath();
}
