import { createAgentCronJob, deleteAgentCronJobs, listCronJobs, checkCronToolAvailable } from "./gateway-api.js";
import { registerAgents, unregisterAgents, hasRegisteredAgents, startScheduler } from "./agent-scheduler.js";
import { findClaudeBinary } from "./claude-executor.js";
import type { WorkflowSpec } from "./types.js";
import { resolveAntfarmCli } from "./paths.js";
import { getDb } from "../db.js";

const DEFAULT_EVERY_MS = 300_000; // 5 minutes
const DEFAULT_AGENT_TIMEOUT_SECONDS = 30 * 60; // 30 minutes

// ── Executor mode ─────────────────────────────────────────────────

type ExecutorMode = "openclaw" | "claude-code";

/**
 * Determine which executor to use for a workflow's cron jobs.
 * Priority: workflow.cron.executor > ANTFARM_EXECUTOR env > default "openclaw"
 */
export function getExecutorMode(workflow: WorkflowSpec): ExecutorMode {
  const fromWorkflow = workflow.cron?.executor;
  if (fromWorkflow === "claude-code" || fromWorkflow === "openclaw") {
    return fromWorkflow;
  }

  const fromEnv = process.env.ANTFARM_EXECUTOR?.trim();
  if (fromEnv === "claude-code" || fromEnv === "openclaw") {
    return fromEnv;
  }

  return "openclaw";
}

// ── Prompt builder ────────────────────────────────────────────────

export function buildAgentPrompt(workflowId: string, agentId: string): string {
  const fullAgentId = `${workflowId}_${agentId}`;
  const cli = resolveAntfarmCli();

  return `You are an Antfarm workflow agent. Check for pending work and execute it.

⚠️ CRITICAL: You MUST call "step complete" or "step fail" before ending your session. If you don't, the workflow will be stuck forever. This is non-negotiable.

Step 1 — Check for pending work:
\`\`\`
node ${cli} step claim "${fullAgentId}"
\`\`\`

If output is "NO_WORK", reply HEARTBEAT_OK and stop.

Step 2 — If JSON is returned, it contains: {"stepId": "...", "runId": "...", "input": "..."}
Save the stepId — you'll need it to report completion.
The "input" field contains your FULLY RESOLVED task instructions. Read it carefully and DO the work.

Step 3 — Do the work described in the input. Format your output with KEY: value lines as specified.

Step 4 — MANDATORY: Report completion (do this IMMEDIATELY after finishing the work):
\`\`\`
cat <<'ANTFARM_EOF' > /tmp/antfarm-step-output.txt
STATUS: done
CHANGES: what you did
TESTS: what tests you ran
ANTFARM_EOF
cat /tmp/antfarm-step-output.txt | node ${cli} step complete "<stepId>"
\`\`\`

If the work FAILED:
\`\`\`
node ${cli} step fail "<stepId>" "description of what went wrong"
\`\`\`

RULES:
1. NEVER end your session without calling step complete or step fail
2. Write output to a file first, then pipe via stdin (shell escaping breaks direct args)
3. If you're unsure whether to complete or fail, call step fail with an explanation

The workflow cannot advance until you report. Your session ending without reporting = broken pipeline.`;
}

export function buildWorkPrompt(workflowId: string, agentId: string): string {
  const fullAgentId = `${workflowId}_${agentId}`;
  const cli = resolveAntfarmCli();

  return `You are an Antfarm workflow agent. Execute the pending work below.

⚠️ CRITICAL: You MUST call "step complete" or "step fail" before ending your session. If you don't, the workflow will be stuck forever. This is non-negotiable.

The claimed step JSON is provided below. It contains: {"stepId": "...", "runId": "...", "input": "..."}
Save the stepId — you'll need it to report completion.
The "input" field contains your FULLY RESOLVED task instructions. Read it carefully and DO the work.

Do the work described in the input. Format your output with KEY: value lines as specified.

MANDATORY: Report completion (do this IMMEDIATELY after finishing the work):
\`\`\`
cat <<'ANTFARM_EOF' > /tmp/antfarm-step-output.txt
STATUS: done
CHANGES: what you did
TESTS: what tests you ran
ANTFARM_EOF
cat /tmp/antfarm-step-output.txt | node ${cli} step complete "<stepId>"
\`\`\`

If the work FAILED:
\`\`\`
node ${cli} step fail "<stepId>" "description of what went wrong"
\`\`\`

RULES:
1. NEVER end your session without calling step complete or step fail
2. Write output to a file first, then pipe via stdin (shell escaping breaks direct args)
3. If you're unsure whether to complete or fail, call step fail with an explanation

The workflow cannot advance until you report. Your session ending without reporting = broken pipeline.`;
}

