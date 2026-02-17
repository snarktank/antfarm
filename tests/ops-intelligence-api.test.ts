/**
 * Tests for Ops Intelligence Analysis API
 * Tests the HTTP endpoints for submitting and retrieving analysis runs
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { startOpsIntelligenceAPI } from "../src/ops-intelligence/api.js";
import { getDb } from "../src/db.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

describe("Ops Intelligence API", () => {
  let server: http.Server;
  let db: any;
  const testDbPath = path.join(os.tmpdir(), `test-api-${Date.now()}.db`);
  
  before(() => {
    // Create a test database path and run migrations
    const testDb = new (global as any).DatabaseSync(testDbPath);
    testDb.exec("PRAGMA journal_mode=WAL");
    testDb.exec("PRAGMA foreign_keys=ON");
    
    // Run migration from db.ts
    testDb.exec(`
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
    
    // Save reference to test DB for use in API 
    db = testDb;
    
    // Start API server on a test port
    server = startOpsIntelligenceAPI(3335);
  });

  after((done) => {
    try {
      server.close(() => {
        try {
          db.close();
          fs.unlinkSync(testDbPath);
          try {
            fs.unlinkSync(`${testDbPath}-wal`);
            fs.unlinkSync(`${testDbPath}-shm`);
          } catch {}
        } catch {}
        done();
      });
    } catch (err) {
      done();
    }
  });

  describe("POST /api/ops-intelligence/analyze", () => {
    it("should accept valid analysis requests", async () => {
      const requestBody = {
        runId: "test-run-123",
        fromDate: "2024-01-01",
        toDate: "2024-02-01"
      };

      const result = await fetch("http://localhost:3335/api/ops-intelligence/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(requestBody)
      });

      assert.equal(result.status, 200);
      
      const response = await result.json();
      assert.equal(response.runId, "test-run-123");
      assert.equal(response.status, "completed"); // Should be completed in test (no actual analysis)
      assert.ok(response.submittedAt);
      assert.ok(response.completedAt);
    });

    it("should reject requests without runId", async () => {
      const requestBody = {
        fromDate: "2024-01-01"
      };

      const result = await fetch("http://localhost:3335/api/ops-intelligence/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(requestBody)
      });

      assert.equal(result.status, 400);
      
      const response = await result.json();
      assert.ok(response.error);
    });

    it("should handle invalid JSON body", async () => {
      const result = await fetch("http://localhost:3335/api/ops-intelligence/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: "invalid json"
      });

      assert.equal(result.status, 400);
      
      const response = await result.json();
      assert.ok(response.error);
    });
  });

  describe("GET /api/ops-intelligence/analyze/:runId", () => {
    it("should return analysis status for existing run", async () => {
      // First submit an analysis run
      const submitBody = { runId: "existing-run-123" };
      await fetch("http://localhost:3335/api/ops-intelligence/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(submitBody)
      });

      // Now try to retrieve it
      const result = await fetch("http://localhost:3335/api/ops-intelligence/analyze/existing-run-123", {
        method: "GET"
      });

      assert.equal(result.status, 200);
      
      const response = await result.json();
      assert.equal(response.runId, "existing-run-123");
      assert.equal(response.status, "completed");
    });

    it("should return 404 for non-existent run", async () => {
      const result = await fetch("http://localhost:3335/api/ops-intelligence/analyze/non-existent-run", {
        method: "GET"
      });

      assert.equal(result.status, 404);
      
      const response = await result.json();
      assert.ok(response.error);
    });
  });

  describe("GET /api/ops-intelligence/status", () => {
    it("should return API status information", async () => {
      const result = await fetch("http://localhost:3335/api/ops-intelligence/status", {
        method: "GET"
      });

      assert.equal(result.status, 200);
      
      const response = await result.json();
      assert.ok(response.status);
      assert.ok(response.totalRuns);
    });
  });
});