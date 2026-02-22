import crypto from "node:crypto";
import { loadWorkflowSpec } from "./workflow-spec.js";
import { resolveWorkflowDir } from "./paths.js";
import { getDb } from "../db.js";
import { logger } from "../lib/logger.js";
import { ensureWorkflowCrons } from "./agent-cron.js";
import { emitEvent } from "./events.js";

function extractProjectKey(taskTitle: string): string | null {
  const m = taskTitle.match(/REPO:\s*([^\s\n]+)/i);
  if (!m) return null;
  const normalized = (m[1] ?? "").replace(/[.,;]+$/g, "").trim().toLowerCase();
  return normalized || null;
}

export async function runWorkflow(params: {
  workflowId: string;
  taskTitle: string;
  notifyUrl?: string;
}): Promise<{ id: string; workflowId: string; task: string; status: string }> {
  const workflowDir = resolveWorkflowDir(params.workflowId);
  const workflow = await loadWorkflowSpec(workflowDir);
  const db = getDb();
  const now = new Date().toISOString();
  const runId = crypto.randomUUID();
  const projectKey = extractProjectKey(params.taskTitle);

  const initialContext: Record<string, string> = {
    task: params.taskTitle,
    ...workflow.context,
  };

  db.exec("BEGIN");
  try {
    const notifyUrl = params.notifyUrl ?? workflow.notifications?.url ?? null;

    const hasActiveForProject = projectKey
      ? (db.prepare("SELECT id FROM runs WHERE status = 'running' AND project_key = ? LIMIT 1").get(projectKey) as { id: string } | undefined)
      : undefined;
    const runStatus = hasActiveForProject ? "queued" : "running";

    const insertRun = db.prepare(
      "INSERT INTO runs (id, workflow_id, task, status, context, notify_url, project_key, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    );
    insertRun.run(runId, workflow.id, params.taskTitle, runStatus, JSON.stringify(initialContext), notifyUrl, projectKey, now, now);

    const insertStep = db.prepare(
      "INSERT INTO steps (id, run_id, step_id, agent_id, step_index, input_template, expects, status, max_retries, type, loop_config, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    );

    for (let i = 0; i < workflow.steps.length; i++) {
      const step = workflow.steps[i];
      const stepUuid = crypto.randomUUID();
      const agentId = `${workflow.id}/${step.agent}`;
      const status = runStatus === "running" && i === 0 ? "pending" : "waiting";
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

  // Start crons for this workflow (no-op if already running from another run)
  try {
    await ensureWorkflowCrons(workflow);
  } catch (err) {
    // Roll back the run since it can't advance without crons
    const db2 = getDb();
    db2.prepare("UPDATE runs SET status = 'failed', updated_at = ? WHERE id = ?").run(new Date().toISOString(), runId);
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Cannot start workflow run: cron setup failed. ${message}`);
  }

  const created = db.prepare("SELECT status FROM runs WHERE id = ?").get(runId) as { status: string };
  if (created.status === "running") {
    emitEvent({ ts: new Date().toISOString(), event: "run.started", runId, workflowId: workflow.id });
    await logger.info(`Run started: "${params.taskTitle}"`, {
      workflowId: workflow.id,
      runId,
      stepId: workflow.steps[0]?.id,
    });
  } else {
    await logger.info(`Run queued: "${params.taskTitle}"`, {
      workflowId: workflow.id,
      runId,
    });
  }

  return { id: runId, workflowId: workflow.id, task: params.taskTitle, status: created.status };
}
