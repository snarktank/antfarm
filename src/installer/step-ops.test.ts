import { test } from "node:test";
import assert from "node:assert";
import { getDb } from "../db.js";
import {
  claimStep,
  completeStep,
  getStepTiming,
} from "./step-ops.js";

// Test helper to clean up test data
function cleanupTestData(runId: string) {
  const db = getDb();
  try {
    db.prepare("DELETE FROM stories WHERE run_id = ?").run(runId);
    db.prepare("DELETE FROM steps WHERE run_id = ?").run(runId);
    db.prepare("DELETE FROM runs WHERE id = ?").run(runId);
  } catch {}
}

test("claimStep sets claimed_at timestamp", () => {
  const db = getDb();
  const now = new Date().toISOString();

  // Create a test run and pending step
  const runId = `test-run-claim-${Date.now()}`;
  const stepId = `test-step-claim-${Date.now()}`;
  const agentId = `test-agent-claim-${Date.now()}`;

  db.prepare(
    "INSERT INTO runs (id, workflow_id, task, status, context, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(runId, "test-workflow", "test task", "running", "{}", now, now);

  db.prepare(
    "INSERT INTO steps (id, run_id, step_id, agent_id, step_index, input_template, expects, status, created_at, updated_at, type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(stepId, runId, "step-1", agentId, 0, "Test input", "output", "pending", now, now, "single");

  try {
    // Claim the step
    const result = claimStep(agentId);

    assert.strictEqual(result.found, true);
    assert.strictEqual(result.stepId, stepId);

    // Check that claimed_at was set
    const step = db.prepare("SELECT claimed_at, started_at FROM steps WHERE id = ?").get(stepId) as {
      claimed_at: string | null;
      started_at: string | null;
    };

    assert.notStrictEqual(step.claimed_at, null, "claimed_at should be set");
    assert.notStrictEqual(step.started_at, null, "started_at should be set for single step");

    // Verify timestamps are valid ISO dates
    const claimedDate = new Date(step.claimed_at!);
    assert.ok(!isNaN(claimedDate.getTime()), "claimed_at should be a valid date");
  } finally {
    cleanupTestData(runId);
  }
});

test("completeStep sets completed_at timestamp", () => {
  const db = getDb();
  const now = new Date().toISOString();

  // Create a test run and running step
  const runId = `test-run-complete-${Date.now()}`;
  const stepId = `test-step-complete-${Date.now()}`;
  const agentId = `test-agent-complete-${Date.now()}`;

  db.prepare(
    "INSERT INTO runs (id, workflow_id, task, status, context, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(runId, "test-workflow", "test task", "running", "{}", now, now);

  db.prepare(
    "INSERT INTO steps (id, run_id, step_id, agent_id, step_index, input_template, expects, status, claimed_at, started_at, created_at, updated_at, type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(stepId, runId, "step-1", agentId, 0, "Test input", "output", "running", now, now, now, now, "single");

  try {
    // Complete the step
    const output = "STATUS: done\nREPO: /test/repo";
    completeStep(stepId, output);

    // Check that completed_at was set
    const step = db.prepare("SELECT status, completed_at FROM steps WHERE id = ?").get(stepId) as {
      status: string;
      completed_at: string | null;
    };

    assert.strictEqual(step.status, "done");
    assert.notStrictEqual(step.completed_at, null, "completed_at should be set");

    const completedDate = new Date(step.completed_at!);
    assert.ok(!isNaN(completedDate.getTime()), "completed_at should be a valid date");
  } finally {
    cleanupTestData(runId);
  }
});

test("getStepTiming returns correct latency metrics", () => {
  const db = getDb();

  // Create timestamps with known differences
  const baseTime = Date.now();
  const claimedAt = new Date(baseTime).toISOString();
  const startedAt = new Date(baseTime + 1000).toISOString(); // 1 second later
  const completedAt = new Date(baseTime + 5000).toISOString(); // 5 seconds later total

  const runId = `test-run-timing-${Date.now()}`;
  const stepId = `test-step-timing-${Date.now()}`;

  db.prepare(
    "INSERT INTO runs (id, workflow_id, task, status, context, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(runId, "test-workflow", "test task", "running", "{}", claimedAt, claimedAt);

  db.prepare(
    "INSERT INTO steps (id, run_id, step_id, agent_id, step_index, input_template, expects, status, claimed_at, started_at, completed_at, created_at, updated_at, type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(stepId, runId, "step-1", "test-agent", 0, "Test input", "output", "done", claimedAt, startedAt, completedAt, claimedAt, completedAt, "single");

  try {
    // Get timing metrics
    const timing = getStepTiming(runId);

    assert.strictEqual(timing.length, 1);

    const stepTiming = timing[0];
    assert.strictEqual(stepTiming.stepId, "step-1");
    assert.strictEqual(stepTiming.status, "done");
    assert.strictEqual(stepTiming.claimedAt, claimedAt);
    assert.strictEqual(stepTiming.startedAt, startedAt);
    assert.strictEqual(stepTiming.completedAt, completedAt);

    // Check calculated latencies (within 10ms tolerance for test timing)
    assert.ok(stepTiming.claimToStartMs !== null && stepTiming.claimToStartMs >= 1000,
      `claimToStartMs should be >= 1000, got ${stepTiming.claimToStartMs}`);
    assert.ok(stepTiming.claimToStartMs !== null && stepTiming.claimToStartMs < 1100,
      `claimToStartMs should be < 1100, got ${stepTiming.claimToStartMs}`);
    assert.ok(stepTiming.startToCompleteMs !== null && stepTiming.startToCompleteMs >= 4000,
      `startToCompleteMs should be >= 4000, got ${stepTiming.startToCompleteMs}`);
    assert.ok(stepTiming.startToCompleteMs !== null && stepTiming.startToCompleteMs < 4100,
      `startToCompleteMs should be < 4100, got ${stepTiming.startToCompleteMs}`);
    assert.ok(stepTiming.claimToCompleteMs !== null && stepTiming.claimToCompleteMs >= 5000,
      `claimToCompleteMs should be >= 5000, got ${stepTiming.claimToCompleteMs}`);
    assert.ok(stepTiming.claimToCompleteMs !== null && stepTiming.claimToCompleteMs < 5100,
      `claimToCompleteMs should be < 5100, got ${stepTiming.claimToCompleteMs}`);
  } finally {
    cleanupTestData(runId);
  }
});

test("getStepTiming handles partial timestamps gracefully", () => {
  const db = getDb();
  const now = new Date().toISOString();

  const runId = `test-run-partial-${Date.now()}`;

  db.prepare(
    "INSERT INTO runs (id, workflow_id, task, status, context, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(runId, "test-workflow", "test task", "running", "{}", now, now);

  // Step with only claimed_at (pending -> claimed but not started)
  db.prepare(
    "INSERT INTO steps (id, run_id, step_id, agent_id, step_index, input_template, expects, status, claimed_at, created_at, updated_at, type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(`step-pending-${Date.now()}`, runId, "step-pending", "agent-1", 0, "Test", "output", "pending", now, now, now, "single");

  // Step with claimed_at and started_at (running)
  db.prepare(
    "INSERT INTO steps (id, run_id, step_id, agent_id, step_index, input_template, expects, status, claimed_at, started_at, created_at, updated_at, type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(`step-running-${Date.now()}`, runId, "step-running", "agent-2", 1, "Test", "output", "running", now, now, now, now, "single");

  try {
    const timing = getStepTiming(runId);

    assert.strictEqual(timing.length, 2);

    // Find steps by stepId
    const pendingTiming = timing.find(t => t.stepId === "step-pending")!;
    const runningTiming = timing.find(t => t.stepId === "step-running")!;

    // First step: only claimed_at (but actually our code sets started_at for single steps on claim)
    // So pending step should have nulls since it was never claimed/started
    assert.strictEqual(pendingTiming.claimedAt, now);
    assert.strictEqual(pendingTiming.startedAt, null); // never started
    assert.strictEqual(pendingTiming.claimToStartMs, null);
    assert.strictEqual(pendingTiming.claimToCompleteMs, null);
    assert.strictEqual(pendingTiming.startToCompleteMs, null);

    // Second step: claimed and started but not completed
    assert.notStrictEqual(runningTiming.claimedAt, null);
    assert.notStrictEqual(runningTiming.startedAt, null);
    assert.notStrictEqual(runningTiming.claimToStartMs, null);
    assert.strictEqual(runningTiming.claimToCompleteMs, null);
    assert.strictEqual(runningTiming.startToCompleteMs, null);
  } finally {
    cleanupTestData(runId);
  }
});

test("timing tracking works end-to-end for a complete step lifecycle", async () => {
  const db = getDb();
  const now = new Date().toISOString();

  const runId = `test-run-e2e-${Date.now()}`;
  const stepId = `test-step-e2e-${Date.now()}`;
  const agentId = `test-agent-e2e-${Date.now()}`;

  db.prepare(
    "INSERT INTO runs (id, workflow_id, task, status, context, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(runId, "test-workflow", "e2e test", "running", "{}", now, now);

  db.prepare(
    "INSERT INTO steps (id, run_id, step_id, agent_id, step_index, input_template, expects, status, created_at, updated_at, type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(stepId, runId, "e2e-step", agentId, 0, "E2E test input", "output", "pending", now, now, "single");

  try {
    // Step 1: Claim (sets claimed_at and started_at)
    const claimResult = claimStep(agentId);
    assert.strictEqual(claimResult.found, true);

    // Verify timestamps after claim
    const afterClaim = db.prepare("SELECT claimed_at, started_at, completed_at FROM steps WHERE id = ?").get(stepId) as {
      claimed_at: string | null;
      started_at: string | null;
      completed_at: string | null;
    };
    assert.notStrictEqual(afterClaim.claimed_at, null, "claimed_at should be set after claim");
    assert.notStrictEqual(afterClaim.started_at, null, "started_at should be set after claim (single step)");
    assert.strictEqual(afterClaim.completed_at, null, "completed_at should NOT be set after claim");

    // Small delay to ensure measurable time difference
    await new Promise(r => setTimeout(r, 50));

    // Step 2: Complete (sets completed_at)
    const output = "STATUS: done\nREPO: /test/repo";
    completeStep(stepId, output);

    // Verify timestamps after complete
    const afterComplete = db.prepare("SELECT claimed_at, started_at, completed_at, status FROM steps WHERE id = ?").get(stepId) as {
      claimed_at: string | null;
      started_at: string | null;
      completed_at: string | null;
      status: string;
    };
    assert.notStrictEqual(afterComplete.completed_at, null, "completed_at should be set after complete");
    assert.strictEqual(afterComplete.status, "done");

    // Step 3: Check timing metrics
    const timing = getStepTiming(runId);
    assert.strictEqual(timing.length, 1);

    const stepTiming = timing[0];
    assert.ok(stepTiming.claimToStartMs !== null && stepTiming.claimToStartMs >= 0, "claimToStartMs should be >= 0");
    assert.ok(stepTiming.startToCompleteMs !== null && stepTiming.startToCompleteMs >= 50,
      `startToCompleteMs should be >= 50, got ${stepTiming.startToCompleteMs}`);
    assert.ok(stepTiming.claimToCompleteMs !== null && stepTiming.claimToCompleteMs >= 50,
      `claimToCompleteMs should be >= 50, got ${stepTiming.claimToCompleteMs}`);
  } finally {
    cleanupTestData(runId);
  }
});
