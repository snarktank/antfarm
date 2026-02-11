/**
 * Regression test: Abandoned step cleanup must run proactively
 *
 * Bug: Steps that timeout or crash remain stuck in "running" status for up to 15 minutes.
 * The cleanupAbandonedSteps() function only runs when agents poll for work (piggybacked
 * on claimStep). In single-agent workflows or when all agents are waiting, nobody triggers
 * cleanup and steps stay stuck indefinitely.
 *
 * Fix: Added independent cleanup cron job that runs every 2 minutes, reduced threshold
 * from 15 minutes to 3 minutes for faster recovery.
 *
 * This test ensures:
 * 1. cleanupAbandonedSteps() is exported and can be called independently
 * 2. Steps abandoned for >3 minutes are reset to pending
 * 3. Cleanup works without requiring agent polling
 */

import { getDb } from "../dist/db.js";
import { cleanupAbandonedSteps } from "../dist/installer/step-ops.js";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

async function setupTestDb(): Promise<string> {
  // Create a temporary database for testing
  const tmpDb = path.join(os.tmpdir(), `antfarm-test-${crypto.randomUUID()}.db`);
  process.env.ANTFARM_DB_PATH = tmpDb;
  
  // Initialize DB schema
  const db = getDb();
  
  // Runs table
  db.exec(`
    CREATE TABLE IF NOT EXISTS runs (
      id TEXT PRIMARY KEY,
      workflow_id TEXT NOT NULL,
      task TEXT NOT NULL,
      context TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  
  // Steps table
  db.exec(`
    CREATE TABLE IF NOT EXISTS steps (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      step_id TEXT NOT NULL,
      step_index INTEGER NOT NULL,
      agent_id TEXT NOT NULL,
      input_template TEXT NOT NULL,
      expects TEXT NOT NULL,
      status TEXT NOT NULL,
      output TEXT,
      retry_count INTEGER NOT NULL DEFAULT 0,
      max_retries INTEGER NOT NULL DEFAULT 2,
      type TEXT NOT NULL DEFAULT 'single',
      loop_config TEXT,
      current_story_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  
  // Stories table
  db.exec(`
    CREATE TABLE IF NOT EXISTS stories (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      story_index INTEGER NOT NULL,
      story_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      acceptance_criteria TEXT NOT NULL,
      status TEXT NOT NULL,
      output TEXT,
      retry_count INTEGER NOT NULL DEFAULT 0,
      max_retries INTEGER NOT NULL DEFAULT 2,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  
  return tmpDb;
}

async function cleanup(dbPath: string): Promise<void> {
  try {
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
    }
  } catch {
    // best effort
  }
}

function createTestRun(): { runId: string; stepId: string } {
  const db = getDb();
  const runId = crypto.randomUUID();
  const stepId = crypto.randomUUID();
  const now = new Date().toISOString();
  
  // Create a run
  db.prepare(`
    INSERT INTO runs (id, workflow_id, task, context, status, created_at, updated_at)
    VALUES (?, 'test-workflow', 'test task', '{}', 'running', ?, ?)
  `).run(runId, now, now);
  
  // Create a step that's been "running" for 4 minutes (past the 3-minute threshold)
  const fourMinutesAgo = new Date(Date.now() - 4 * 60 * 1000).toISOString();
  db.prepare(`
    INSERT INTO steps (
      id, run_id, step_id, step_index, agent_id, input_template, expects,
      status, retry_count, max_retries, type, created_at, updated_at
    )
    VALUES (?, ?, 'test-step', 0, 'test-agent', 'test input', 'STATUS', 'running', 0, 2, 'single', ?, ?)
  `).run(stepId, runId, fourMinutesAgo, fourMinutesAgo);
  
  return { runId, stepId };
}

async function testAbandonedStepIsReset(): Promise<void> {
  console.log("Test: Abandoned step (>3 minutes old) is reset to pending...");
  
  const { runId, stepId } = createTestRun();
  const db = getDb();
  
  // Verify step is running
  const beforeCleanup = db.prepare("SELECT status, retry_count FROM steps WHERE id = ?").get(stepId) as { status: string; retry_count: number };
  if (beforeCleanup.status !== "running") {
    throw new Error(`Expected step to be running, got "${beforeCleanup.status}"`);
  }
  console.log("  ✓ Step is running before cleanup");
  
  // Run cleanup (this simulates the cleanup cron job running)
  cleanupAbandonedSteps();
  
  // Verify step is now pending
  const afterCleanup = db.prepare("SELECT status, retry_count FROM steps WHERE id = ?").get(stepId) as { status: string; retry_count: number };
  if (afterCleanup.status !== "pending") {
    throw new Error(`Expected step to be pending after cleanup, got "${afterCleanup.status}"`);
  }
  if (afterCleanup.retry_count !== 1) {
    throw new Error(`Expected retry_count to be 1, got ${afterCleanup.retry_count}`);
  }
  console.log("  ✓ Step reset to pending with retry_count = 1");
  console.log("PASS: Abandoned step cleanup works\n");
}

async function testRecentStepNotReset(): Promise<void> {
  console.log("Test: Recent step (<3 minutes old) is NOT reset...");
  
  const db = getDb();
  const runId = crypto.randomUUID();
  const stepId = crypto.randomUUID();
  const now = new Date().toISOString();
  
  // Create a run
  db.prepare(`
    INSERT INTO runs (id, workflow_id, task, context, status, created_at, updated_at)
    VALUES (?, 'test-workflow', 'test task', '{}', 'running', ?, ?)
  `).run(runId, now, now);
  
  // Create a step that's been running for only 1 minute (within the 3-minute threshold)
  const oneMinuteAgo = new Date(Date.now() - 1 * 60 * 1000).toISOString();
  db.prepare(`
    INSERT INTO steps (
      id, run_id, step_id, step_index, agent_id, input_template, expects,
      status, retry_count, max_retries, type, created_at, updated_at
    )
    VALUES (?, ?, 'test-step-2', 0, 'test-agent', 'test input', 'STATUS', 'running', 0, 2, 'single', ?, ?)
  `).run(stepId, runId, oneMinuteAgo, oneMinuteAgo);
  
  // Run cleanup
  cleanupAbandonedSteps();
  
  // Verify step is still running
  const afterCleanup = db.prepare("SELECT status, retry_count FROM steps WHERE id = ?").get(stepId) as { status: string; retry_count: number };
  if (afterCleanup.status !== "running") {
    throw new Error(`Expected recent step to remain running, got "${afterCleanup.status}"`);
  }
  if (afterCleanup.retry_count !== 0) {
    throw new Error(`Expected retry_count to be 0, got ${afterCleanup.retry_count}`);
  }
  console.log("  ✓ Recent step remains running");
  console.log("PASS: Recent steps are not reset\n");
}

async function testMaxRetriesExhaustedFailsStep(): Promise<void> {
  console.log("Test: Step with exhausted retries is marked failed...");
  
  const db = getDb();
  const runId = crypto.randomUUID();
  const stepId = crypto.randomUUID();
  const now = new Date().toISOString();
  
  // Create a run
  db.prepare(`
    INSERT INTO runs (id, workflow_id, task, context, status, created_at, updated_at)
    VALUES (?, 'test-workflow', 'test task', '{}', 'running', ?, ?)
  `).run(runId, now, now);
  
  // Create a step that's been running for 4 minutes and already at max retries
  const fourMinutesAgo = new Date(Date.now() - 4 * 60 * 1000).toISOString();
  db.prepare(`
    INSERT INTO steps (
      id, run_id, step_id, step_index, agent_id, input_template, expects,
      status, retry_count, max_retries, type, created_at, updated_at
    )
    VALUES (?, ?, 'test-step-3', 0, 'test-agent', 'test input', 'STATUS', 'running', 2, 2, 'single', ?, ?)
  `).run(stepId, runId, fourMinutesAgo, fourMinutesAgo);
  
  // Run cleanup
  cleanupAbandonedSteps();
  
  // Verify step is failed
  const afterCleanup = db.prepare("SELECT status FROM steps WHERE id = ?").get(stepId) as { status: string };
  if (afterCleanup.status !== "failed") {
    throw new Error(`Expected step to be failed, got "${afterCleanup.status}"`);
  }
  
  // Verify run is also failed
  const runStatus = db.prepare("SELECT status FROM runs WHERE id = ?").get(runId) as { status: string };
  if (runStatus.status !== "failed") {
    throw new Error(`Expected run to be failed, got "${runStatus.status}"`);
  }
  
  console.log("  ✓ Step marked as failed");
  console.log("  ✓ Run marked as failed");
  console.log("PASS: Exhausted retries fail the step and run\n");
}

async function runTests(): Promise<void> {
  console.log("\n=== Abandoned Step Cleanup Regression Tests ===\n");
  
  const dbPath = await setupTestDb();
  
  try {
    await testAbandonedStepIsReset();
    await testRecentStepNotReset();
    await testMaxRetriesExhaustedFailsStep();
    
    console.log("All tests passed! ✓\n");
    process.exit(0);
  } catch (err) {
    console.error("\nFAIL:", err);
    process.exit(1);
  } finally {
    await cleanup(dbPath);
  }
}

runTests();
