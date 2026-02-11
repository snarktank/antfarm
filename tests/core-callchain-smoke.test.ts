/**
 * Smoke test: core callchain (CLI → workflow run → step claim/complete)
 *
 * This test verifies the primary orchestration path that powers Antfarm:
 * 1. Start a workflow run
 * 2. Claim a pending step (agent cron entry point)
 * 3. Complete the step
 * 4. Verify pipeline advancement
 *
 * A failure here indicates a regression in the main execution path.
 */

import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { getDb } from "../dist/db.js";
import { runWorkflow } from "../dist/installer/run.js";
import { claimStep, completeStep, failStep } from "../dist/installer/step-ops.js";

// ── Test Constants ─────────────────────────────────────────────────────

const WORKFLOW_ID = "smoke-test";

const MINIMAL_WORKFLOW = `
id: smoke-test
name: Smoke Test Workflow
version: 1

agents:
  - id: agent1
    name: Agent One
    workspace:
      baseDir: agents/agent1
      files:
        AGENTS.md: agents/agent1/AGENTS.md

steps:
  - id: step1
    agent: agent1
    input: "Do the work: {{task}}"
    expects: STATUS

  - id: step2
    agent: agent1
    input: "Complete the task: {{STATUS}}"
    expects: DONE
`;

// ── Setup/Teardown ───────────────────────────────────────────────────────

const ANTFARM_WORKFLOWS_DIR = path.join(os.homedir(), ".openclaw", "antfarm", "workflows");
const OPENCLAW_AGENTS_DIR = path.join(os.homedir(), ".openclaw", "workspaces", "workflows");

async function setupTestWorkflow(): Promise<void> {
  const workflowDir = path.join(ANTFARM_WORKFLOWS_DIR, WORKFLOW_ID);
  const agentDir = path.join(OPENCLAW_AGENTS_DIR, WORKFLOW_ID, "agents", "agent1");

  // Create workflow directory
  await fs.mkdir(workflowDir, { recursive: true });
  await fs.writeFile(path.join(workflowDir, "workflow.yml"), MINIMAL_WORKFLOW);

  // Create minimal agent file
  await fs.mkdir(agentDir, { recursive: true });
  await fs.writeFile(path.join(agentDir, "AGENTS.md"), "# Agent One");
}

async function cleanupTestWorkflow(): Promise<void> {
  const workflowDir = path.join(ANTFARM_WORKFLOWS_DIR, WORKFLOW_ID);
  const workspaceDir = path.join(OPENCLAW_AGENTS_DIR, WORKFLOW_ID);

  try {
    await fs.rm(workflowDir, { recursive: true, force: true });
  } catch {}
  try {
    await fs.rm(workspaceDir, { recursive: true, force: true });
  } catch {}
}

// ── Test: Single-step workflow with claim/complete ───────────────────────

async function testSingleStepClaimComplete(): Promise<void> {
  console.log("Test: single-step workflow claim/complete...");

  const task = "Test task for smoke test";

  // 1. Start a workflow run
  const runResult = await runWorkflow({ workflowId: WORKFLOW_ID, taskTitle: task });
  console.log(`  ✓ Run started: ${runResult.id.slice(0, 8)}`);
  console.log(`    Status: ${runResult.status}`);
  console.log(`    Workflow: ${runResult.workflowId}`);

  if (runResult.status !== "running") {
    throw new Error(`Expected run status "running", got "${runResult.status}"`);
  }

  const runId = runResult.id;
  const agentId = `${WORKFLOW_ID}/agent1`;

  // Verify run exists in DB
  const db = getDb();
  const runCheck = db.prepare("SELECT * FROM runs WHERE id = ?").get(runId);
  if (!runCheck) {
    throw new Error("Run not found in database");
  }
  console.log(`  ✓ Run exists in database`);

  // 2. Claim the first step
  const claim = claimStep(agentId);

  if (!claim.found) {
    throw new Error("Expected to find pending step for claim");
  }
  console.log(`  ✓ Claim found step: ${claim.stepId?.slice(0, 8)}`);

  if (!claim.runId || claim.runId !== runId) {
    throw new Error(`Claim returned wrong runId: ${claim.runId} (expected ${runId})`);
  }

  if (!claim.resolvedInput || !claim.resolvedInput.includes(task)) {
    throw new Error(`Resolved input missing task: ${claim.resolvedInput}`);
  }
  console.log(`  ✓ Resolved input contains task`);

  // 3. Complete the step
  const output = "STATUS: done";
  const complete = completeStep(claim.stepId!, output);

  if (!complete.advanced) {
    throw new Error("Expected pipeline to advance after first step");
  }
  console.log(`  ✓ Pipeline advanced after step completion`);

  // 4. Verify second step is now pending
  const step2Check = db.prepare("SELECT * FROM steps WHERE run_id = ? AND step_id = 'step2'").get(runId);
  if (!step2Check || step2Check.status !== "pending") {
    throw new Error(`Second step should be pending, got ${step2Check?.status}`);
  }
  console.log(`  ✓ Second step is pending`);

  // 5. Claim and complete second step
  const claim2 = claimStep(agentId);
  if (!claim2.found) {
    throw new Error("Expected to find second step");
  }

  const output2 = "DONE: finished";
  const complete2 = completeStep(claim2.stepId!, output2);

  if (!complete2.runCompleted) {
    throw new Error("Expected run to complete after last step");
  }
  console.log(`  ✓ Run completed after all steps`);

  // 6. Verify run status is completed
  const finalRun = db.prepare("SELECT * FROM runs WHERE id = ?").get(runId) as { status: string };
  if (finalRun.status !== "completed") {
    throw new Error(`Expected run status "completed", got "${finalRun.status}"`);
  }
  console.log(`  ✓ Run status is "completed"`);

  console.log("PASS: single-step workflow claim/complete\n");
}

