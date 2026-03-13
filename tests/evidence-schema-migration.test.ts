import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

function hasColumn(db: DatabaseSync, table: string, column: string): boolean {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return cols.some((c) => c.name === column);
}

test("db migration adds evidence columns without dropping existing data", async () => {
  const originalHome = process.env.HOME;
  const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), "antfarm-evidence-migrate-"));
  const dbDir = path.join(fakeHome, ".openclaw", "antfarm");
  const dbPath = path.join(dbDir, "antfarm.db");
  fs.mkdirSync(dbDir, { recursive: true });

  const oldDb = new DatabaseSync(dbPath);
  oldDb.exec(`
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
      updated_at TEXT NOT NULL
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

  const now = new Date().toISOString();
  oldDb.prepare("INSERT INTO runs (id, workflow_id, task, status, context, created_at, updated_at) VALUES (?, ?, ?, 'running', '{}', ?, ?)").run("run-1", "wf", "test", now, now);
  oldDb.prepare("INSERT INTO steps (id, run_id, step_id, agent_id, step_index, input_template, expects, status, output, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'waiting', NULL, ?, ?)").run("step-1", "run-1", "impl", "dev", 0, "do it", "done", now, now);
  oldDb.prepare("INSERT INTO stories (id, run_id, story_index, story_id, title, description, acceptance_criteria, status, output, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', NULL, ?, ?)").run("story-1", "run-1", 0, "US-1", "title", "desc", "[\"ac\"]", now, now);
  oldDb.close();

  process.env.HOME = fakeHome;

  try {
    const dbModuleUrl = `${pathToFileURL(path.resolve("src/db.ts")).href}?evidenceMigration=${Date.now()}`;
    const { getDb } = await import(dbModuleUrl);
    const db = getDb();

    for (const col of ["evidence_file_paths", "evidence_git_diff", "evidence_summary", "evidence_validated_at"]) {
      assert.equal(hasColumn(db, "steps", col), true, `steps.${col} should exist`);
      assert.equal(hasColumn(db, "stories", col), true, `stories.${col} should exist`);
    }

    const stepRow = db.prepare("SELECT step_id, evidence_file_paths, evidence_git_diff, evidence_summary, evidence_validated_at FROM steps WHERE id = ?").get("step-1") as {
      step_id: string;
      evidence_file_paths: string | null;
      evidence_git_diff: string | null;
      evidence_summary: string | null;
      evidence_validated_at: string | null;
    };

    const storyRow = db.prepare("SELECT story_id, evidence_file_paths, evidence_git_diff, evidence_summary, evidence_validated_at FROM stories WHERE id = ?").get("story-1") as {
      story_id: string;
      evidence_file_paths: string | null;
      evidence_git_diff: string | null;
      evidence_summary: string | null;
      evidence_validated_at: string | null;
    };

    assert.equal(stepRow.step_id, "impl");
    assert.equal(storyRow.story_id, "US-1");
    assert.equal(stepRow.evidence_file_paths, null);
    assert.equal(stepRow.evidence_git_diff, null);
    assert.equal(stepRow.evidence_summary, null);
    assert.equal(stepRow.evidence_validated_at, null);
    assert.equal(storyRow.evidence_file_paths, null);
    assert.equal(storyRow.evidence_git_diff, null);
    assert.equal(storyRow.evidence_summary, null);
    assert.equal(storyRow.evidence_validated_at, null);
  } finally {
    process.env.HOME = originalHome;
    fs.rmSync(fakeHome, { recursive: true, force: true });
  }
});