const DEFAULT_POLLING_TIMEOUT_SECONDS = 120;
const DEFAULT_POLLING_MODEL: string | undefined = undefined;

export function buildPollingPrompt(workflowId: string, agentId: string, _workModel?: string): string {
  const fullAgentId = `${workflowId}_${agentId}`;
  const cli = resolveAntfarmCli();

  return `[cron:{{cron_id}} antfarm/${workflowId}/${agentId}] Step 1 — Quick check for pending work (lightweight, no side effects):
\`\`\`
node ${cli} step peek "${fullAgentId}"
\`\`\`
If output is "NO_WORK", reply HEARTBEAT_OK and stop immediately. Do NOT run step claim.

Step 2 — If "HAS_WORK", claim the step:
\`\`\`
node ${cli} step claim "${fullAgentId}"
\`\`\`
If output is "NO_WORK", reply HEARTBEAT_OK and stop.

Step 3 — If JSON is returned, it contains: {"stepId": "...", "runId": "...", "input": "..."}
Save the stepId — you'll need it to report completion.
The "input" field contains your FULLY RESOLVED task instructions. Read it carefully and DO the work.

Step 4 — Do the work described in the input. Format your output with KEY: value lines as specified.

Step 5 — MANDATORY: Report completion (do this IMMEDIATELY after finishing the work):
\`\`\`
cat <<'ANTFARM_EOF' > /tmp/antfarm-step-output.txt
STATUS: done
CHANGES: what you did
TESTS: what tests you ran
ANTFARM_EOF
cat /tmp/antfarm-step-output.txt | node ${cli} step complete "<stepId>"
\`\`\`

If the work FAILED:
\`\`\`
node ${cli} step fail "<stepId>" "description of what went wrong"
\`\`\`

RULES:
1. NEVER end your session without calling step complete or step fail
2. Write output to a file first, then pipe via stdin (shell escaping breaks direct args)
3. Replace <stepId> with the actual stepId from step 3
4. If you're unsure whether to complete or fail, call step fail with an explanation

The workflow cannot advance until you report. Your session ending without reporting = broken pipeline.`;}

// ── Setup / teardown ──────────────────────────────────────────────

export async function setupAgentCrons(workflow: WorkflowSpec): Promise<void> {
  const mode = getExecutorMode(workflow);

  if (mode === "claude-code") {
    await setupAgentCronsClaudeCode(workflow);
  } else {
    await setupAgentCronsOpenclaw(workflow);
  }
}

async function setupAgentCronsClaudeCode(workflow: WorkflowSpec): Promise<void> {
  const everyMs = workflow.cron?.interval_ms ?? DEFAULT_EVERY_MS;

  const entries = workflow.agents.map((agent, i) => ({
    workflowId: workflow.id,
    agentId: agent.id,
    prompt: buildAgentPrompt(workflow.id, agent.id),
    intervalMs: everyMs,
    anchorMs: i * 60_000,
  }));

  registerAgents(entries);
  startScheduler();
}

