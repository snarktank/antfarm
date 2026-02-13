import { createAgentCronJob, deleteAgentCronJobs, listCronJobs, checkCronToolAvailable } from "./gateway-api.js";
import type { WorkflowSpec } from "./types.js";
import { resolveAntfarmCli } from "./paths.js";
import { getDb } from "../db.js";

const DEFAULT_EVERY_MS = 300_000; // 5 minutes
const DEFAULT_AGENT_TIMEOUT_SECONDS = 30 * 60; // 30 minutes

function buildAgentPrompt(workflowId: string, agentId: string): string {
  const fullAgentId = `${workflowId}-${agentId}`;
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
  const fullAgentId = `${workflowId}-${agentId}`;
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
const DEFAULT_POLLING_MODEL = "claude-sonnet-4-20250514";

export function buildPollingPrompt(workflowId: string, agentId: string, workModel?: string, _pollingModel?: string): string {
  const fullAgentId = `${workflowId}-${agentId}`;
  const cli = resolveAntfarmCli();
  const model = workModel ?? "claude-opus-4-6";
  const workPrompt = buildWorkPrompt(workflowId, agentId);

  // Always use CLI-based spawning to ensure workers run in separate processes.
  // This prevents event loop blocking in the gateway (sessions_spawn removed).
  // Escape backticks in work prompt for safe embedding in heredoc
  const escapedWorkPrompt = workPrompt.replace(/`/g, "'");
  return `Check for pending work. Run:
\`\`\`
node ${cli} step claim "${fullAgentId}"
\`\`\`
If output is "NO_WORK", reply HEARTBEAT_OK and stop.

If JSON is returned, do the following:
1. Save the FULL JSON output to /tmp/antfarm-claimed-step.json
2. Create a worker prompt file that combines the work instructions with the claimed step JSON:
\`\`\`
cat <<'ANTFARM_WORK_EOF' > /tmp/antfarm-work-prompt.txt
${escapedWorkPrompt}

CLAIMED STEP JSON:
ANTFARM_WORK_EOF
cat /tmp/antfarm-claimed-step.json >> /tmp/antfarm-work-prompt.txt
\`\`\`
3. Spawn the worker in the background:
\`\`\`
nohup claude -p --model ${model} --output-format json --dangerously-skip-permissions "$(cat /tmp/antfarm-work-prompt.txt)" > /tmp/antfarm-worker-${fullAgentId}.log 2>&1 &
\`\`\`
4. Reply with "SPAWNED: worker PID" and stop immediately. Do NOT wait for the worker.`;
}

export async function setupAgentCrons(workflow: WorkflowSpec): Promise<void> {
  const agents = workflow.agents;
  // Allow per-workflow cron interval via cron.interval_ms in workflow.yml
  const everyMs = (workflow as any).cron?.interval_ms ?? DEFAULT_EVERY_MS;

  // Resolve polling model: per-agent > workflow-level > default
  const workflowPollingModel = workflow.polling?.model ?? DEFAULT_POLLING_MODEL;
  const workflowPollingTimeout = workflow.polling?.timeoutSeconds ?? DEFAULT_POLLING_TIMEOUT_SECONDS;

  for (let i = 0; i < agents.length; i++) {
    const agent = agents[i];
    const anchorMs = i * 60_000; // stagger by 1 minute each
    const cronName = `antfarm/${workflow.id}/${agent.id}`;
    const agentId = `${workflow.id}-${agent.id}`;

    // Two-phase: Phase 1 uses cheap polling model + minimal prompt
    const pollingModel = agent.pollingModel ?? workflowPollingModel;
    const workModel = agent.model; // Phase 2 model (passed to sessions_spawn via prompt)
    const prompt = buildPollingPrompt(workflow.id, agent.id, workModel, pollingModel);
    const timeoutSeconds = workflowPollingTimeout;

    const result = await createAgentCronJob({
      name: cronName,
      schedule: { kind: "every", everyMs, anchorMs },
      sessionTarget: "isolated",
      agentId,
      payload: { kind: "agentTurn", message: prompt, model: pollingModel, timeoutSeconds },
      delivery: { mode: "none" },
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
