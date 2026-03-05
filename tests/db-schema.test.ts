/**
 * Tests for database schema verification.
 * Validates that SQLite database is properly initialized with all required tables.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getDb, getDbPath } from "../dist/db.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

describe("Database Schema", () => {
  it("can open database from the DB module", () => {
    const db = getDb();
    assert.ok(db, "Database should be defined");
    
    // Verify database file exists
    const dbPath = getDbPath();
    assert.ok(fs.existsSync(dbPath), `Database file should exist at ${dbPath}`);
  });

  it("runs table exists with required columns", () => {
    const db = getDb();
    
    // Check table exists
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='runs'").get();
    assert.ok(tables, "runs table should exist");
    
    // Check columns
    const cols = db.prepare("PRAGMA table_info(runs)").all() as Array<{ name: string }>;
    const colNames = cols.map(c => c.name);
    
    const requiredCols = ["id", "workflow_id", "task", "status", "context", "created_at", "updated_at"];
    for (const col of requiredCols) {
      assert.ok(colNames.includes(col), `runs table should have column: ${col}`);
    }
  });

  it("steps table exists with required columns", () => {
    const db = getDb();
    
    // Check table exists
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='steps'").get();
    assert.ok(tables, "steps table should exist");
    
    // Check columns
    const cols = db.prepare("PRAGMA table_info(steps)").all() as Array<{ name: string }>;
    const colNames = cols.map(c => c.name);
    
    const requiredCols = ["id", "run_id", "step_id", "agent_id", "status", "type", "input_template"];
    for (const col of requiredCols) {
      assert.ok(colNames.includes(col), `steps table should have column: ${col}`);
    }
  });

  it("stories table exists with required columns", () => {
    const db = getDb();
    
    // Check table exists
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='stories'").get();
    assert.ok(tables, "stories table should exist");
    
    // Check columns
    const cols = db.prepare("PRAGMA table_info(stories)").all() as Array<{ name: string }>;
    const colNames = cols.map(c => c.name);
    
    const requiredCols = ["id", "run_id", "story_id", "title", "status", "acceptance_criteria"];
    for (const col of requiredCols) {
      assert.ok(colNames.includes(col), `stories table should have column: ${col}`);
    }
  });

  it("events table exists with required columns", () => {
    const db = getDb();
    
    // Check table exists
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='events'").get();
    assert.ok(tables, "events table should exist");
    
    // Check columns
    const cols = db.prepare("PRAGMA table_info(events)").all() as Array<{ name: string }>;
    const colNames = cols.map(c => c.name);
    
    const requiredCols = ["id", "ts", "event", "run_id", "step_id", "agent_id"];
    for (const col of requiredCols) {
      assert.ok(colNames.includes(col), `events table should have column: ${col}`);
    }
  });
});