async function setupAgentCronsOpenclaw(workflow: WorkflowSpec): Promise<void> {
  const agents = workflow.agents;
  // Allow per-workflow cron interval via cron.interval_ms in workflow.yml
  const everyMs = (workflow as any).cron?.interval_ms ?? DEFAULT_EVERY_MS;

  // Resolve polling model: per-agent > workflow-level > default
  const workflowPollingModel = workflow.polling?.model ?? DEFAULT_POLLING_MODEL;
  const workflowPollingTimeout = workflow.polling?.timeoutSeconds ?? DEFAULT_POLLING_TIMEOUT_SECONDS;

  for (let i = 0; i < agents.length; i++) {
    const agent = agents[i];
    const anchorMs = i * 60_000;
    const cronName = `antfarm/${workflow.id}/${agent.id}`;
    const agentId = `${workflow.id}_${agent.id}`;

    // Two-phase: Phase 1 uses cheap polling model + minimal prompt
    const pollingModel = agent.pollingModel ?? workflowPollingModel;
    const workModel = agent.model; // Phase 2 model (passed to sessions_spawn via prompt)
    const prompt = buildPollingPrompt(workflow.id, agent.id, workModel);
    const timeoutSeconds = workflowPollingTimeout;

    const result = await createAgentCronJob({
      name: cronName,
      schedule: { kind: "every", everyMs, anchorMs },
      sessionTarget: "isolated",
      agentId,
      payload: { kind: "agentTurn", message: prompt, ...(pollingModel ? { model: pollingModel } : {}), timeoutSeconds },
      enabled: true,
      delivery: { mode: "none" },
    });

    if (!result.ok) {
      throw new Error(`Failed to create cron job for agent "${agent.id}": ${result.error}`);
    }
  }
}

export async function removeAgentCrons(workflowId: string): Promise<void> {
  // Always clean up both sides — harmless if one has nothing to remove
  unregisterAgents(workflowId);
  await deleteAgentCronJobs(`antfarm/${workflowId}/`);
}

// ── Run-scoped cron lifecycle ───────────────────────────────────────

function countActiveRuns(workflowId: string): number {
  const db = getDb();
  const row = db.prepare(
    "SELECT COUNT(*) as cnt FROM runs WHERE workflow_id = ? AND status = 'running'"
  ).get(workflowId) as { cnt: number };
  return row.cnt;
}

/**
 * Check if crons already exist for a workflow (OpenClaw or in-memory scheduler).
 */
async function workflowCronsExist(workflow: WorkflowSpec): Promise<boolean> {
  const mode = getExecutorMode(workflow);

  if (mode === "claude-code") {
    return hasRegisteredAgents(workflow.id);
  }

  const result = await listCronJobs();
  if (!result.ok || !result.jobs) return false;
  const prefix = `antfarm/${workflow.id}/`;
  return result.jobs.some((j) => j.name.startsWith(prefix));
}

/**
 * Preflight check: verify the execution backend is accessible.
 * For claude-code mode, checks that the `claude` binary is available.
 * For openclaw mode, checks that the cron tool (HTTP or CLI) is reachable.
 */
export async function checkExecutorAvailable(workflow: WorkflowSpec): Promise<{ ok: boolean; error?: string }> {
  const mode = getExecutorMode(workflow);

  if (mode === "claude-code") {
    const binary = await findClaudeBinary();
    if (!binary) {
      return {
        ok: false,
        error: "Claude Code CLI not found. Install it or set ANTFARM_CLAUDE_PATH. Falling back to openclaw mode is possible by unsetting ANTFARM_EXECUTOR.",
      };
    }
    return { ok: true };
  }

  return checkCronToolAvailable();
}

/**
 * Start crons for a workflow when a run begins.
 * No-ops if crons already exist (another run of the same workflow is active).
 */
export async function ensureWorkflowCrons(workflow: WorkflowSpec): Promise<void> {
  if (await workflowCronsExist(workflow)) return;

  const preflight = await checkExecutorAvailable(workflow);
  if (!preflight.ok) {
    throw new Error(preflight.error!);
  }

  await setupAgentCrons(workflow);
}

/**
 * Tear down crons for a workflow when a run ends.
 * Only removes if no other active runs exist for this workflow.
 */
export async function teardownWorkflowCronsIfIdle(workflowId: string): Promise<void> {
  const active = countActiveRuns(workflowId);
  if (active > 0) return;
  await removeAgentCrons(workflowId);
}
