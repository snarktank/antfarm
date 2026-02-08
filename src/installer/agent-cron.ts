import { createAgentCronJob, deleteAgentCronJobs } from "./gateway-api.js";
import type { WorkflowSpec } from "./types.js";
import { resolveAntfarmCli } from "./paths.js";

const DEFAULT_EVERY_MS = 300_000; // 5 minutes

function buildAgentPrompt(workflowId: string, agentId: string): string {
  const fullAgentId = `${workflowId}/${agentId}`;
  const cli = resolveAntfarmCli();

  return `You are an Antfarm workflow agent. Check for pending work and execute it.

Step 1 — Check for pending work:
\`\`\`
node ${cli} step claim "${fullAgentId}"
\`\`\`

If output is "NO_WORK", reply HEARTBEAT_OK and stop.

Step 2 — If JSON is returned, it contains: {"stepId": "...", "runId": "...", "input": "..."}
The "input" field contains your FULLY RESOLVED task instructions. All template variables have been replaced with actual values. Read the input carefully and DO the work it describes. This is the core of your job.

Step 3 — After completing the work, format your output with KEY: value lines (e.g., STATUS: done, REPO: /path, BRANCH: name, etc.) as specified in the task instructions.

Step 4 — Report completion. Pass your full output text:
\`\`\`
node ${cli} step complete "<stepId>" "STATUS: done
REPO: /path/to/repo
BRANCH: feature-branch
..."
\`\`\`

This automatically: saves your output, merges KEY: value pairs into the run context, and advances the pipeline to the next step.

If the work FAILED and should be retried:
\`\`\`
node ${cli} step fail "<stepId>" "description of what went wrong"
\`\`\`

This handles retry logic automatically (retries up to max_retries, then fails the run).`;
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

    await createAgentCronJob({
      name: cronName,
      schedule: { kind: "every", everyMs, anchorMs },
      sessionTarget: "isolated",
      agentId,
      payload: { kind: "agentTurn", message: prompt },
      delivery: { mode: "none" },
      enabled: true,
    });
  }
}

export async function removeAgentCrons(workflowId: string): Promise<void> {
  await deleteAgentCronJobs(`antfarm/${workflowId}/`);
}