// ── Test: Step fail with retry ───────────────────────────────────────────

async function testStepFailWithRetry(): Promise<void> {
  console.log("Test: step fail with retry...");

  const runResult = await runWorkflow({ workflowId: WORKFLOW_ID, taskTitle: "Retry test" });
  const runId = runResult.id;
  const agentId = `${WORKFLOW_ID}/agent1`;

  // Claim the step
  const claim = claimStep(agentId);
  if (!claim.found) {
    throw new Error("Expected pending step");
  }

  // Fail it
  const error = "Something went wrong";
  const failResult = failStep(claim.stepId!, error);

  if (!failResult.retrying) {
    throw new Error("Expected step to be retrying (not exhausted)");
  }
  console.log(`  ✓ Step failed and is retrying`);

  // Verify step is back to pending
  const db = getDb();
  const stepCheck = db.prepare("SELECT status, retry_count FROM steps WHERE id = ?").get(claim.stepId!) as { status: string; retry_count: number };
  if (stepCheck.status !== "pending" || stepCheck.retry_count !== 1) {
    throw new Error(`Step should be pending with retry_count=1, got status=${stepCheck.status}, retry_count=${stepCheck.retry_count}`);
  }
  console.log(`  ✓ Step reset to pending with retry_count=1`);

  // Claim again and complete successfully
  const claim2 = claimStep(agentId);
  if (!claim2.found) {
    throw new Error("Expected to claim step after retry");
  }

  completeStep(claim2.stepId!, "STATUS: recovered");

  // Verify run advanced
  const runCheck = db.prepare("SELECT status FROM runs WHERE id = ?").get(runId) as { status: string };
  if (runCheck.status !== "running") {
    throw new Error(`Run should still be running, got ${runCheck.status}`);
  }
  console.log(`  ✓ Run advanced after retry recovery`);

  // Clean up the rest of the workflow
  const claim3 = claimStep(agentId);
  if (claim3.found) {
    completeStep(claim3.stepId!, "DONE: cleanup");
  }

  console.log("PASS: step fail with retry\n");
}

// ── Test: Context propagation through steps ───────────────────────────────

async function testContextPropagation(): Promise<void> {
  console.log("Test: context propagation through steps...");

  const runResult = await runWorkflow({ workflowId: WORKFLOW_ID, taskTitle: "Context test" });
  const runId = runResult.id;
  const agentId = `${WORKFLOW_ID}/agent1`;

  // Claim and complete first step with custom KEY: value output
  const claim1 = claimStep(agentId);
  if (!claim1.found) {
    throw new Error("Expected pending step");
  }

  const output1 = "STATUS: step1-done\nCUSTOM_VAR: custom-value";
  completeStep(claim1.stepId!, output1);

  // Claim second step and verify context was merged
  const claim2 = claimStep(agentId);
  if (!claim2.found) {
    throw new Error("Expected second step");
  }

  const resolvedInput = claim2.resolvedInput || "";
  if (!resolvedInput.includes("step1-done")) {
    throw new Error(`Resolved input should contain context from step1: ${resolvedInput}`);
  }
  console.log(`  ✓ Context propagated to second step`);

  // Clean up
  completeStep(claim2.stepId!, "DONE: cleanup");

  console.log("PASS: context propagation\n");
}

// ── Test: Clean state (no pending work) ───────────────────────────────────

async function testCleanState(): Promise<void> {
  console.log("Test: clean state returns NO_WORK...");

  const claim = claimStep("non-existent-agent-id");
  if (claim.found !== false) {
    throw new Error(`Expected found=false for non-existent agent, got ${claim.found}`);
  }
  console.log(`  ✓ claimStep returns { found: false } for non-existent agent`);

  console.log("PASS: clean state\n");
}

// ── Run all tests ─────────────────────────────────────────────────────────

async function runTests(): Promise<void> {
  console.log("\n=== Core Callchain Smoke Tests ===\n");

  try {
    await setupTestWorkflow();

    await testCleanState();
    await testSingleStepClaimComplete();
    await testStepFailWithRetry();
    await testContextPropagation();

    console.log("All tests passed! ✓\n");

    await cleanupTestWorkflow();
    process.exit(0);
  } catch (err) {
    console.error("\nFAIL:", err);
    await cleanupTestWorkflow();
    process.exit(1);
  }
}

runTests();
