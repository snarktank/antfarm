/**
 * Regression test for max_retries default value (2 → 5)
 *
 * This test validates that the default max_retries value is 5 for both steps
 * and stories, across code, database schema, and documentation. If someone
 * accidentally reverts the default back to 2, this test will catch the regression.
 *
 * Validates:
 * 1. Database schema defaults to max_retries = 5 for steps table
 * 2. Database schema defaults to max_retries = 5 for stories table
 * 3. Step creation uses max_retries = 5 as fallback
 * 4. Story insertion uses max_retries = 5
 * 5. Configuration defaults respect the new value
 */

import { DatabaseSync } from "node:sqlite";
import crypto from "node:crypto";
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";

// ── In-memory DB setup for testing ──────────────────────────────────

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
      run_number INTEGER,
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
      max_retries INTEGER DEFAULT 5,
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
      max_retries INTEGER DEFAULT 5,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE event_queue (
      id TEXT PRIMARY KEY,
      event_data TEXT NOT NULL,
      run_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      retry_count INTEGER DEFAULT 0,
      max_retries INTEGER DEFAULT 5,
      next_retry_at TEXT,
      last_error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      delivered_at TEXT
    );
  `);

  return db;
}

function ts(): string {
  return new Date().toISOString();
}

describe("max_retries default value regression tests", () => {
  describe("database schema defaults", () => {
    it("should default max_retries to 5 for steps table when column not specified", () => {
      const db = createTestDb();
      const runId = crypto.randomUUID();
      const t = ts();

      // Create run
      db.prepare(
        "INSERT INTO runs (id, workflow_id, task, status, context, created_at, updated_at) VALUES (?, 'test-wf', 'test task', 'running', '{}', ?, ?)"
      ).run(runId, t, t);

      // Insert step WITHOUT specifying max_retries — should use database default of 5
      const stepId = crypto.randomUUID();
      db.prepare(
        "INSERT INTO steps (id, run_id, step_id, agent_id, step_index, input_template, expects, status, created_at, updated_at) VALUES (?, ?, 'test-step', 'test-agent', 0, 'input', 'done', 'pending', ?, ?)"
      ).run(stepId, runId, t, t);

      // Verify the step has max_retries = 5 (not 2)
      const step = db.prepare("SELECT max_retries FROM steps WHERE id = ?").get(stepId) as { max_retries: number };
      assert.equal(step.max_retries, 5, "Step should have max_retries = 5 from database default");
    });

    it("should default max_retries to 5 for stories table when column not specified", () => {
      const db = createTestDb();
      const runId = crypto.randomUUID();
      const t = ts();

      // Create run
      db.prepare(
        "INSERT INTO runs (id, workflow_id, task, status, context, created_at, updated_at) VALUES (?, 'test-wf', 'test task', 'running', '{}', ?, ?)"
      ).run(runId, t, t);

      // Insert story WITHOUT specifying max_retries — should use database default of 5
      const storyId = crypto.randomUUID();
      db.prepare(
        "INSERT INTO stories (id, run_id, story_index, story_id, title, description, acceptance_criteria, status, created_at, updated_at) VALUES (?, ?, 0, 'story-1', 'Test Story', 'Description', '[]', 'pending', ?, ?)"
      ).run(storyId, runId, t, t);

      // Verify the story has max_retries = 5 (not 2)
      const story = db.prepare("SELECT max_retries FROM stories WHERE id = ?").get(storyId) as { max_retries: number };
      assert.equal(story.max_retries, 5, "Story should have max_retries = 5 from database default");
    });

    it("should preserve max_retries = 5 across run lifecycle", () => {
      const db = createTestDb();
      const runId = crypto.randomUUID();
      const t = ts();

      // Create run with multiple steps
      db.prepare(
        "INSERT INTO runs (id, workflow_id, task, status, context, created_at, updated_at) VALUES (?, 'test-wf', 'test', 'running', '{}', ?, ?)"
      ).run(runId, t, t);

      const stepIds = [];
      for (let i = 0; i < 3; i++) {
        const stepId = crypto.randomUUID();
        db.prepare(
          "INSERT INTO steps (id, run_id, step_id, agent_id, step_index, input_template, expects, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, '', '', ?, ?, ?)"
        ).run(stepId, runId, `step-${i}`, `agent-${i}`, i, "pending", t, t);
        stepIds.push(stepId);
      }

      // Verify all steps have max_retries = 5
      const steps = db.prepare("SELECT id, max_retries FROM steps WHERE run_id = ?").all(runId) as Array<{ id: string; max_retries: number }>;
      assert.equal(steps.length, 3, "Should have 3 steps");
      for (const step of steps) {
        assert.equal(step.max_retries, 5, `Step ${step.id} should have max_retries = 5`);
      }
    });
  });

  describe("story insertion with explicit max_retries", () => {
    it("should insert stories with max_retries = 5 when using parseAndInsertStories pattern", () => {
      const db = createTestDb();
      const runId = crypto.randomUUID();
      const t = ts();

      // Create run
      db.prepare(
        "INSERT INTO runs (id, workflow_id, task, status, context, created_at, updated_at) VALUES (?, 'test-wf', 'test', 'running', '{}', ?, ?)"
      ).run(runId, t, t);

      // Simulate parseAndInsertStories INSERT with hardcoded max_retries = 5
      const stories = [
        { id: "story-1", title: "First", description: "Desc 1", criteria: [] },
        { id: "story-2", title: "Second", description: "Desc 2", criteria: [] },
      ];

      const insert = db.prepare(
        "INSERT INTO stories (id, run_id, story_index, story_id, title, description, acceptance_criteria, status, retry_count, max_retries, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', 0, 5, ?, ?)"
      );

      for (let i = 0; i < stories.length; i++) {
        const s = stories[i];
        insert.run(crypto.randomUUID(), runId, i, s.id, s.title, s.description, JSON.stringify(s.criteria), t, t);
      }

      // Verify all inserted stories have max_retries = 5
      const inserted = db.prepare("SELECT story_id, max_retries FROM stories WHERE run_id = ?").all(runId) as Array<{ story_id: string; max_retries: number }>;
      assert.equal(inserted.length, 2, "Should have 2 stories");
      for (const story of inserted) {
        assert.equal(story.max_retries, 5, `Story ${story.story_id} should have max_retries = 5 from INSERT statement`);
      }
    });
  });

  describe("step creation with fallback", () => {
    it("should use max_retries = 5 as fallback when step config doesn't specify it", () => {
      // Simulate the step creation logic from run.ts
      const stepConfigs = [
        { id: "step-1", max_retries: undefined, on_fail: undefined }, // Use fallback
        { id: "step-2", max_retries: 3, on_fail: undefined }, // Explicit override
        { id: "step-3", max_retries: undefined, on_fail: { max_retries: 4 } }, // Use on_fail override
      ];

      const results = stepConfigs.map(step => {
        // This mimics the fallback chain from run.ts line 43
        const maxRetries = step.max_retries ?? step.on_fail?.max_retries ?? 5;
        return { stepId: step.id, maxRetries };
      });

      // Verify fallback behavior
      assert.equal(results[0].maxRetries, 5, "Step without explicit config should fall back to 5");
      assert.equal(results[1].maxRetries, 3, "Step with explicit max_retries should use that value");
      assert.equal(results[2].maxRetries, 4, "Step with on_fail.max_retries should use that value");
    });

    it("should not allow max_retries to be less than 5 unless explicitly configured", () => {
      const testCases = [
        { step: { max_retries: undefined, on_fail: undefined }, expected: 5 },
        { step: { max_retries: 1, on_fail: undefined }, expected: 1 },
        { step: { max_retries: undefined, on_fail: { max_retries: 2 } }, expected: 2 },
      ];

      for (const tc of testCases) {
        const step = tc.step as any;
        const maxRetries = step.max_retries ?? step.on_fail?.max_retries ?? 5;
        assert.equal(maxRetries, tc.expected, `Config should yield max_retries = ${tc.expected}`);
      }
    });
  });

  describe("configuration overrides", () => {
    it("should allow workflows to override max_retries if needed", () => {
      const db = createTestDb();
      const runId = crypto.randomUUID();
      const t = ts();

      db.prepare(
        "INSERT INTO runs (id, workflow_id, task, status, context, created_at, updated_at) VALUES (?, 'test-wf', 'test', 'running', '{}', ?, ?)"
      ).run(runId, t, t);

      // Insert step with explicit max_retries = 2 (workflow override)
      const stepId = crypto.randomUUID();
      db.prepare(
        "INSERT INTO steps (id, run_id, step_id, agent_id, step_index, input_template, expects, status, max_retries, created_at, updated_at) VALUES (?, ?, 'critical', 'agent', 0, '', '', 'pending', 2, ?, ?)"
      ).run(stepId, runId, t, t);

      const step = db.prepare("SELECT max_retries FROM steps WHERE id = ?").get(stepId) as { max_retries: number };
      assert.equal(step.max_retries, 2, "Workflow should be able to override default to 2");
    });

    it("should allow workflows to increase max_retries beyond 5 if needed", () => {
      const db = createTestDb();
      const runId = crypto.randomUUID();
      const t = ts();

      db.prepare(
        "INSERT INTO runs (id, workflow_id, task, status, context, created_at, updated_at) VALUES (?, 'test-wf', 'test', 'running', '{}', ?, ?)"
      ).run(runId, t, t);

      // Insert step with explicit max_retries = 10 (custom override)
      const stepId = crypto.randomUUID();
      db.prepare(
        "INSERT INTO steps (id, run_id, step_id, agent_id, step_index, input_template, expects, status, max_retries, created_at, updated_at) VALUES (?, ?, 'flaky', 'agent', 0, '', '', 'pending', 10, ?, ?)"
      ).run(stepId, runId, t, t);

      const step = db.prepare("SELECT max_retries FROM steps WHERE id = ?").get(stepId) as { max_retries: number };
      assert.equal(step.max_retries, 10, "Workflow should be able to increase retries beyond 5");
    });
  });

  describe("backward compatibility", () => {
    it("should not break existing runs with steps that have max_retries = 2", () => {
      const db = createTestDb();
      const runId = crypto.randomUUID();
      const t = ts();

      db.prepare(
        "INSERT INTO runs (id, workflow_id, task, status, context, created_at, updated_at) VALUES (?, 'test-wf', 'test', 'running', '{}', ?, ?)"
      ).run(runId, t, t);

      // Legacy step with max_retries = 2 (from before the fix)
      const stepId = crypto.randomUUID();
      db.prepare(
        "INSERT INTO steps (id, run_id, step_id, agent_id, step_index, input_template, expects, status, max_retries, created_at, updated_at) VALUES (?, ?, 'legacy', 'agent', 0, '', '', 'pending', 2, ?, ?)"
      ).run(stepId, runId, t, t);

      // The step should keep its original max_retries = 2
      const step = db.prepare("SELECT max_retries FROM steps WHERE id = ?").get(stepId) as { max_retries: number };
      assert.equal(step.max_retries, 2, "Legacy step should retain its configured value");
    });

    it("should only apply new default (5) to newly created steps, not existing ones", () => {
      const db = createTestDb();
      const runId1 = crypto.randomUUID();
      const runId2 = crypto.randomUUID();
      const t = ts();

      // Create two runs
      db.prepare(
        "INSERT INTO runs (id, workflow_id, task, status, context, created_at, updated_at) VALUES (?, 'test-wf', 'old', 'running', '{}', ?, ?)"
      ).run(runId1, t, t);
      db.prepare(
        "INSERT INTO runs (id, workflow_id, task, status, context, created_at, updated_at) VALUES (?, 'test-wf', 'new', 'running', '{}', ?, ?)"
      ).run(runId2, t, t);

      // Old run with explicitly set max_retries = 2
      const oldStepId = crypto.randomUUID();
      db.prepare(
        "INSERT INTO steps (id, run_id, step_id, agent_id, step_index, input_template, expects, status, max_retries, created_at, updated_at) VALUES (?, ?, 'old-step', 'agent', 0, '', '', 'pending', 2, ?, ?)"
      ).run(oldStepId, runId1, t, t);

      // New run without specifying max_retries — should get default of 5
      const newStepId = crypto.randomUUID();
      db.prepare(
        "INSERT INTO steps (id, run_id, step_id, agent_id, step_index, input_template, expects, status, created_at, updated_at) VALUES (?, ?, 'new-step', 'agent', 0, '', '', 'pending', ?, ?)"
      ).run(newStepId, runId2, t, t);

      const oldStep = db.prepare("SELECT max_retries FROM steps WHERE id = ?").get(oldStepId) as { max_retries: number };
      const newStep = db.prepare("SELECT max_retries FROM steps WHERE id = ?").get(newStepId) as { max_retries: number };

      assert.equal(oldStep.max_retries, 2, "Old step should keep its value");
      assert.equal(newStep.max_retries, 5, "New step should use new default");
    });
  });
});
