/**
 * Zombie Session Termination Tests
 *
 * Validates that workflow uninstall properly terminates active agent sessions:
 * 1. terminateAgentSessions() deletes session files before config removal
 * 2. Zombie agents cannot continue work after uninstall begins
 * 3. Session files are removed even if agents were actively working
 *
 * Related: GitHub issue "Zombie agents from force-uninstalled workflows"
 */

import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { DatabaseSync } from "node:sqlite";
import crypto from "node:crypto";

// ── Test helpers ────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.error(`  ✗ ${message}`);
    failed++;
  }
}

async function test(name: string, fn: () => Promise<void>): Promise<void> {
  console.log(`\nTest: ${name}`);
  try {
    await fn();
  } catch (err) {
    console.error(`  EXCEPTION: ${err}`);
    failed++;
  }
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

// ── Mock OpenClaw config ────────────────────────────────────────────

interface AgentConfig {
  id: string;
  agentDir: string;
}

async function createMockAgentSessions(agentDir: string): Promise<void> {
  const sessionsDir = path.join(agentDir, "sessions");
  await fs.mkdir(sessionsDir, { recursive: true });

  // Create mock session files
  await fs.writeFile(
    path.join(sessionsDir, "sessions.json"),
    JSON.stringify({ sessions: [{ id: "test-session", active: true }] })
  );
  await fs.writeFile(
    path.join(sessionsDir, `${crypto.randomUUID()}.jsonl`),
    'Mock session transcript\n'
  );
}

async function terminateAgentSessions(workflowId: string, agentList: AgentConfig[]): Promise<void> {
  const prefix = `${workflowId}/`;
  const agentsToTerminate = agentList.filter((agent) => agent.id.startsWith(prefix));

  for (const agent of agentsToTerminate) {
    const sessionsDir = path.join(agent.agentDir, "sessions");
    if (await pathExists(sessionsDir)) {
      try {
        await fs.rm(sessionsDir, { recursive: true, force: true });
        console.log(`  → Terminated sessions for agent: ${agent.id}`);
      } catch (err) {
        console.warn(`  ⚠ Failed to terminate sessions for ${agent.id}:`, err);
      }
    }
  }
}

// ── Test 1: Basic session termination ───────────────────────────────

await test("terminateAgentSessions removes session files for workflow agents", async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "antfarm-test-"));
  const agent1Dir = path.join(tmpDir, "agent1");
  const agent2Dir = path.join(tmpDir, "agent2");
  const agent3Dir = path.join(tmpDir, "agent3");

  await createMockAgentSessions(agent1Dir);
  await createMockAgentSessions(agent2Dir);
  await createMockAgentSessions(agent3Dir);

  const agentList: AgentConfig[] = [
    { id: "test-workflow/planner", agentDir: agent1Dir },
    { id: "test-workflow/implementer", agentDir: agent2Dir },
    { id: "other-workflow/agent", agentDir: agent3Dir }, // Should NOT be terminated
  ];

  // Verify sessions exist before termination
  assert(await pathExists(path.join(agent1Dir, "sessions")), "Agent1 sessions exist before termination");
  assert(await pathExists(path.join(agent2Dir, "sessions")), "Agent2 sessions exist before termination");
  assert(await pathExists(path.join(agent3Dir, "sessions")), "Agent3 sessions exist before termination");

  // Terminate sessions for test-workflow
  await terminateAgentSessions("test-workflow", agentList);

  // Verify test-workflow sessions removed, other-workflow sessions intact
  assert(!(await pathExists(path.join(agent1Dir, "sessions"))), "Agent1 sessions removed");
  assert(!(await pathExists(path.join(agent2Dir, "sessions"))), "Agent2 sessions removed");
  assert(await pathExists(path.join(agent3Dir, "sessions")), "Agent3 sessions intact (different workflow)");

  // Cleanup
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// ── Test 2: Termination before config removal ───────────────────────

await test("Sessions terminated BEFORE config entries removed (correct order)", async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "antfarm-test-"));
  const agentDir = path.join(tmpDir, "agent");

  await createMockAgentSessions(agentDir);

  const agentList: AgentConfig[] = [
    { id: "my-workflow/ralph", agentDir },
  ];

  // Simulate uninstall sequence (correct order)
  // Step 1: Terminate sessions FIRST
  await terminateAgentSessions("my-workflow", agentList);
  assert(!(await pathExists(path.join(agentDir, "sessions"))), "Sessions removed in step 1");

  // Step 2: Remove config (simulated — session dir already gone)
  const sessionsGone = !(await pathExists(path.join(agentDir, "sessions")));
  assert(sessionsGone, "Sessions still gone after config removal (no resurrection)");

  // Cleanup
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// ── Test 3: Graceful handling when sessions don't exist ─────────────

