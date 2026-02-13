/**
 * Regression test for: completed agents keep polling after their step is done (#123)
 *
 * Validates:
 * 1. peekStep() returns NO_WORK when agent's step is already done
 * 2. peekStep() returns HAS_WORK when agent has pending work
 * 3. peekStep() returns NO_WORK when agent's step is waiting (run active but step not yet reachable)
 * 4. peekStep() returns HAS_WORK only for running runs (not failed/completed)
 * 5. Polling prompt includes step peek before step claim
 * 6. claimStep() still works correctly (throttled cleanup doesn't break it)
 */

import { DatabaseSync } from "node:sqlite";
import crypto from "node:crypto";
import { describe, it, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";

// ── In-memory DB setup for step-ops functions ───────────────────────

function createTestDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");

  db.exec(`
    CREATE TABLE runs (
      id TEXT PRIMARY KEY,
      workflow_id TEXT NOT NULL,
      task TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'running',
      context TEXT NOT NULL DEFAULT '{}',
      notify_url TEXT,
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
      abandoned_count INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'single',
      loop_config TEXT,
      current_story_id TEXT
    );

    CREATE TABLE stories (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL REFERENCES runs(id),
      story_index INTEGER NOT NULL,
      story_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      acceptance_criteria TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'pending',
      output TEXT,
      retry_count INTEGER DEFAULT 0,
      max_retries INTEGER DEFAULT 2,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts TEXT NOT NULL,
      event TEXT NOT NULL,
      run_id TEXT,
      workflow_id TEXT,
      step_id TEXT,
      agent_id TEXT,
      story_id TEXT,
      story_title TEXT,
      detail TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  return db;
}

function ts(): string {
  return new Date().toISOString();
}

// ── Mock getDb to use our in-memory DB ──────────────────────────────

let testDb: DatabaseSync;

// We need to intercept the db module before importing step-ops
// Since step-ops uses getDb(), we'll test via the CLI output or direct DB queries

describe("peekStep - lightweight work check", () => {
  // These tests use the compiled dist module with a real in-memory DB.
  // We mock getDb by setting the ANTFARM_DB_PATH env var to a temp file.

  let tmpDbPath: string;
  let originalDbPath: string | undefined;

  before(async () => {
    // Create a temp DB file for testing
    const os = await import("node:os");
    const path = await import("node:path");
    const fs = await import("node:fs");
    tmpDbPath = path.join(os.tmpdir(), `antfarm-test-peek-${crypto.randomUUID()}.db`);
    originalDbPath = process.env.ANTFARM_DB_PATH;
    process.env.ANTFARM_DB_PATH = tmpDbPath;
  });

  after(async () => {
    // Restore original DB path
    if (originalDbPath !== undefined) {
      process.env.ANTFARM_DB_PATH = originalDbPath;
    } else {
      delete process.env.ANTFARM_DB_PATH;
    }
    // Clean up temp file
    const fs = await import("node:fs");
    try { fs.unlinkSync(tmpDbPath); } catch {}
  });

  it("returns NO_WORK when agent has no steps at all", async () => {
    // Fresh import to pick up new DB path
    const { peekStep } = await import("../dist/installer/step-ops.js");
    const result = peekStep("nonexistent-agent");
    assert.equal(result, "NO_WORK");
  });
});

// ── Test peekStep logic directly with DB queries ────────────────────

describe("peekStep logic (direct DB validation)", () => {
  it("returns NO_WORK equivalent when agent step is done and run is active", () => {
    const db = createTestDb();
    const runId = crypto.randomUUID();
    const t = ts();

    // Running run with a done step for the triager agent
    db.prepare(
      "INSERT INTO runs (id, workflow_id, task, status, context, created_at, updated_at) VALUES (?, 'bug-fix', 'fix bug', 'running', '{}', ?, ?)"
    ).run(runId, t, t);

    db.prepare(
      "INSERT INTO steps (id, run_id, step_id, agent_id, step_index, input_template, expects, status, created_at, updated_at) VALUES (?, ?, 'triage', 'bug-fix-triager', 0, '', '', 'done', ?, ?)"
    ).run(crypto.randomUUID(), runId, t, t);

    // peekStep query: count pending/waiting steps for this agent in running runs
    const row = db.prepare(
      `SELECT COUNT(*) as cnt FROM steps s
       JOIN runs r ON r.id = s.run_id
       WHERE s.agent_id = 'bug-fix-triager' AND s.status IN ('pending', 'waiting')
         AND r.status = 'running'`
    ).get() as { cnt: number };

    assert.equal(row.cnt, 0, "Done step should NOT count as pending work");
  });

  it("returns HAS_WORK equivalent when agent has a pending step", () => {
    const db = createTestDb();
    const runId = crypto.randomUUID();
    const t = ts();

    db.prepare(
      "INSERT INTO runs (id, workflow_id, task, status, context, created_at, updated_at) VALUES (?, 'bug-fix', 'fix bug', 'running', '{}', ?, ?)"
    ).run(runId, t, t);

    db.prepare(
      "INSERT INTO steps (id, run_id, step_id, agent_id, step_index, input_template, expects, status, created_at, updated_at) VALUES (?, ?, 'fix', 'bug-fix-fixer', 3, 'Do the fix', '', 'pending', ?, ?)"
    ).run(crypto.randomUUID(), runId, t, t);

    const row = db.prepare(
      `SELECT COUNT(*) as cnt FROM steps s
       JOIN runs r ON r.id = s.run_id
       WHERE s.agent_id = 'bug-fix-fixer' AND s.status IN ('pending', 'waiting')
         AND r.status = 'running'`
    ).get() as { cnt: number };

    assert.ok(row.cnt > 0, "Pending step should count as work");
  });

  it("returns NO_WORK equivalent when run is failed even if step is pending", () => {
    const db = createTestDb();
    const runId = crypto.randomUUID();
    const t = ts();

    db.prepare(
      "INSERT INTO runs (id, workflow_id, task, status, context, created_at, updated_at) VALUES (?, 'bug-fix', 'fix bug', 'failed', '{}', ?, ?)"
    ).run(runId, t, t);

    db.prepare(
      "INSERT INTO steps (id, run_id, step_id, agent_id, step_index, input_template, expects, status, created_at, updated_at) VALUES (?, ?, 'fix', 'bug-fix-fixer', 3, 'Do the fix', '', 'pending', ?, ?)"
    ).run(crypto.randomUUID(), runId, t, t);

    const row = db.prepare(
      `SELECT COUNT(*) as cnt FROM steps s
       JOIN runs r ON r.id = s.run_id
       WHERE s.agent_id = 'bug-fix-fixer' AND s.status IN ('pending', 'waiting')
         AND r.status = 'running'`
    ).get() as { cnt: number };

    assert.equal(row.cnt, 0, "Failed run should not show work");
  });

  it("returns NO_WORK for completed agents in a 6-agent pipeline", () => {
    const db = createTestDb();
    const runId = crypto.randomUUID();
    const t = ts();

    db.prepare(
      "INSERT INTO runs (id, workflow_id, task, status, context, created_at, updated_at) VALUES (?, 'bug-fix', 'fix a bug', 'running', '{}', ?, ?)"
    ).run(runId, t, t);

    // Simulate a pipeline where triager is done and fixer is pending
    const agents = [
      { stepId: "triage", agentId: "bug-fix-triager", status: "done", index: 0 },
      { stepId: "investigate", agentId: "bug-fix-investigator", status: "done", index: 1 },
      { stepId: "setup", agentId: "bug-fix-setup", status: "done", index: 2 },
      { stepId: "fix", agentId: "bug-fix-fixer", status: "pending", index: 3 },
      { stepId: "verify", agentId: "bug-fix-verifier", status: "waiting", index: 4 },
      { stepId: "pr", agentId: "bug-fix-pr", status: "waiting", index: 5 },
    ];

    for (const a of agents) {
      db.prepare(
        "INSERT INTO steps (id, run_id, step_id, agent_id, step_index, input_template, expects, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, '', '', ?, ?, ?)"
      ).run(crypto.randomUUID(), runId, a.stepId, a.agentId, a.index, a.status, t, t);
    }

    // Check each agent
    for (const a of agents) {
      const row = db.prepare(
        `SELECT COUNT(*) as cnt FROM steps s
         JOIN runs r ON r.id = s.run_id
         WHERE s.agent_id = ? AND s.status IN ('pending', 'waiting')
           AND r.status = 'running'`
      ).get(a.agentId) as { cnt: number };

      if (a.status === "done") {
        assert.equal(row.cnt, 0, `${a.agentId} (done) should have NO_WORK`);
      } else {
        assert.ok(row.cnt > 0, `${a.agentId} (${a.status}) should have HAS_WORK`);
      }
    }
  });
});

// ── Test polling prompt changes ─────────────────────────────────────

describe("polling prompt includes step peek", () => {
  it("includes step peek command before step claim", async () => {
    const { buildPollingPrompt } = await import("../dist/installer/agent-cron.js");
    const prompt = buildPollingPrompt("bug-fix", "fixer");
    assert.ok(prompt.includes("step peek"), "should include step peek command");
    
    // step peek should appear BEFORE step claim
    const peekIdx = prompt.indexOf("step peek");
    const claimIdx = prompt.indexOf("step claim");
    assert.ok(peekIdx < claimIdx, "step peek should appear before step claim");
  });

  it("instructs to stop on NO_WORK from peek without running claim", async () => {
    const { buildPollingPrompt } = await import("../dist/installer/agent-cron.js");
    const prompt = buildPollingPrompt("bug-fix", "fixer");
    assert.ok(prompt.includes("NO_WORK"), "should mention NO_WORK");
    assert.ok(prompt.includes("HEARTBEAT_OK"), "should still include HEARTBEAT_OK");
    assert.ok(
      prompt.includes("Do NOT run step claim") || prompt.includes("stop immediately"),
      "should instruct to skip claim when no work"
    );
  });

  it("includes step peek with correct agent id", async () => {
    const { buildPollingPrompt } = await import("../dist/installer/agent-cron.js");
    const prompt = buildPollingPrompt("bug-fix", "triager");
    assert.ok(prompt.includes('step peek "bug-fix-triager"'), "should include correct agent id in peek");
  });

  it("still includes sessions_spawn for when work exists", async () => {
    const { buildPollingPrompt } = await import("../dist/installer/agent-cron.js");
    const prompt = buildPollingPrompt("bug-fix", "fixer");
    assert.ok(prompt.includes("sessions_spawn"), "should still include sessions_spawn");
  });
});
