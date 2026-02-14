import { getDb } from "../db.js";
import { teardownWorkflowCronsIfIdle } from "./agent-cron.js";
import { emitEvent } from "./events.js";

export type RunInfo = {
  id: string;
  workflow_id: string;
  task: string;
  status: string;
  context: string;
  created_at: string;
  updated_at: string;
};

export type StepInfo = {
  id: string;
  run_id: string;
  step_id: string;
  agent_id: string;
  step_index: number;
  input_template: string;
  expects: string;
  status: string;
  output: string | null;
  retry_count: number;
  max_retries: number;
  created_at: string;
  updated_at: string;
};

export type WorkflowStatusResult =
  | { status: "ok"; run: RunInfo; steps: StepInfo[] }
  | { status: "not_found"; message: string };

export function getWorkflowStatus(query: string): WorkflowStatusResult {
  const db = getDb();

  // Try exact match first, then substring match, then prefix match
  let run = db.prepare("SELECT * FROM runs WHERE LOWER(task) = LOWER(?) ORDER BY created_at DESC LIMIT 1").get(query) as RunInfo | undefined;

  if (!run) {
    run = db.prepare("SELECT * FROM runs WHERE LOWER(task) LIKE '%' || LOWER(?) || '%' ORDER BY created_at DESC LIMIT 1").get(query) as RunInfo | undefined;
  }

  // Also try matching by run ID (prefix or full)
  if (!run) {
    run = db.prepare("SELECT * FROM runs WHERE id LIKE ? || '%' ORDER BY created_at DESC LIMIT 1").get(query) as RunInfo | undefined;
  }

  if (!run) {
    const allRuns = db.prepare("SELECT id, task, status, created_at FROM runs ORDER BY created_at DESC LIMIT 20").all() as Array<{ id: string; task: string; status: string; created_at: string }>;
    const available = allRuns.map((r) => `  [${r.status}] ${r.id.slice(0, 8)} ${r.task.slice(0, 60)}`);
    return {
      status: "not_found",
      message: available.length
        ? `No run matching "${query}". Recent runs:\n${available.join("\n")}`
        : "No workflow runs found.",
    };
  }

  const steps = db.prepare("SELECT * FROM steps WHERE run_id = ? ORDER BY step_index ASC").all(run.id) as StepInfo[];
  return { status: "ok", run, steps };
}

export function listRuns(): RunInfo[] {
  const db = getDb();
  return db.prepare("SELECT * FROM runs ORDER BY created_at DESC").all() as RunInfo[];
}

export type HistoryEntry = {
  id: string;
  task: string;
  status: string;
  created_at: string;
  updated_at: string;
  steps_completed: number;
  steps_total: number;
};

export function getWorkflowHistory(workflowId: string, limit: number = 10): HistoryEntry[] {
  const db = getDb();
  const runs = db.prepare(
    "SELECT * FROM runs WHERE workflow_id = ? ORDER BY created_at DESC LIMIT ?"
  ).all(workflowId, limit) as RunInfo[];

  return runs.map((run) => {
    const steps = db.prepare("SELECT status FROM steps WHERE run_id = ?").all(run.id) as Array<{ status: string }>;
    const stepsCompleted = steps.filter((s) => s.status === "done").length;
    return {
      id: run.id,
      task: run.task,
      status: run.status,
      created_at: run.created_at,
      updated_at: run.updated_at,
      steps_completed: stepsCompleted,
      steps_total: steps.length,
    };
  });
}

export type DeleteRunResult =
  | { status: "ok"; runId: string; workflowId: string }
  | { status: "not_found"; message: string }
  | { status: "active"; message: string };

