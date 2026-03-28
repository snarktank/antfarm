import { DatabaseSync } from "node:sqlite";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

async function loadChecksModule(dbPath: string) {
  process.env.ANTFARM_DB_PATH = dbPath;
  return import(`../dist/medic/checks.js?test=${Date.now()}-${Math.random()}`);
}

describe("medic missing cron detection", () => {
  it("flags workflows with active runs but no antfarm cron jobs", async () => {
    const dbPath = path.join(os.tmpdir(), `antfarm-missing-crons-${Date.now()}-${Math.random()}.db`);
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
    `);

    db.prepare(
      "INSERT INTO runs (id, workflow_id, task, status, context, created_at, updated_at) VALUES ('run-feature', 'feature-dev', 'task', 'running', '{}', datetime('now', '-1 hour'), datetime('now'))"
    ).run();
    db.prepare(
      "INSERT INTO runs (id, workflow_id, task, status, context, created_at, updated_at) VALUES ('run-bug', 'bug-fix', 'task', 'running', '{}', datetime('now', '-1 hour'), datetime('now'))"
    ).run();
    db.close();

    try {
      const checks = await loadChecksModule(dbPath);
      const findings = checks.checkMissingCrons([
        { id: 'cron-bug', name: 'antfarm/bug-fix/fixer' },
        { id: 'cron-sec', name: 'antfarm/security-audit/scanner' },
      ]);

      assert.equal(findings.length, 1);
      assert.equal(findings[0].check, 'missing_crons');
      assert.equal(findings[0].severity, 'critical');
      assert.equal(findings[0].action, 'ensure_crons');
      assert.match(findings[0].message, /Workflow "feature-dev" has 1 active run\(s\) but no agent cron jobs/);
    } finally {
      delete process.env.ANTFARM_DB_PATH;
      fs.unlinkSync(dbPath);
    }
  });
});