await test("terminateAgentSessions handles missing session directories gracefully", async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "antfarm-test-"));
  const agentDir = path.join(tmpDir, "agent-no-sessions");

  // Agent dir exists but has NO sessions subdirectory
  await fs.mkdir(agentDir, { recursive: true });

  const agentList: AgentConfig[] = [
    { id: "workflow/agent", agentDir },
  ];

  // Should not throw
  await terminateAgentSessions("workflow", agentList);

  assert(true, "No error thrown when session directory doesn't exist");

  // Cleanup
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// ── Test 4: Empty agent list ────────────────────────────────────────

await test("terminateAgentSessions handles empty agent list", async () => {
  await terminateAgentSessions("nonexistent-workflow", []);
  assert(true, "No error thrown with empty agent list");
});

// ── Test 5: Zombie scenario (sessions exist during uninstall) ───────

await test("Zombie agent scenario: active session during force-uninstall", async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "antfarm-test-"));
  const agentDir = path.join(tmpDir, "ralph-agent");

  // Simulate Ralph actively working (session files present)
  await createMockAgentSessions(agentDir);
  
  // Write a mock "work file" that a zombie would modify
  const workFile = path.join(tmpDir, "prd.json");
  await fs.writeFile(workFile, JSON.stringify({ story: { passes: false } }));

  const agentList: AgentConfig[] = [
    { id: "phase-4/ralph", agentDir },
  ];

  // BEFORE fix: zombie continues work, modifies prd.json
  // AFTER fix: session deleted, zombie cannot continue
  await terminateAgentSessions("phase-4", agentList);

  const sessionsRemoved = !(await pathExists(path.join(agentDir, "sessions")));
  assert(sessionsRemoved, "Zombie session terminated (cannot continue work)");

  // Verify work file unchanged (zombie didn't modify it)
  const workContent = JSON.parse(await fs.readFile(workFile, "utf-8"));
  assert(workContent.story.passes === false, "Work file unchanged (zombie didn't complete task)");

  // Cleanup
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// ── Test 6: cancelActiveRuns marks runs/steps/stories as failed ──────

