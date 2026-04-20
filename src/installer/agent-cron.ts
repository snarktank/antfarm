import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { createAgentCronJob, deleteAgentCronJobs, listCronJobs, checkCronToolAvailable } from "./gateway-api.js";
import type { WorkflowSpec } from "./types.js";
import { resolveAntfarmCli, resolveBundledWorkflowDir, resolveWorkflowDir } from "./paths.js";
import { getDb } from "../db.js";
import { readOpenClawConfig } from "./openclaw-config.js";

const DEFAULT_EVERY_MS = 300_000; // 5 minutes
const DEFAULT_AGENT_TIMEOUT_SECONDS = 30 * 60; // 30 minutes

function buildAgentPrompt(workflowId: string, agentId: string): string {
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
Write output to a file first using the write tool.
Use the write tool to create /tmp/antfarm-step-output.txt with the EXACT KEY: value output requested by this step.
Do NOT use placeholder keys like CHANGES/TESTS unless the step explicitly asked for them.

Then run:
node ${cli} step complete-file "<stepId>" "/tmp/antfarm-step-output.txt"
\`\`\`

If the work FAILED:
\`\`\`
node ${cli} step fail "<stepId>" "description of what went wrong"
\`\`\`

RULES:
1. NEVER end your session without calling step complete or step fail
2. Write output to a file first, using the write tool to create /tmp/antfarm-step-output.txt, then run step complete-file
3. If you're unsure whether to complete or fail, call step fail with an explanation
4. The output file must contain every required KEY from the step instructions before you call step complete
5. Do NOT use heredocs, pipes, cat, or shell substitution for step completion

The workflow cannot advance until you report. Your session ending without reporting = broken pipeline.`;
}

export function buildWorkPrompt(workflowId: string, agentId: string): string {
  const fullAgentId = `${workflowId}_${agentId}`;
  const cli = resolveAntfarmCli();
  const executorInstructions = buildExecutorInstructions(workflowId, agentId, cli);

  return `You are an Antfarm workflow agent. Execute the pending work below.

⚠️ CRITICAL: You MUST call "step complete" or "step fail" before ending your session. If you don't, the workflow will be stuck forever. This is non-negotiable.

The claimed step JSON is provided below. It contains: {"stepId": "...", "runId": "...", "input": "..."}
Save the stepId — you'll need it to report completion.
The "input" field contains your FULLY RESOLVED task instructions. Read it carefully and DO the work.

Do the work described in the input. Format your output with KEY: value lines as specified.

${executorInstructions}

MANDATORY: Report completion (do this IMMEDIATELY after finishing the work):
\`\`\`
Write output to a file first using the write tool.
Use the write tool to create /tmp/antfarm-step-output.txt with the EXACT KEY: value output requested by this step.
Do NOT use placeholder keys like CHANGES/TESTS unless the step explicitly asked for them.

Then run:
node ${cli} step complete-file "<stepId>" "/tmp/antfarm-step-output.txt"
\`\`\`

If the work FAILED:
\`\`\`
node ${cli} step fail "<stepId>" "description of what went wrong"
\`\`\`

RULES:
1. NEVER end your session without calling step complete or step fail
2. Write output to a file first, using the write tool to create /tmp/antfarm-step-output.txt, then run step complete-file
3. If you're unsure whether to complete or fail, call step fail with an explanation
4. The output file must contain every required KEY from the step instructions before you call step complete
5. Do NOT use heredocs, pipes, cat, or shell substitution for step completion

The workflow cannot advance until you report. Your session ending without reporting = broken pipeline.`;
}

type AgentExecutorConfig = {
  kind: "claude-code-wrapper";
  command: string;
  model?: string;
  effort?: string;
  maxTurns?: number;
};

const workflowExecutorCache = new Map<string, Map<string, AgentExecutorConfig>>();

function resolveWorkflowYamls(workflowId: string): string[] {
  const bundled = path.join(resolveBundledWorkflowDir(workflowId), "workflow.yml");
  const installed = path.join(resolveWorkflowDir(workflowId), "workflow.yml");
  return [bundled, installed].filter((filePath, index, all) => fs.existsSync(filePath) && all.indexOf(filePath) === index);
}

