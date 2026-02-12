import { createAgentCronJob, deleteAgentCronJobs, listCronJobs, checkCronToolAvailable } from "./gateway-api.js";
import type { WorkflowSpec } from "./types.js";
import { resolveAntfarmCli } from "./paths.js";
import { getDb } from "../db.js";

const DEFAULT_EVERY_MS = 300_000; // 5 minutes
const DEFAULT_AGENT_TIMEOUT_SECONDS = 30 * 60; // 30 minutes

function buildAgentPrompt(workflowId: string, agentId: string): string {
  const fullAgentId = `${workflowId}/${agentId}`;
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

export async function setupAgentCrons(workflow: WorkflowSpec): Promise<void> {
  const agents = workflow.agents;
  // Allow per-workflow cron interval via cron.interval_ms in workflow.yml
  const everyMs = (workflow as any).cron?.interval_ms ?? DEFAULT_EVERY_MS;
  for (let i = 0; i < agents.length; i++) {
    const agent = agents[i];
    const anchorMs = i * 60_000; // stagger by 1 minute each
    const cronName = `antfarm/${workflow.id}/${agent.id}`;
    const agentId = `${workflow.id}/${agent.id}`;
    const prompt = buildAgentPrompt(workflow.id, agent.id);
    const timeoutSeconds = agent.timeoutSeconds ?? DEFAULT_AGENT_TIMEOUT_SECONDS;

    const result = await createAgentCronJob({
      name: cronName,
      schedule: { kind: "every", everyMs, anchorMs },
      sessionTarget: "isolated",
      agentId,
      payload: { kind: "agentTurn", message: prompt, timeoutSeconds },
      enabled: true,
    });

    if (!result.ok) {
      throw new Error(`Failed to create cron job for agent "${agent.id}": ${result.error}`);
    }
  }
}

export async function removeAgentCrons(workflowId: string): Promise<void> {
  await deleteAgentCronJobs(`antfarm/${workflowId}/`);
}

// ── Run-scoped cron lifecycle ───────────────────────────────────────

/**
 * Count active (running) runs for a given workflow.
 */
function countActiveRuns(workflowId: string): number {
  const db = getDb();
  const row = db.prepare(
    "SELECT COUNT(*) as cnt FROM runs WHERE workflow_id = ? AND status = 'running'"
  ).get(workflowId) as { cnt: number };
  return row.cnt;
}

/**
 * Check if crons already exist for a workflow.
 */
async function workflowCronsExist(workflowId: string): Promise<boolean> {
  const result = await listCronJobs();
  if (!result.ok || !result.jobs) return false;
  const prefix = `antfarm/${workflowId}/`;
  return result.jobs.some((j) => j.name.startsWith(prefix));
}

/**
 * Start crons for a workflow when a run begins.
 * No-ops if crons already exist (another run of the same workflow is active).
 */
export async function ensureWorkflowCrons(workflow: WorkflowSpec): Promise<void> {
  if (await workflowCronsExist(workflow.id)) return;

  // Preflight: verify cron tool is accessible before attempting to create jobs
  const preflight = await checkCronToolAvailable();
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

// ── Event-driven dispatch ───────────────────────────────────────────

/**
 * Immediately dispatch an agent to work on a pending step via a one-shot cron job.
 * 
 * This is fire-and-forget: never throws, never blocks. If dispatch fails,
 * the heartbeat crons will pick up the work on the next poll cycle.
 * 
 * Uses kind: "at" with atMs: Date.now() to create an immediate one-shot job
 * that auto-cleans after execution.
 */
export function dispatchAgent(agentId: string, stepId: string): void {
  // Fire-and-forget: wrap in async IIFE with catch
  (async () => {
    try {
      // Parse workflow ID and agent short ID from full agent ID (format: workflowId/agentId)
      const parts = agentId.split("/");
      const agentShortId = parts[parts.length - 1];
      const workflowId = parts.slice(0, -1).join("/");

      const prompt = buildAgentPrompt(workflowId, agentShortId);
      const cronName = `antfarm/dispatch/${stepId.slice(0, 8)}/${Date.now()}`;

      await createAgentCronJob({
        name: cronName,
        schedule: { kind: "at", atMs: Date.now() },
        sessionTarget: "isolated",
        agentId,
        payload: { kind: "agentTurn", message: prompt, timeoutSeconds: DEFAULT_AGENT_TIMEOUT_SECONDS },
        enabled: true,
      });
    } catch {
      // Silent failure — heartbeat crons will pick up the work
    }
  })().catch(() => {});
}