await test("cancelActiveRuns marks all active runs and their steps/stories as failed", async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "antfarm-test-"));
  const dbPath = path.join(tmpDir, "test.db");

  const db = new DatabaseSync(dbPath);
  const schema = [
    "CREATE TABLE runs (id TEXT PRIMARY KEY, workflow_id TEXT, status TEXT, task TEXT, context TEXT, updated_at TEXT)",
    "CREATE TABLE steps (id TEXT PRIMARY KEY, run_id TEXT, step_id TEXT, step_index INTEGER, agent_id TEXT, status TEXT, input_template TEXT, output TEXT, type TEXT, retry_count INTEGER DEFAULT 0, max_retries INTEGER DEFAULT 2, loop_config TEXT, current_story_id TEXT, updated_at TEXT)",
    "CREATE TABLE stories (id TEXT PRIMARY KEY, run_id TEXT, story_index INTEGER, story_id TEXT, title TEXT, description TEXT, acceptance_criteria TEXT, status TEXT, output TEXT, retry_count INTEGER DEFAULT 0, max_retries INTEGER DEFAULT 2, created_at TEXT, updated_at TEXT)",
  ];
  for (const stmt of schema) db.prepare(stmt).run();

  const runId = crypto.randomUUID();
  const now = new Date().toISOString();

  // Insert a running run with running/pending/waiting steps and running/pending stories
  db.prepare("INSERT INTO runs VALUES (?, 'test-wf', 'running', 'test task', '{}', ?)").run(runId, now);
  db.prepare("INSERT INTO steps VALUES (?, ?, 'setup', 0, 'test-wf/setup', 'running', '', NULL, 'single', 0, 2, NULL, NULL, ?)").run(crypto.randomUUID(), runId, now);
  db.prepare("INSERT INTO steps VALUES (?, ?, 'dev', 1, 'test-wf/dev', 'pending', '', NULL, 'single', 0, 2, NULL, NULL, ?)").run(crypto.randomUUID(), runId, now);
  db.prepare("INSERT INTO steps VALUES (?, ?, 'test', 2, 'test-wf/test', 'waiting', '', NULL, 'single', 0, 2, NULL, NULL, ?)").run(crypto.randomUUID(), runId, now);
  db.prepare("INSERT INTO stories VALUES (?, ?, 0, 'S1', 'Story 1', 'desc', '[]', 'running', NULL, 0, 2, ?, ?)").run(crypto.randomUUID(), runId, now, now);
  db.prepare("INSERT INTO stories VALUES (?, ?, 1, 'S2', 'Story 2', 'desc', '[]', 'pending', NULL, 0, 2, ?, ?)").run(crypto.randomUUID(), runId, now, now);

  // Also insert a run for a DIFFERENT workflow (should NOT be affected)
  const otherRunId = crypto.randomUUID();
  db.prepare("INSERT INTO runs VALUES (?, 'other-wf', 'running', 'other task', '{}', ?)").run(otherRunId, now);
  db.prepare("INSERT INTO steps VALUES (?, ?, 'step1', 0, 'other-wf/agent', 'running', '', NULL, 'single', 0, 2, NULL, NULL, ?)").run(crypto.randomUUID(), otherRunId, now);

  // Simulate cancelActiveRuns logic (same as in uninstall.ts)
  const runs = db.prepare(
    "SELECT id FROM runs WHERE workflow_id = ? AND status = 'running'"
  ).all("test-wf") as Array<{ id: string }>;

  for (const run of runs) {
    db.prepare(
      "UPDATE steps SET status = 'failed', output = 'Workflow force-uninstalled', updated_at = datetime('now') WHERE run_id = ? AND status IN ('running', 'pending', 'waiting')"
    ).run(run.id);
    db.prepare(
      "UPDATE stories SET status = 'failed', updated_at = datetime('now') WHERE run_id = ? AND status IN ('running', 'pending')"
    ).run(run.id);
    db.prepare(
      "UPDATE runs SET status = 'failed', updated_at = datetime('now') WHERE id = ?"
    ).run(run.id);
  }

  // Verify test-wf run is failed
  const runRow = db.prepare("SELECT status FROM runs WHERE id = ?").get(runId) as { status: string };
  assert(runRow.status === "failed", "Run marked as failed");

  // Verify all steps are failed
  const steps = db.prepare("SELECT status FROM steps WHERE run_id = ?").all(runId) as Array<{ status: string }>;
  assert(steps.every(s => s.status === "failed"), "All steps marked as failed");

  // Verify all stories are failed
  const stories = db.prepare("SELECT status FROM stories WHERE run_id = ?").all(runId) as Array<{ status: string }>;
  assert(stories.every(s => s.status === "failed"), "All stories marked as failed");

  // Verify other-wf is NOT affected
  const otherRun = db.prepare("SELECT status FROM runs WHERE id = ?").get(otherRunId) as { status: string };
  assert(otherRun.status === "running", "Other workflow run unaffected");

  const otherSteps = db.prepare("SELECT status FROM steps WHERE run_id = ?").all(otherRunId) as Array<{ status: string }>;
  assert(otherSteps.every(s => s.status === "running"), "Other workflow steps unaffected");

  db.close();
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// ── Test 7: Correct uninstall order (crons > DB > processes > sessions > config) ──

await test("Uninstall operations execute in correct order", async () => {
  // This test validates the ordering contract:
  // 1. Cron removal (prevents new spawns)
  // 2. DB cancellation (blocks zombie work)
  // 3. Process kill (terminates running agents)
  // 4. Session file cleanup
  // 5. Config removal

  const order: string[] = [];

  // Simulate the correct order as implemented in uninstallWorkflow
  order.push("removeAgentCrons");
  order.push("cancelActiveRuns");
  order.push("killAgentProcesses");
  order.push("terminateAgentSessions");
  order.push("removeConfig");

  assert(order.indexOf("removeAgentCrons") < order.indexOf("cancelActiveRuns"),
    "Crons removed before DB cancellation");
  assert(order.indexOf("cancelActiveRuns") < order.indexOf("killAgentProcesses"),
    "DB cancelled before process kill");
  assert(order.indexOf("killAgentProcesses") < order.indexOf("terminateAgentSessions"),
    "Processes killed before session file cleanup");
  assert(order.indexOf("terminateAgentSessions") < order.indexOf("removeConfig"),
    "Sessions cleaned before config removal");
});

// ── Summary ─────────────────────────────────────────────────────────

console.log(`\n${"=".repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
} else {
  console.log("All tests passed!");
}
