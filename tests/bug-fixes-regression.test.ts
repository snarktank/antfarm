/**
 * Regression tests for major bug fixes in Antfarm.
 * Tests ensure the following bugs don't resurface:
 * 1. Test database contaminating production (DATABASE ISOLATION)
 * 2. Catastrophic purge vulnerability (PURGE VALIDATION)
 * 3. Unreliable event queue (EVENT QUEUE PERSISTENCE & RETRY)
 * 4. Insufficient retry defaults (RETRY COUNT DEFAULTS)
 */

import { test, describe } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";

// Test setup: isolate database per test
let testDbPath: string;
let originalDbEnv: string | undefined;

async function setupTest() {
  testDbPath = path.join(os.tmpdir(), `antfarm-test-${crypto.randomUUID()}.db`);
  originalDbEnv = process.env.ANTFARM_DB_PATH;
  process.env.ANTFARM_DB_PATH = testDbPath;

  // Clear module cache to force fresh db module import
  delete (globalThis as any).__antfarmDbModule;
}

async function teardownTest() {
  // Clean up
  if (originalDbEnv !== undefined) {
    process.env.ANTFARM_DB_PATH = originalDbEnv;
  } else {
    delete process.env.ANTFARM_DB_PATH;
  }

  // Close database and remove temp file
  try {
    const dbModule = (globalThis as any).__antfarmDbModule;
    if (dbModule?.closeDb) {
      dbModule.closeDb();
    }
  } catch {}

  try {
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  } catch {}

  delete (globalThis as any).__antfarmDbModule;
}

describe("BUG FIX: Database Isolation (ANTFARM_DB_PATH support)", async () => {
  test("should use ANTFARM_DB_PATH env var when set", async () => {
    await setupTest();
    try {
      const dbModule = await import("../dist/db.js");
      (globalThis as any).__antfarmDbModule = dbModule;

      const db = dbModule.getDb();
      const dbPath = dbModule.getDbPath();

      assert.strictEqual(dbPath, testDbPath);
      assert.ok(fs.existsSync(testDbPath));
    } finally {
      await teardownTest();
    }
  });

  test("should export closeDb() function for test cleanup", async () => {
    await setupTest();
    try {
      const dbModule = await import("../dist/db.js");
      (globalThis as any).__antfarmDbModule = dbModule;

      assert.strictEqual(typeof dbModule.closeDb, "function");

      const db = dbModule.getDb();
      dbModule.closeDb();

      // After close, next getDb should get a fresh connection
      const db2 = dbModule.getDb();
      assert.ok(db2);
    } finally {
      await teardownTest();
    }
  });
});

