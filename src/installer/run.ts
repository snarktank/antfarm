import crypto from "node:crypto";
import { loadWorkflowSpec } from "./workflow-spec.js";
import { resolveWorkflowDir } from "./paths.js";
import { writeWorkflowRun } from "./run-store.js";
import { logger } from "../lib/logger.js";
import type { WorkflowRunRecord } from "./types.js";

function resolveLeadAgentId(workflow: { id: string; agents: Array<{ id: string }> }) {
  const preferred = workflow.agents.find((agent) => agent.id === "lead");
  const leadId = preferred?.id ?? workflow.agents[0]?.id;
  if (!leadId) {
    throw new Error(`Workflow ${workflow.id} has no agents to run`);
  }
  return leadId;
}

export async function runWorkflow(params: {
  workflowId: string;
  taskTitle: string;
}): Promise<WorkflowRunRecord> {
  const workflowDir = resolveWorkflowDir(params.workflowId);
  const workflow = await loadWorkflowSpec(workflowDir);
  const leadAgentId = resolveLeadAgentId(workflow);
  const now = new Date().toISOString();
  const runId = crypto.randomUUID();
  const runId8 = runId.slice(0, 8);
  // Session labels have 64 char limit: wf-{workflow}-lead-{runId8}
  const leadSessionLabel = `wf-${workflow.id}-lead-${runId8}`;
  const record: WorkflowRunRecord = {
    id: runId,
    workflowId: workflow.id,
    workflowName: workflow.name,
    taskTitle: params.taskTitle,
    status: "running",
    leadAgentId: `${workflow.id}/${leadAgentId}`,
    leadSessionLabel,
    currentStepIndex: 0,
    currentStepId: workflow.steps[0]?.id,
    stepResults: [],
    retryCount: 0,
    context: { task: params.taskTitle },
    createdAt: now,
    updatedAt: now,
  };
  await writeWorkflowRun(record);
  
  await logger.info(`Run started: "${params.taskTitle}"`, {
    workflowId: workflow.id,
    runId,
    stepId: workflow.steps[0]?.id,
  });
  
  return record;
}
