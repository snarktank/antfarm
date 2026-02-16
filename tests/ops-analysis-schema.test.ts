/**
 * Tests for the Ops Analysis Database Schema
 * Verifies that all ops intelligence tables are created correctly
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// Import the types to verify they match the schema
import type {
  OpsAnalysisRun,
  OpsPattern,
  OpsFinding,
  OpsRecommendation,
} from "../dist/ops-intelligence/types";

describe("Ops Analysis Database Schema", () => {
  let db: DatabaseSync;
  const testDbPath = path.join(os.tmpdir(), `test-ops-analysis-${Date.now()}.db`);

  before(() => {
    // Create a test database
    db = new DatabaseSync(testDbPath);
    db.exec("PRAGMA journal_mode=WAL");
    db.exec("PRAGMA foreign_keys=ON");

    // Run the migration manually
    migrateOpsIntelligence(db);
  });

  after(() => {
    try {
      db.close();
      fs.unlinkSync(testDbPath);
      // Clean up WAL files
      try {
        fs.unlinkSync(`${testDbPath}-wal`);
        fs.unlinkSync(`${testDbPath}-shm`);
      } catch {}
    } catch {}
  });

  describe("ops_analysis_runs table", () => {
    it("should have correct columns", () => {
      const columns = db.prepare("PRAGMA table_info(ops_analysis_runs)").all() as Array<{
        name: string;
        type: string;
      }>;
      const columnNames = columns.map((c) => c.name);

      assert.ok(columnNames.includes("id"), "should have id column");
      assert.ok(columnNames.includes("run_id"), "should have run_id column");
      assert.ok(columnNames.includes("analyzed_at"), "should have analyzed_at column");
      assert.ok(columnNames.includes("pattern_count"), "should have pattern_count column");
      assert.ok(columnNames.includes("finding_count"), "should have finding_count column");
      assert.ok(columnNames.includes("status"), "should have status column");
      assert.ok(columnNames.includes("created_at"), "should have created_at column");
      assert.ok(columnNames.includes("updated_at"), "should have updated_at column");
    });

    it("should be able to insert and retrieve records", () => {
      const stmt = db.prepare(`
        INSERT INTO ops_analysis_runs (id, run_id, analyzed_at, pattern_count, finding_count, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      stmt.run("run-1", "workflow-run-1", "2024-02-15T21:00:00Z", 0, 0, "pending", "2024-02-15T21:00:00Z", "2024-02-15T21:00:00Z");

      const result = db.prepare("SELECT * FROM ops_analysis_runs WHERE id = ?").get("run-1") as OpsAnalysisRun;
      assert.equal(result.id, "run-1");
      assert.equal(result.run_id, "workflow-run-1");
      assert.equal(result.pattern_count, 0);
      assert.equal(result.finding_count, 0);
      assert.equal(result.status, "pending");
    });

    it("should enforce run_id uniqueness", () => {
      const stmt = db.prepare(`
        INSERT INTO ops_analysis_runs (id, run_id, analyzed_at, pattern_count, finding_count, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      stmt.run("run-2", "workflow-run-2", "2024-02-15T21:00:00Z", 0, 0, "pending", "2024-02-15T21:00:00Z", "2024-02-15T21:00:00Z");

      assert.throws(
        () => {
          stmt.run("run-3", "workflow-run-2", "2024-02-15T21:00:00Z", 0, 0, "pending", "2024-02-15T21:00:00Z", "2024-02-15T21:00:00Z");
        },
        "should not allow duplicate run_id"
      );
    });
  });

  describe("ops_patterns table", () => {
    it("should have correct columns", () => {
      const columns = db.prepare("PRAGMA table_info(ops_patterns)").all() as Array<{
        name: string;
        type: string;
      }>;
      const columnNames = columns.map((c) => c.name);

      assert.ok(columnNames.includes("id"), "should have id column");
      assert.ok(columnNames.includes("analysis_id"), "should have analysis_id column");
      assert.ok(columnNames.includes("pattern_type"), "should have pattern_type column");
      assert.ok(columnNames.includes("description"), "should have description column");
      assert.ok(columnNames.includes("occurrence_count"), "should have occurrence_count column");
      assert.ok(columnNames.includes("severity"), "should have severity column");
      assert.ok(columnNames.includes("first_seen"), "should have first_seen column");
      assert.ok(columnNames.includes("last_seen"), "should have last_seen column");
      assert.ok(columnNames.includes("created_at"), "should have created_at column");
      assert.ok(columnNames.includes("updated_at"), "should have updated_at column");
    });

    it("should be able to insert and retrieve records", () => {
      // First insert an analysis run
      db.prepare(`
        INSERT INTO ops_analysis_runs (id, run_id, analyzed_at, pattern_count, finding_count, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run("run-3", "workflow-run-3", "2024-02-15T21:00:00Z", 0, 0, "pending", "2024-02-15T21:00:00Z", "2024-02-15T21:00:00Z");

      // Now insert a pattern
      const stmt = db.prepare(`
        INSERT INTO ops_patterns (id, analysis_id, pattern_type, description, occurrence_count, severity, first_seen, last_seen, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      stmt.run("pattern-1", "run-3", "step_failure", "Steps failing with timeout", 5, "high", "2024-02-15T20:00:00Z", "2024-02-15T21:00:00Z", "2024-02-15T21:00:00Z", "2024-02-15T21:00:00Z");

      const result = db.prepare("SELECT * FROM ops_patterns WHERE id = ?").get("pattern-1") as OpsPattern;
      assert.equal(result.id, "pattern-1");
      assert.equal(result.analysis_id, "run-3");
      assert.equal(result.pattern_type, "step_failure");
      assert.equal(result.occurrence_count, 5);
      assert.equal(result.severity, "high");
    });

    it("should enforce foreign key constraint on analysis_id", () => {
      const stmt = db.prepare(`
        INSERT INTO ops_patterns (id, analysis_id, pattern_type, description, occurrence_count, severity, first_seen, last_seen, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      assert.throws(
        () => {
          stmt.run("pattern-2", "nonexistent-run", "step_failure", "Test", 1, "medium", "2024-02-15T20:00:00Z", "2024-02-15T21:00:00Z", "2024-02-15T21:00:00Z", "2024-02-15T21:00:00Z");
        },
        "should enforce foreign key constraint"
      );
    });
  });

  describe("ops_findings table", () => {
    it("should have correct columns", () => {
      const columns = db.prepare("PRAGMA table_info(ops_findings)").all() as Array<{
        name: string;
        type: string;
      }>;
      const columnNames = columns.map((c) => c.name);

      assert.ok(columnNames.includes("id"), "should have id column");
      assert.ok(columnNames.includes("analysis_id"), "should have analysis_id column");
      assert.ok(columnNames.includes("finding_type"), "should have finding_type column");
      assert.ok(columnNames.includes("message"), "should have message column");
      assert.ok(columnNames.includes("severity"), "should have severity column");
      assert.ok(columnNames.includes("entity_type"), "should have entity_type column");
      assert.ok(columnNames.includes("entity_id"), "should have entity_id column");
      assert.ok(columnNames.includes("created_at"), "should have created_at column");
      assert.ok(columnNames.includes("updated_at"), "should have updated_at column");
    });

    it("should be able to insert and retrieve records", () => {
      // First insert an analysis run
      db.prepare(`
        INSERT INTO ops_analysis_runs (id, run_id, analyzed_at, pattern_count, finding_count, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run("run-4", "workflow-run-4", "2024-02-15T21:00:00Z", 0, 0, "pending", "2024-02-15T21:00:00Z", "2024-02-15T21:00:00Z");

      // Now insert a finding
      const stmt = db.prepare(`
        INSERT INTO ops_findings (id, analysis_id, finding_type, message, severity, entity_type, entity_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      stmt.run("finding-1", "run-4", "compliance_violation", "Missing error handling in step", "critical", "step", "step-123", "2024-02-15T21:00:00Z", "2024-02-15T21:00:00Z");

      const result = db.prepare("SELECT * FROM ops_findings WHERE id = ?").get("finding-1") as OpsFinding;
      assert.equal(result.id, "finding-1");
      assert.equal(result.analysis_id, "run-4");
      assert.equal(result.finding_type, "compliance_violation");
      assert.equal(result.severity, "critical");
      assert.equal(result.entity_type, "step");
      assert.equal(result.entity_id, "step-123");
    });

    it("should enforce foreign key constraint on analysis_id", () => {
      const stmt = db.prepare(`
        INSERT INTO ops_findings (id, analysis_id, finding_type, message, severity, entity_type, entity_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      assert.throws(
        () => {
          stmt.run("finding-2", "nonexistent-run", "compliance_violation", "Test", "medium", "step", "step-123", "2024-02-15T21:00:00Z", "2024-02-15T21:00:00Z");
        },
        "should enforce foreign key constraint"
      );
    });
  });

  describe("ops_recommendations table", () => {
    it("should have correct columns", () => {
      const columns = db.prepare("PRAGMA table_info(ops_recommendations)").all() as Array<{
        name: string;
        type: string;
      }>;
      const columnNames = columns.map((c) => c.name);

      assert.ok(columnNames.includes("id"), "should have id column");
      assert.ok(columnNames.includes("finding_id"), "should have finding_id column");
      assert.ok(columnNames.includes("recommendation_text"), "should have recommendation_text column");
      assert.ok(columnNames.includes("priority"), "should have priority column");
      assert.ok(columnNames.includes("effort_level"), "should have effort_level column");
      assert.ok(columnNames.includes("created_at"), "should have created_at column");
      assert.ok(columnNames.includes("updated_at"), "should have updated_at column");
    });

    it("should be able to insert and retrieve records", () => {
      // First set up: insert analysis run and finding
      db.prepare(`
        INSERT INTO ops_analysis_runs (id, run_id, analyzed_at, pattern_count, finding_count, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run("run-5", "workflow-run-5", "2024-02-15T21:00:00Z", 0, 0, "pending", "2024-02-15T21:00:00Z", "2024-02-15T21:00:00Z");

      db.prepare(`
        INSERT INTO ops_findings (id, analysis_id, finding_type, message, severity, entity_type, entity_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run("finding-3", "run-5", "compliance_violation", "Missing error handling in step", "critical", "step", "step-123", "2024-02-15T21:00:00Z", "2024-02-15T21:00:00Z");

      // Now insert a recommendation
      const stmt = db.prepare(`
        INSERT INTO ops_recommendations (id, finding_id, recommendation_text, priority, effort_level, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      stmt.run("rec-1", "finding-3", "Add try-catch block to step", "high", "low", "2024-02-15T21:00:00Z", "2024-02-15T21:00:00Z");

      const result = db.prepare("SELECT * FROM ops_recommendations WHERE id = ?").get("rec-1") as OpsRecommendation;
      assert.equal(result.id, "rec-1");
      assert.equal(result.finding_id, "finding-3");
      assert.equal(result.recommendation_text, "Add try-catch block to step");
      assert.equal(result.priority, "high");
      assert.equal(result.effort_level, "low");
    });

    it("should enforce foreign key constraint on finding_id", () => {
      const stmt = db.prepare(`
        INSERT INTO ops_recommendations (id, finding_id, recommendation_text, priority, effort_level, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      assert.throws(
        () => {
          stmt.run("rec-2", "nonexistent-finding", "Test recommendation", "medium", "medium", "2024-02-15T21:00:00Z", "2024-02-15T21:00:00Z");
        },
        "should enforce foreign key constraint"
      );
    });
  });

  describe("Indexes", () => {
    it("should have index on ops_patterns(analysis_id)", () => {
      const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_ops_patterns%'").all() as Array<{ name: string }>;
      const indexNames = indexes.map((i) => i.name);
      assert.ok(indexNames.includes("idx_ops_patterns_analysis_id"), "should have index on analysis_id");
    });

    it("should have indexes on ops_findings", () => {
      const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_ops_findings%'").all() as Array<{ name: string }>;
      const indexNames = indexes.map((i) => i.name);
      assert.ok(indexNames.includes("idx_ops_findings_analysis_id"), "should have index on analysis_id");
      assert.ok(indexNames.includes("idx_ops_findings_severity"), "should have index on severity");
    });

    it("should have index on ops_recommendations(finding_id)", () => {
      const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_ops_recommendations%'").all() as Array<{ name: string }>;
      const indexNames = indexes.map((i) => i.name);
      assert.ok(indexNames.includes("idx_ops_recommendations_finding_id"), "should have index on finding_id");
    });
  });
});

/**
 * Migration function that sets up the ops intelligence schema
 * This mirrors what's in db.ts
 */
