import { createAgentCronJob, deleteAgentCronJobs, listCronJobs, checkCronToolAvailable } from "./gateway-api.js";
import { resolveAntfarmCli } from "./paths.js";
import { getDb } from "../db.js";
import { readOpenClawConfig } from "./openclaw-config.js";
const DEFAULT_EVERY_MS = 300_000; // 5 minutes
const DEFAULT_AGENT_TIMEOUT_SECONDS = 30 * 60; // 30 minutes
const DEFAULT_POLLING_TIMEOUT_SECONDS = 120;
const DEFAULT_POLLING_MODEL = "default";
function buildAgentPrompt(workflowId, agentId) {
    return buildPollingPrompt(workflowId, agentId);
}
export function buildWorkPrompt(workflowId, agentId) {
    const fullAgentId = `${workflowId}_${agentId}`;
    const cli = resolveAntfarmCli();
    return `You are an Antfarm workflow agent. Execute the pending work below.

⚠️ CRITICAL: You MUST call "step complete" or "step fail" before ending your session. If you don't, the workflow will be stuck forever. This is non-negotiable.

The claimed step JSON is provided below. It contains: {"stepId": "...", "runId": "...", "input": "..."}
Save the stepId — you'll need it to report completion.
The "input" field contains your FULLY RESOLVED task instructions. Read it carefully and DO the work.

Do the work described in the input. Format your output with KEY: value lines exactly as specified by the claimed step input.
If the claimed step input says "Reply with" or "Reply ONLY in this format", you must preserve those exact keys and headings in your completion output.
Do NOT substitute generic headings like CHANGES, TESTS, SUMMARY, or NOTES unless the claimed step input explicitly asks for them.

MANDATORY: Report completion (do this IMMEDIATELY after finishing the work):
\`\`\`
cat <<'ANTFARM_EOF' > /tmp/antfarm-step-output.txt
<paste the exact KEY: value output required by the claimed step input here>
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
export function buildPollingPrompt(workflowId, agentId, workModel = DEFAULT_POLLING_MODEL) {
    const fullAgentId = `${workflowId}_${agentId}`;
    const cli = resolveAntfarmCli();
    const workPrompt = buildWorkPrompt(workflowId, agentId);
    return `You are an Antfarm workflow agent. Poll for work, then hand execution to a second session.

Step 1 — Lightweight poll:
\`\`\`
node ${cli} step peek "${fullAgentId}"
\`\`\`
If the output is "NO_WORK", reply HEARTBEAT_OK and stop immediately. Do NOT run step claim.

Step 2 — Claim only when work exists:
\`\`\`
node ${cli} step claim "${fullAgentId}"
\`\`\`
If claim returns "NO_WORK", reply HEARTBEAT_OK and stop.

Step 3 — parse the claimed JSON. It contains stepId, runId, and input. Keep the raw payload as CLAIMED STEP JSON.

Step 4 — Start Phase 2 with sessions_spawn using agentId "${fullAgentId}" and model "${workModel}". Give the spawned session the work prompt below plus the exact claimed payload under a heading named CLAIMED STEP JSON.

---START WORK PROMPT---
${workPrompt}
---END WORK PROMPT---`;
}
function extractModel(value) {
    if (!value)
        return undefined;
    if (typeof value === "string")
        return value;
    if (typeof value === "object" && value !== null) {
        const primary = value.primary;
        if (typeof primary === "string")
            return primary;
    }
    return undefined;
}
async function resolveAgentCronModel(agentId, requestedModel) {
    if (requestedModel && requestedModel !== "default") {
        return requestedModel;
    }
    try {
        const { config } = await readOpenClawConfig();
        const agents = config.agents?.list;
        if (Array.isArray(agents)) {
            const entry = agents.find((a) => a?.id === agentId);
            const configured = extractModel(entry?.model);
            if (configured)
                return configured;
        }
        const defaults = config.agents?.defaults;
        const fallback = extractModel(defaults?.model);
        if (fallback)
            return fallback;
    }
    catch {
        // best-effort — fallback below
    }
    return requestedModel;
}
export async function setupAgentCrons(workflow) {
    const agents = workflow.agents;
    // Allow per-workflow cron interval via cron.interval_ms in workflow.yml
    const everyMs = workflow.cron?.interval_ms ?? DEFAULT_EVERY_MS;
    // Resolve polling model: per-agent > workflow-level > default
    const workflowPollingModel = workflow.polling?.model ?? DEFAULT_POLLING_MODEL;
    const workflowPollingTimeout = workflow.polling?.timeoutSeconds ?? DEFAULT_POLLING_TIMEOUT_SECONDS;
    for (let i = 0; i < agents.length; i++) {
        const agent = agents[i];
        const anchorMs = i * 60_000; // stagger by 1 minute each
        const cronName = `antfarm/${workflow.id}/${agent.id}`;
        const agentId = `${workflow.id}_${agent.id}`;
        const requestedModel = agent.model ?? agent.pollingModel ?? workflowPollingModel;
        const model = await resolveAgentCronModel(agentId, requestedModel);
        const prompt = buildPollingPrompt(workflow.id, agent.id, requestedModel ?? DEFAULT_POLLING_MODEL);
        const timeoutSeconds = Math.max(agent.timeoutSeconds ?? 0, workflowPollingTimeout);
        const result = await createAgentCronJob({
            name: cronName,
            schedule: { kind: "every", everyMs, anchorMs },
            sessionTarget: "isolated",
            agentId,
            payload: { kind: "agentTurn", message: prompt, model, timeoutSeconds },
            delivery: { mode: "none" },
            enabled: true,
        });
        if (!result.ok) {
            throw new Error(`Failed to create cron job for agent "${agent.id}": ${result.error}`);
        }
    }
}
export async function removeAgentCrons(workflowId) {
    await deleteAgentCronJobs(`antfarm/${workflowId}/`);
}
// ── Run-scoped cron lifecycle ───────────────────────────────────────
/**
 * Count active (running) runs for a given workflow.
 */
function countActiveRuns(workflowId) {
    const db = getDb();
    const row = db.prepare("SELECT COUNT(*) as cnt FROM runs WHERE workflow_id = ? AND status = 'running'").get(workflowId);
    return row.cnt;
}
/**
 * Check if crons already exist for a workflow.
 */
async function workflowCronsExist(workflowId) {
    const result = await listCronJobs();
    if (!result.ok || !result.jobs)
        return false;
    const prefix = `antfarm/${workflowId}/`;
    return result.jobs.some((j) => j.name.startsWith(prefix));
}
/**
 * Start crons for a workflow when a run begins.
 * No-ops if crons already exist (another run of the same workflow is active).
 */
export async function ensureWorkflowCrons(workflow) {
    if (await workflowCronsExist(workflow.id))
        return;
    // Preflight: verify cron tool is accessible before attempting to create jobs
    const preflight = await checkCronToolAvailable();
    if (!preflight.ok) {
        throw new Error(preflight.error);
    }
    await setupAgentCrons(workflow);
}
/**
 * Tear down crons for a workflow when a run ends.
 * Only removes if no other active runs exist for this workflow.
 */
export async function teardownWorkflowCronsIfIdle(workflowId) {
    const active = countActiveRuns(workflowId);
    if (active > 0)
        return;
    await removeAgentCrons(workflowId);
}