export function deleteWorkflowRun(query: string): DeleteRunResult {
  const db = getDb();

  let run = db.prepare("SELECT * FROM runs WHERE id = ?").get(query) as RunInfo | undefined;
  if (!run) {
    run = db.prepare("SELECT * FROM runs WHERE id LIKE ? || '%' ORDER BY created_at DESC LIMIT 1").get(query) as RunInfo | undefined;
  }

  if (!run) {
    return { status: "not_found", message: `No run matching "${query}".` };
  }

  if (run.status === "running") {
    return { status: "active", message: `Run ${run.id.slice(0, 8)} is still running. Stop it first with: antfarm workflow stop ${run.id.slice(0, 8)}` };
  }

  // Delete related records then the run
  db.prepare("DELETE FROM stories WHERE run_id = ?").run(run.id);
  db.prepare("DELETE FROM steps WHERE run_id = ?").run(run.id);
  db.prepare("DELETE FROM runs WHERE id = ?").run(run.id);

  return { status: "ok", runId: run.id, workflowId: run.workflow_id };
}

export function deleteAllRuns(force: boolean = false): { deleted: number; skipped: number; activeIds: string[] } {
  const db = getDb();
  const allRuns = db.prepare("SELECT id, status, workflow_id FROM runs").all() as Array<{ id: string; status: string; workflow_id: string }>;

  const activeRuns = allRuns.filter((r) => r.status === "running");
  const deletableRuns = force ? allRuns.filter((r) => r.status !== "running") : allRuns.filter((r) => r.status !== "running");

  for (const run of deletableRuns) {
    db.prepare("DELETE FROM stories WHERE run_id = ?").run(run.id);
    db.prepare("DELETE FROM steps WHERE run_id = ?").run(run.id);
    db.prepare("DELETE FROM runs WHERE id = ?").run(run.id);
  }

  return {
    deleted: deletableRuns.length,
    skipped: activeRuns.length,
    activeIds: activeRuns.map((r) => r.id),
  };
}

export type StopWorkflowResult =
  | { status: "ok"; runId: string; workflowId: string; cancelledSteps: number }
  | { status: "not_found"; message: string }
  | { status: "already_done"; message: string };

export async function stopWorkflow(query: string): Promise<StopWorkflowResult> {
  const db = getDb();

  // Try exact match first, then prefix match (same pattern as resume command)
  let run = db.prepare("SELECT * FROM runs WHERE id = ?").get(query) as RunInfo | undefined;
  if (!run) {
    run = db.prepare("SELECT * FROM runs WHERE id LIKE ? || '%' ORDER BY created_at DESC LIMIT 1").get(query) as RunInfo | undefined;
  }

  if (!run) {
    const allRuns = db.prepare("SELECT id, task, status, created_at FROM runs ORDER BY created_at DESC LIMIT 20").all() as Array<{ id: string; task: string; status: string; created_at: string }>;
    const available = allRuns.map((r) => `  [${r.status}] ${r.id.slice(0, 8)} ${r.task.slice(0, 60)}`);
    return {
      status: "not_found",
      message: available.length
        ? `No run matching "${query}". Recent runs:\n${available.join("\n")}`
        : "No workflow runs found.",
    };
  }

  if (run.status === "completed" || run.status === "cancelled") {
    return {
      status: "already_done",
      message: `Run ${run.id.slice(0, 8)} is already "${run.status}".`,
    };
  }

  // Set run status to cancelled
  db.prepare("UPDATE runs SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?").run(run.id);

  // Update all non-done steps to failed
  const result = db.prepare(
    "UPDATE steps SET status = 'failed', output = 'Cancelled by user', updated_at = datetime('now') WHERE run_id = ? AND status IN ('waiting', 'pending', 'running')"
  ).run(run.id);
  const cancelledSteps = Number(result.changes);

  // Clean up cron jobs if no other active runs
  await teardownWorkflowCronsIfIdle(run.workflow_id);

  // Emit event
  emitEvent({
    ts: new Date().toISOString(),
    event: "run.failed",
    runId: run.id,
    workflowId: run.workflow_id,
    detail: "Cancelled by user",
  });

  return {
    status: "ok",
    runId: run.id,
    workflowId: run.workflow_id,
    cancelledSteps,
  };
}