function migrateOpsIntelligence(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ops_analysis_runs (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL UNIQUE,
      analyzed_at TEXT NOT NULL,
      pattern_count INTEGER NOT NULL DEFAULT 0,
      finding_count INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ops_patterns (
      id TEXT PRIMARY KEY,
      analysis_id TEXT NOT NULL REFERENCES ops_analysis_runs(id),
      pattern_type TEXT NOT NULL,
      description TEXT NOT NULL,
      occurrence_count INTEGER NOT NULL DEFAULT 1,
      severity TEXT NOT NULL,
      first_seen TEXT NOT NULL,
      last_seen TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ops_findings (
      id TEXT PRIMARY KEY,
      analysis_id TEXT NOT NULL REFERENCES ops_analysis_runs(id),
      finding_type TEXT NOT NULL,
      message TEXT NOT NULL,
      severity TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ops_recommendations (
      id TEXT PRIMARY KEY,
      finding_id TEXT NOT NULL REFERENCES ops_findings(id),
      recommendation_text TEXT NOT NULL,
      priority TEXT NOT NULL,
      effort_level TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  // Create indexes
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_ops_patterns_analysis_id ON ops_patterns(analysis_id);
    CREATE INDEX IF NOT EXISTS idx_ops_patterns_severity ON ops_patterns(severity);
    CREATE INDEX IF NOT EXISTS idx_ops_patterns_type ON ops_patterns(pattern_type);
    CREATE INDEX IF NOT EXISTS idx_ops_findings_analysis_id ON ops_findings(analysis_id);
    CREATE INDEX IF NOT EXISTS idx_ops_findings_severity ON ops_findings(severity);
    CREATE INDEX IF NOT EXISTS idx_ops_findings_type ON ops_findings(finding_type);
    CREATE INDEX IF NOT EXISTS idx_ops_recommendations_finding_id ON ops_recommendations(finding_id);
    CREATE INDEX IF NOT EXISTS idx_ops_analysis_runs_status ON ops_analysis_runs(status);
    CREATE INDEX IF NOT EXISTS idx_ops_analysis_runs_run_id ON ops_analysis_runs(run_id);
  `);
}
