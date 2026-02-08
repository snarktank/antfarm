import crypto from "node:crypto";
import { loadWorkflowSpec } from "./workflow-spec.js";
import { resolveWorkflowDir } from "./paths.js";
import { getDb } from "../db.js";
import { logger } from "../lib/logger.js";

export async function runWorkflow(params: {
  workflowId: string;
  taskTitle: string;
}): Promise<{ id: string; workflowId: string; task: string; status: string }> {
  const workflowDir = resolveWorkflowDir(params.workflowId);
  const workflow = await loadWorkflowSpec(workflowDir);
  const db = getDb();
  const now = new Date().toISOString();
  const runId = crypto.randomUUID();

  const initialContext: Record<string, string> = {
    task: params.taskTitle,
    ...workflow.context,
  };

  db.exec("BEGIN");
  try {
    const insertRun = db.prepare(
      "INSERT INTO runs (id, workflow_id, task, status, context, created_at, updated_at) VALUES (?, ?, ?, 'running', ?, ?, ?)"
    );
    insertRun.run(runId, workflow.id, params.taskTitle, JSON.stringify(initialContext), now, now);

    const insertStep = db.prepare(
      "INSERT INTO steps (id, run_id, step_id, agent_id, step_index, input_template, expects, status, max_retries, type, loop_config, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    );

    for (let i = 0; i < workflow.steps.length; i++) {
      const step = workflow.steps[i];
      const stepUuid = crypto.randomUUID();
      const agentId = `${workflow.id}/${step.agent}`;
      const status = i === 0 ? "pending" : "waiting";
      const maxRetries = step.max_retries ?? step.on_fail?.max_retries ?? 2;
      const stepType = step.type ?? "single";
      const loopConfig = step.loop ? JSON.stringify(step.loop) : null;
      insertStep.run(stepUuid, runId, step.id, agentId, i, step.input, step.expects, status, maxRetries, stepType, loopConfig, now, now);
    }

    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }

  await logger.info(`Run started: "${params.taskTitle}"`, {
    workflowId: workflow.id,
    runId,
    stepId: workflow.steps[0]?.id,
  });

  return { id: runId, workflowId: workflow.id, task: params.taskTitle, status: "running" };
}
