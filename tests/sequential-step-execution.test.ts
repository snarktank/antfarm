#!/usr/bin/env node
/**
 * Regression test for sequential step execution within workflow runs
 * Tests the fix for: steps being claimed out of order when same agent handles multiple steps
 * 
 * Bug: When an agent was assigned to multiple steps in a workflow, claimStep would
 * find the first pending step by step_index across ALL runs, causing the agent to
 * repeatedly claim "step 1" from new runs instead of completing "step 2" in older runs.
 * 
 * Fix: claimStep now:
 * 1. Orders runs by creation time (oldest first)
 * 2. Checks that all previous steps in a run are complete before claiming
 */

import { getDb } from "../dist/db.js";
import { claimStep, completeStep } from "../dist/installer/step-ops.js";
import crypto from "node:crypto";

const db = getDb();

// Test setup helper
function setupTestRun(runId: string, workflowId: string, agentId: string, stepCount: number) {
  const now = new Date().toISOString();
  
  // Create run
  db.prepare(
    "INSERT INTO runs (id, workflow_id, task, status, context, created_at, updated_at) VALUES (?, ?, ?, 'running', ?, ?, ?)"
  ).run(runId, workflowId, `Test run ${runId.slice(0, 8)}`, JSON.stringify({}), now, now);
  
  // Create steps
  for (let i = 0; i < stepCount; i++) {
    const stepId = crypto.randomUUID();
    db.prepare(
      "INSERT INTO steps (id, run_id, step_id, agent_id, status, input_template, type, step_index, retry_count, max_retries, expects, created_at, updated_at) VALUES (?, ?, ?, ?, 'pending', ?, 'single', ?, 0, 2, 'STATUS: done', ?, ?)"
    ).run(stepId, runId, `step-${i}`, agentId, `Input for step ${i}`, i, now, now);
  }
  
  return runId;
}

// Cleanup helper
function cleanupTestRun(runId: string) {
  db.prepare("DELETE FROM steps WHERE run_id = ?").run(runId);
  db.prepare("DELETE FROM runs WHERE id = ?").run(runId);
}

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
  } catch (e) {
    console.log(`  ✗ ${name}: ${e instanceof Error ? e.message : String(e)}`);
    process.exitCode = 1;
  }
}

function assertEqual(actual: any, expected: any, msg?: string) {
  if (actual !== expected) {
    throw new Error(msg || `Expected ${expected}, got ${actual}`);
  }
}

console.log("=== Sequential Step Execution Regression Tests ===\n");

// Test 1: Steps within a run execute sequentially
test("steps within a run execute in order (step 0 before step 1)", () => {
  const uniqueAgent = `test-agent-seq-${Date.now()}`;
  const runId = setupTestRun(`test-seq-1-${Date.now()}`, "test-workflow", uniqueAgent, 2);
  
  try {
    // First claim should get step-0
    const claim1 = claimStep(uniqueAgent);
    if (!claim1.found) throw new Error("Expected to claim a step");
    assertEqual(claim1.resolvedInput?.includes("step 0"), true, "First claim should be step 0");
    
    // Second claim (while step-0 is still running) should find no work
    const claim2 = claimStep(uniqueAgent);
    assertEqual(claim2.found, false, "Should not claim step 1 while step 0 is running");
    
    // Complete step 0
    completeStep(claim1.stepId!, "STATUS: done\nRESULT: step0-complete");
    
    // Now step 1 should be claimable
    const claim3 = claimStep(uniqueAgent);
    if (!claim3.found) throw new Error("Expected to claim step 1 after step 0 completed");
    assertEqual(claim3.resolvedInput?.includes("step 1"), true, "Second claim should be step 1");
    
    // Cleanup
    completeStep(claim3.stepId!, "STATUS: done");
  } finally {
    cleanupTestRun(runId);
  }
});

// Test 2: Older runs are prioritized over newer runs
test("older runs are prioritized over newer runs", () => {
  const uniqueAgent = `test-agent-prio-${Date.now()}`;
  const olderRunId = setupTestRun(`test-old-${Date.now()}`, "test-workflow", uniqueAgent, 2);
  
  // Small delay to ensure different timestamps
  const startTime = Date.now();
  while (Date.now() - startTime < 50) {} // busy wait for 50ms
  
  const newerRunId = setupTestRun(`test-new-${Date.now()}`, "test-workflow", uniqueAgent, 2);
  
  try {
    // Complete step 0 in older run
    const olderClaim = claimStep(uniqueAgent);
    if (!olderClaim.found) throw new Error("Expected to claim step from older run");
    completeStep(olderClaim.stepId!, "STATUS: done");
    
    // Next claim should be step 1 from older run, not step 0 from newer run
    const nextClaim = claimStep(uniqueAgent);
    if (!nextClaim.found) throw new Error("Expected to claim next step");
    assertEqual(nextClaim.runId, olderRunId, "Should continue with older run before starting newer run");
    assertEqual(nextClaim.resolvedInput?.includes("step 1"), true, "Should be step 1 from older run");
    
    // Cleanup
    completeStep(nextClaim.stepId!, "STATUS: done");
    
    // Now should get step 0 from newer run
    const newRunClaim = claimStep(uniqueAgent);
    if (!newRunClaim.found) throw new Error("Expected to claim from newer run after older run done");
    assertEqual(newRunClaim.runId, newerRunId, "Should now claim from newer run");
  } finally {
    cleanupTestRun(olderRunId);
    cleanupTestRun(newerRunId);
  }
});

// Test 3: Multiple runs with same agent don't interleave steps
test("steps don't interleave between runs - complete one run before starting next", () => {
  const uniqueAgent = `test-agent-no-interleave-${Date.now()}`;
  const run1Id = setupTestRun(`test-run1-${Date.now()}`, "test-workflow", uniqueAgent, 3);
  
  const startTime = Date.now();
  while (Date.now() - startTime < 50) {}
  
  const run2Id = setupTestRun(`test-run2-${Date.now()}`, "test-workflow", uniqueAgent, 2);
  
  try {
    // Complete all steps in run 1
    for (let i = 0; i < 3; i++) {
      const claim = claimStep(uniqueAgent);
      if (!claim.found) throw new Error(`Expected to claim step ${i} from run 1`);
      assertEqual(claim.runId, run1Id, `Step ${i} should be from run 1`);
      completeStep(claim.stepId!, `STATUS: done\nSTEP: ${i}`);
    }
    
    // Now should start run 2
    const run2Claim = claimStep(uniqueAgent);
    if (!run2Claim.found) throw new Error("Expected to claim from run 2");
    assertEqual(run2Claim.runId, run2Id, "Should now be claiming from run 2");
    completeStep(run2Claim.stepId!, "STATUS: done");
  } finally {
    cleanupTestRun(run1Id);
    cleanupTestRun(run2Id);
  }
});

console.log("\n=== Test Summary ===");
if (process.exitCode === 1) {
  console.log("Some tests failed!");
  process.exit(1);
} else {
  console.log("All tests passed! ✓");
}