function getAgentExecutorConfig(workflowId: string, agentId: string): AgentExecutorConfig | null {
  let cached = workflowExecutorCache.get(workflowId);
  if (!cached) {
    cached = new Map<string, AgentExecutorConfig>();
    for (const yamlPath of resolveWorkflowYamls(workflowId)) {
      try {
        const parsed = YAML.parse(fs.readFileSync(yamlPath, "utf-8")) as { agents?: Array<{ id?: string; executor?: AgentExecutorConfig }> };
        for (const agent of parsed.agents ?? []) {
          if (agent.id && agent.executor?.kind === "claude-code-wrapper") {
            cached.set(agent.id, agent.executor);
          }
        }
      } catch {
        // best-effort
      }
    }
    workflowExecutorCache.set(workflowId, cached);
  }
  return cached.get(agentId) ?? null;
}

function buildExecutorInstructions(workflowId: string, agentId: string, cli: string): string {
  const executor = getAgentExecutorConfig(workflowId, agentId);
  if (!executor || executor.kind !== "claude-code-wrapper") return "";

  return `THIS AGENT IS CONFIGURED TO USE THE CLAUDE CODE WRAPPER FOR IMPLEMENTATION.

When you have a claimed step:
1. Use the write tool to save the EXACT claimed step input into /tmp/antfarm-claimed-input.txt.
2. Run this executor command:
\`\`\`
node ${cli} executor run "${workflowId}" "${agentId}" "<runId>" "<stepId>" "/tmp/antfarm-claimed-input.txt" "/tmp/antfarm-step-output.txt"
\`\`\`
3. The executor automatically loads this Antfarm agent's real local workspace context before it runs Claude Code.
4. If that command succeeds, /tmp/antfarm-step-output.txt will already contain the exact KEY: value response from Claude Code.
5. Immediately report completion with step complete-file.
6. If the executor command fails or the wrapper is unavailable, call step fail instead of doing the coding work manually.

Antfarm will emit executor.started / executor.completed / executor.failed events so the dashboard activity shows the wrapper flow.`;
}

const DEFAULT_POLLING_TIMEOUT_SECONDS = 120;
const DEFAULT_POLLING_MODEL = "default";

function extractModel(value: unknown): string | undefined {
  if (!value) return undefined;
  if (typeof value === "string") return value;
  if (typeof value === "object" && value !== null) {
    const primary = (value as { primary?: unknown }).primary;
    if (typeof primary === "string") return primary;
  }
  return undefined;
}

async function resolveAgentCronModel(agentId: string, requestedModel?: string): Promise<string | undefined> {
  if (requestedModel && requestedModel !== "default") {
    return requestedModel;
  }

  try {
    const { config } = await readOpenClawConfig();
    const agents = config.agents?.list;
    if (Array.isArray(agents)) {
      const entry = agents.find((a: any) => a?.id === agentId);
      const configured = extractModel(entry?.model);
      if (configured) return configured;
    }

    const defaults = config.agents?.defaults;
    const fallback = extractModel(defaults?.model);
    if (fallback) return fallback;
  } catch {
    // best-effort — fallback below
  }

  return requestedModel;
}

export function buildPollingPrompt(workflowId: string, agentId: string, workModel?: string): string {
  const fullAgentId = `${workflowId}_${agentId}`;
  const cli = resolveAntfarmCli();
  const model = workModel ?? "default";
  const workPrompt = buildWorkPrompt(workflowId, agentId);

  return `Step 1 — Quick check for pending work (lightweight, no side effects):
\`\`\`
node ${cli} step peek "${fullAgentId}"
\`\`\`
If output is "NO_WORK", reply HEARTBEAT_OK and stop immediately. Do NOT run step claim.

Step 2 — If "HAS_WORK", claim the step:
\`\`\`
node ${cli} step claim "${fullAgentId}"
\`\`\`
If output is "NO_WORK", reply HEARTBEAT_OK and stop.

If JSON is returned, parse it to extract stepId, runId, and input fields.
Then call sessions_spawn with these parameters:
- agentId: "${fullAgentId}"
- model: "${model}"
- task: The full work prompt below, followed by "\\n\\nCLAIMED STEP JSON:\\n" and the exact JSON output from step claim.

Full work prompt to include in the spawned task:
---START WORK PROMPT---
${workPrompt}
---END WORK PROMPT---

Reply with a short summary of what you spawned.`;
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
    const agentId = `${workflow.id}_${agent.id}`;

    // Two-phase: Phase 1 uses cheap polling model + minimal prompt
    const requestedPollingModel = agent.pollingModel ?? workflowPollingModel;
    const pollingModel = await resolveAgentCronModel(agentId, requestedPollingModel);
    const requestedWorkModel = agent.model ?? workflowPollingModel;
    const workModel = await resolveAgentCronModel(agentId, requestedWorkModel);
    const prompt = buildPollingPrompt(workflow.id, agent.id, workModel);
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
