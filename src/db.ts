import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const DB_DIR = path.join(os.homedir(), ".openclaw", "antfarm");
const DB_PATH = path.join(DB_DIR, "antfarm.db");

let _db: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (_db) return _db;

  fs.mkdirSync(DB_DIR, { recursive: true });
  _db = new DatabaseSync(DB_PATH);
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
}

export function getDbPath(): string {
  return DB_PATH;
}