describe("BUG FIX: Catastrophic Purge Vulnerability (Input Validation)", async () => {
  test("should reject empty filter objects", async () => {
    await setupTest();
    try {
      const purgeModule = await import("../dist/installer/purge.js");

      assert.throws(() => {
        purgeModule.buildPurgeFilter({});
      }, /Filter cannot be empty/);
    } finally {
      await teardownTest();
    }
  });

  test("should prevent deletion of 'running' status runs", async () => {
    await setupTest();
    try {
      const purgeModule = await import("../dist/installer/purge.js");

      assert.throws(() => {
        purgeModule.buildPurgeFilter({ status: "running" });
      }, /Cannot delete runs with status 'running'/);
    } finally {
      await teardownTest();
    }
  });

  test("should allow deletion with valid filter", async () => {
    await setupTest();
    try {
      const purgeModule = await import("../dist/installer/purge.js");

      assert.doesNotThrow(() => {
        const filter = purgeModule.buildPurgeFilter({ workflowId: "test-workflow" });
        assert.strictEqual(filter.workflowId, "test-workflow");
      });
    } finally {
      await teardownTest();
    }
  });

  test("should delete runs with parameterized queries", async () => {
    await setupTest();
    try {
      const dbModule = await import("../dist/db.js");
      const purgeModule = await import("../dist/installer/purge.js");
      (globalThis as any).__antfarmDbModule = dbModule;

      const db = dbModule.getDb();
      const now = new Date().toISOString();

      // Create test runs
      db.prepare(`
        INSERT INTO runs (id, workflow_id, task, status, context, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run("run-1", "workflow-1", "Task 1", "completed", "{}", now, now);

      db.prepare(`
        INSERT INTO runs (id, workflow_id, task, status, context, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run("run-2", "workflow-1", "Task 2", "failed", "{}", now, now);

      // Delete completed runs
      const deleted = purgeModule.deleteRuns({ status: "completed" });
      assert.strictEqual(deleted, 1);

      // Verify run-1 is deleted, run-2 remains
      const run1 = db.prepare("SELECT COUNT(*) AS cnt FROM runs WHERE id = 'run-1'").get() as { cnt: number };
      const run2 = db.prepare("SELECT COUNT(*) AS cnt FROM runs WHERE id = 'run-2'").get() as { cnt: number };
      assert.strictEqual(run1.cnt, 0);
      assert.strictEqual(run2.cnt, 1);
    } finally {
      await teardownTest();
    }
  });

  test("should delete associated steps and stories when deleting runs", async () => {
    await setupTest();
    try {
      const dbModule = await import("../dist/db.js");
      const purgeModule = await import("../dist/installer/purge.js");
      (globalThis as any).__antfarmDbModule = dbModule;

      const db = dbModule.getDb();
      const now = new Date().toISOString();

      // Create test run with step and story
      db.prepare(`
        INSERT INTO runs (id, workflow_id, task, status, context, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run("run-with-artifacts", "workflow-1", "Task", "completed", "{}", now, now);

      db.prepare(`
        INSERT INTO steps (id, run_id, step_id, agent_id, step_index, input_template, expects, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        "step-1", "run-with-artifacts", "plan", "agent-1", 0,
        "Plan {{task}}", "status", "done", now, now
      );

      db.prepare(`
        INSERT INTO stories (id, run_id, story_index, story_id, title, description, acceptance_criteria, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        "story-1", "run-with-artifacts", 0, "STORY-1", "Implement feature",
        "Add feature X", "Works on Linux", "completed", now, now
      );

      // Delete the run
      purgeModule.deleteRuns({ workflowId: "workflow-1" });

      // Verify all artifacts are deleted
      const runCount = db.prepare("SELECT COUNT(*) AS cnt FROM runs WHERE id = 'run-with-artifacts'").get() as { cnt: number };
      const stepCount = db.prepare("SELECT COUNT(*) AS cnt FROM steps WHERE run_id = 'run-with-artifacts'").get() as { cnt: number };
      const storyCount = db.prepare("SELECT COUNT(*) AS cnt FROM stories WHERE run_id = 'run-with-artifacts'").get() as { cnt: number };

      assert.strictEqual(runCount.cnt, 0);
      assert.strictEqual(stepCount.cnt, 0);
      assert.strictEqual(storyCount.cnt, 0);
    } finally {
      await teardownTest();
    }
  });
});

describe("BUG FIX: Insufficient Retry Defaults (max_retries DEFAULT 5)", async () => {
  test("should set max_retries to 5 by default for new steps", async () => {
    await setupTest();
    try {
      const dbModule = await import("../dist/db.js");
      (globalThis as any).__antfarmDbModule = dbModule;

      const db = dbModule.getDb();
      const now = new Date().toISOString();

      // Create a run first
      db.prepare(`
        INSERT INTO runs (id, workflow_id, task, status, context, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run("run-1", "workflow-1", "Task", "running", "{}", now, now);

      // Insert step without specifying max_retries (should default to 5)
      db.prepare(`
        INSERT INTO steps (id, run_id, step_id, agent_id, step_index, input_template, expects, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run("step-1", "run-1", "plan", "agent-1", 0, "Plan {{task}}", "status", "waiting", now, now);

      const step = db.prepare("SELECT max_retries FROM steps WHERE id = 'step-1'").get() as { max_retries: number };
      assert.strictEqual(step.max_retries, 5);
    } finally {
      await teardownTest();
    }
  });

  test("should set max_retries to 5 by default for new stories", async () => {
    await setupTest();
    try {
      const dbModule = await import("../dist/db.js");
      (globalThis as any).__antfarmDbModule = dbModule;

      const db = dbModule.getDb();
      const now = new Date().toISOString();

      // Create a run first
      db.prepare(`
        INSERT INTO runs (id, workflow_id, task, status, context, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run("run-2", "workflow-1", "Task", "running", "{}", now, now);

      // Insert story without specifying max_retries (should default to 5)
      db.prepare(`
        INSERT INTO stories (id, run_id, story_index, story_id, title, description, acceptance_criteria, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        "story-1", "run-2", 0, "STORY-1", "Implement feature",
        "Add feature X", "Works on all platforms", "pending", now, now
      );

      const story = db.prepare("SELECT max_retries FROM stories WHERE id = 'story-1'").get() as { max_retries: number };
      assert.strictEqual(story.max_retries, 5);
    } finally {
      await teardownTest();
    }
  });
});

describe("BUG FIX: Event Queue (Persistence)", async () => {
  test("should create event_queue table on migration", async () => {
    await setupTest();
    try {
      const dbModule = await import("../dist/db.js");
      (globalThis as any).__antfarmDbModule = dbModule;

      const db = dbModule.getDb();

      // Verify table exists
      const tables = db.prepare(`
        SELECT name FROM sqlite_master WHERE type='table' AND name='event_queue'
      `).all() as Array<{ name: string }>;

      assert.strictEqual(tables.length, 1);
      assert.strictEqual(tables[0].name, "event_queue");
    } finally {
      await teardownTest();
    }
  });

  test("should have correct event_queue table schema", async () => {
    await setupTest();
    try {
      const dbModule = await import("../dist/db.js");
      (globalThis as any).__antfarmDbModule = dbModule;

      const db = dbModule.getDb();

      const cols = db.prepare("PRAGMA table_info(event_queue)").all() as Array<{ name: string }>;
      const colNames = new Set(cols.map((c) => c.name));

      assert.ok(colNames.has("id"));
      assert.ok(colNames.has("event_json"));
      assert.ok(colNames.has("status"));
      assert.ok(colNames.has("retry_count"));
      assert.ok(colNames.has("failed_at"));
      assert.ok(colNames.has("created_at"));
      assert.ok(colNames.has("updated_at"));
    } finally {
      await teardownTest();
    }
  });
});

describe("BUG FIX: Agent Prompt Guidance (Shell Escaping Documentation)", async () => {
  test("should provide shell escaping guidance in agent prompts", async () => {
    const agentCronModule = await import("../dist/installer/agent-cron.js");

    const agentPrompt = agentCronModule.buildAgentPrompt("workflow-1", "agent-1");
    const workPrompt = agentCronModule.buildWorkPrompt("workflow-1", "agent-1");

    // Check that both prompts include the critical guidance
    assert.ok(agentPrompt.includes("Write output to a file first, then pipe via stdin"));
    assert.ok(agentPrompt.includes("cat <<'ANTFARM_EOF'"));
    assert.ok(agentPrompt.includes("shell escaping breaks direct args"));

    assert.ok(workPrompt.includes("Write output to a file first, then pipe via stdin"));
    assert.ok(workPrompt.includes("cat <<'ANTFARM_EOF'"));
    assert.ok(workPrompt.includes("shell escaping breaks direct args"));
  });
});
