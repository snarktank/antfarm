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
    status: "pending_plan",
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
  
  await logger.info(`Run created (pending plan): "${params.taskTitle}"`, {
    workflowId: workflow.id,
    runId,
  });
  
  return record;
}

export async function approveWorkflowPlan(params: {
  taskTitle: string;
  plan: string;
  acceptanceCriteria: string[];
}): Promise<WorkflowRunRecord | null> {
  const { findRunByTaskTitle } = await import("./run-store.js");
  const run = await findRunByTaskTitle(params.taskTitle);
  if (!run) {
    return null;
  }
  if (run.status !== "pending_plan") {
    throw new Error(`Run status is "${run.status}", not "pending_plan"`);
  }
  
  const now = new Date().toISOString();
  run.status = "running";
  run.plan = params.plan;
  run.acceptanceCriteria = params.acceptanceCriteria;
  run.plannedAt = now;
  run.plannedBy = "main";
  run.context.plan = params.plan;
  run.context.acceptance = params.acceptanceCriteria.join("\n");
  run.updatedAt = now;
  
  await writeWorkflowRun(run);
  
  await logger.info(`Plan approved, run started: "${params.taskTitle}"`, {
    workflowId: run.workflowId,
    runId: run.id,
    stepId: run.currentStepId,
  });
  
  return run;
}
