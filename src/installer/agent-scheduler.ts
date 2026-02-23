import { executeClaudePrompt } from "./claude-executor.js";
import { getDb } from "../db.js";
import { loadWorkflowSpec } from "./workflow-spec.js";
import { resolveWorkflowDir } from "./paths.js";
import { buildAgentPrompt } from "./agent-cron.js";

const TICK_INTERVAL_MS = 15_000; // check every 15 seconds

interface ScheduledAgent {
  workflowId: string;
  agentId: string;
  prompt: string;
  intervalMs: number;
  anchorMs: number;
  running: boolean;
  lastFiredAt: number;
}

const agents = new Map<string, ScheduledAgent>();
let tickTimer: ReturnType<typeof setInterval> | null = null;
let schedulerStartedAt = 0;

/**
 * Register agents for the claude-code scheduler.
 * Each agent fires at `intervalMs` with a stagger offset of `anchorMs`.
 */
export function registerAgents(
  entries: Array<{
    workflowId: string;
    agentId: string;
    prompt: string;
    intervalMs: number;
    anchorMs: number;
  }>,
): void {
  for (const e of entries) {
    const key = `${e.workflowId}/${e.agentId}`;
    if (!agents.has(key)) {
      agents.set(key, {
        ...e,
        running: false,
        lastFiredAt: 0,
      });
    }
  }
}

/**
 * Unregister all agents for a given workflow.
 */
export function unregisterAgents(workflowId: string): void {
  for (const [key, agent] of agents) {
    if (agent.workflowId === workflowId) {
      agents.delete(key);
    }
  }
}

/**
 * Check if any agents are registered for a workflow.
 */
export function hasRegisteredAgents(workflowId: string): boolean {
  for (const agent of agents.values()) {
    if (agent.workflowId === workflowId) return true;
  }
  return false;
}

/**
 * Start the scheduler tick loop.
 * Idempotent — calling multiple times is safe.
 */
export function startScheduler(): void {
  if (tickTimer) return;
  schedulerStartedAt = Date.now();
  tickTimer = setInterval(tick, TICK_INTERVAL_MS);
  // Run first tick immediately
  tick();
}

/**
 * Stop the scheduler and clear all registered agents.
 */
export function stopScheduler(): void {
  if (tickTimer) {
    clearInterval(tickTimer);
    tickTimer = null;
  }
  agents.clear();
}

/**
 * Check if the scheduler is currently running.
 */
export function isSchedulerRunning(): boolean {
  return tickTimer !== null;
}

// ── Internal ────────────────────────────────────────────────────────

/**
 * Discover active workflow runs that don't have registered agents yet
 * and auto-register them. This allows workflows submitted after the
 * daemon started to be picked up without a daemon restart.
 */
async function discoverNewRuns(): Promise<void> {
  try {
    const db = getDb();
    const activeRuns = db.prepare(
      "SELECT DISTINCT workflow_id FROM runs WHERE status = 'running'"
    ).all() as Array<{ workflow_id: string }>;

    for (const run of activeRuns) {
      if (hasRegisteredAgents(run.workflow_id)) continue;

      try {
        const workflowDir = resolveWorkflowDir(run.workflow_id);
        const workflow = await loadWorkflowSpec(workflowDir);
        const everyMs = workflow.cron?.interval_ms ?? 300_000;

        const entries = workflow.agents.map((agent: { id: string }, i: number) => ({
          workflowId: workflow.id,
          agentId: agent.id,
          prompt: buildAgentPrompt(workflow.id, agent.id),
          intervalMs: everyMs,
          anchorMs: i * 60_000,
        }));

        registerAgents(entries);
        console.log(`[scheduler] Auto-registered ${entries.length} agents for new workflow run: ${run.workflow_id}`);
      } catch (err) {
        console.error(`[scheduler] Failed to auto-register agents for ${run.workflow_id}:`, err);
      }
    }
  } catch {
    // DB unavailable — skip discovery this tick
  }
}

async function tick(): Promise<void> {
  const now = Date.now();

  // Discover and register agents for any new workflow runs
  await discoverNewRuns();

  for (const [key, agent] of agents) {
    if (agent.running) continue;

    if (!shouldFire(agent, now)) continue;

    // Pre-check: does this workflow have any active runs?
    if (!hasActiveRuns(agent.workflowId)) continue;

    agent.running = true;
    agent.lastFiredAt = now;

    fireAgent(key, agent).finally(() => {
      agent.running = false;
    });
  }
}

/**
 * Determine if an agent should fire based on its interval and anchor offset.
 * Uses the same stagger logic as the OpenClaw cron: an agent with anchorMs=60000
 * first fires 60s after the scheduler starts, then every intervalMs thereafter.
 */
function shouldFire(agent: ScheduledAgent, now: number): boolean {
  const elapsed = now - schedulerStartedAt;

  // Haven't reached the initial anchor offset yet
  if (elapsed < agent.anchorMs) return false;

  // Time since last fire (or since anchor if never fired)
  const sinceLastFire = agent.lastFiredAt > 0
    ? now - agent.lastFiredAt
    : elapsed - agent.anchorMs;

  return sinceLastFire >= agent.intervalMs;
}

/**
 * Check the database for active (running) runs for a workflow.
 */
function hasActiveRuns(workflowId: string): boolean {
  try {
    const db = getDb();
    const row = db.prepare(
      "SELECT COUNT(*) as cnt FROM runs WHERE workflow_id = ? AND status = 'running'"
    ).get(workflowId) as { cnt: number };
    return row.cnt > 0;
  } catch {
    // If DB is unavailable, don't fire
    return false;
  }
}

async function fireAgent(key: string, agent: ScheduledAgent): Promise<void> {
  const agentId = `${agent.workflowId}/${agent.agentId}`;
  console.log(`[scheduler] Firing agent ${agentId}`);

  const result = await executeClaudePrompt(agentId, agent.prompt);

  if (result.timedOut) {
    console.error(`[scheduler] Agent ${agentId} timed out`);
  } else if (!result.ok) {
    console.error(`[scheduler] Agent ${agentId} failed (exit ${result.exitCode}): ${result.output.slice(0, 200)}`);
  } else {
    console.log(`[scheduler] Agent ${agentId} completed successfully`);
  }
}
