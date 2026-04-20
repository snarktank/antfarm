import { getDb } from "../db.js";
import { teardownWorkflowCronsIfIdle } from "./agent-cron.js";
import { emitEvent } from "./events.js";
import { archiveRunProgress } from "./step-ops.js";

export type RunInfo = {
  id: string;
  run_number: number | null;
  workflow_id: string;
  task: string;
  status: string;
  context: string;
  archived_at: string | null;
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

  // Try run number first (pure digits)
  let run: RunInfo | undefined;
  if (/^\d+$/.test(query)) {
    run = db.prepare("SELECT * FROM runs WHERE run_number = ? LIMIT 1").get(parseInt(query, 10)) as RunInfo | undefined;
  }

  // Try exact task match, then substring match
  if (!run) {
    run = db.prepare("SELECT * FROM runs WHERE LOWER(task) = LOWER(?) ORDER BY created_at DESC LIMIT 1").get(query) as RunInfo | undefined;
  }

  if (!run) {
    run = db.prepare("SELECT * FROM runs WHERE LOWER(task) LIKE '%' || LOWER(?) || '%' ORDER BY created_at DESC LIMIT 1").get(query) as RunInfo | undefined;
  }

  // Also try matching by run ID (prefix or full)
  if (!run) {
    run = db.prepare("SELECT * FROM runs WHERE id LIKE ? || '%' ORDER BY created_at DESC LIMIT 1").get(query) as RunInfo | undefined;
  }

  if (!run) {
    const allRuns = db.prepare("SELECT id, run_number, task, status, created_at FROM runs WHERE archived_at IS NULL ORDER BY created_at DESC LIMIT 20").all() as Array<{ id: string; run_number: number | null; task: string; status: string; created_at: string }>;
    const available = allRuns.map((r) => {
      const num = r.run_number != null ? `#${r.run_number}` : r.id.slice(0, 8);
      return `  [${r.status}] ${num.padEnd(6)} ${r.task.slice(0, 60)}`;
    });
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

export function listRuns(opts: { includeArchived?: boolean; onlyArchived?: boolean } = {}): RunInfo[] {
  const db = getDb();
  if (opts.onlyArchived) {
    return db.prepare("SELECT * FROM runs WHERE archived_at IS NOT NULL ORDER BY archived_at DESC, created_at DESC").all() as RunInfo[];
  }
  if (opts.includeArchived) {
    return db.prepare("SELECT * FROM runs ORDER BY created_at DESC").all() as RunInfo[];
  }
  return db.prepare("SELECT * FROM runs WHERE archived_at IS NULL ORDER BY created_at DESC").all() as RunInfo[];
}

export type StopWorkflowResult =
  | { status: "ok"; runId: string; workflowId: string; cancelledSteps: number }
  | { status: "not_found"; message: string }
  | { status: "already_done"; message: string };

export type ArchiveWorkflowResult =
  | { status: "ok"; runId: string; workflowId: string; archivedAt: string }
  | { status: "not_found"; message: string }
  | { status: "already_archived"; message: string }
  | { status: "not_archivable"; message: string };

export async function stopWorkflow(query: string): Promise<StopWorkflowResult> {
  const db = getDb();

  // Try exact match first, then prefix match (same pattern as resume command)
  let run = db.prepare("SELECT * FROM runs WHERE id = ?").get(query) as RunInfo | undefined;
  if (!run) {
    run = db.prepare("SELECT * FROM runs WHERE id LIKE ? || '%' ORDER BY created_at DESC LIMIT 1").get(query) as RunInfo | undefined;
  }

  if (!run) {
    const allRuns = db.prepare("SELECT id, task, status, created_at FROM runs WHERE archived_at IS NULL ORDER BY created_at DESC LIMIT 20").all() as Array<{ id: string; task: string; status: string; created_at: string }>;
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

export async function archiveWorkflow(query: string): Promise<ArchiveWorkflowResult> {
  const db = getDb();

  let run: RunInfo | undefined;
  if (/^\d+$/.test(query)) {
    run = db.prepare("SELECT * FROM runs WHERE run_number = ? LIMIT 1").get(parseInt(query, 10)) as RunInfo | undefined;
  }
  if (!run) {
    run = db.prepare("SELECT * FROM runs WHERE id = ?").get(query) as RunInfo | undefined;
  }
  if (!run) {
    run = db.prepare("SELECT * FROM runs WHERE id LIKE ? || '%' ORDER BY created_at DESC LIMIT 1").get(query) as RunInfo | undefined;
  }

  if (!run) {
    const allRuns = db.prepare("SELECT id, task, status, created_at FROM runs WHERE archived_at IS NULL ORDER BY created_at DESC LIMIT 20").all() as Array<{ id: string; task: string; status: string; created_at: string }>;
    const available = allRuns.map((r) => `  [${r.status}] ${r.id.slice(0, 8)} ${r.task.slice(0, 60)}`);
    return {
      status: "not_found",
      message: available.length
        ? `No run matching "${query}". Recent runs:\n${available.join("\n")}`
        : "No workflow runs found.",
    };
  }

  if (run.archived_at) {
    return {
      status: "already_archived",
      message: `Run ${run.id.slice(0, 8)} is already archived.`,
    };
  }

  if (!["completed", "failed", "cancelled"].includes(run.status)) {
    return {
      status: "not_archivable",
      message: `Run ${run.id.slice(0, 8)} is "${run.status}". Only completed, failed, or cancelled runs can be archived.`,
    };
  }

  db.prepare("UPDATE runs SET archived_at = datetime('now'), updated_at = datetime('now') WHERE id = ?").run(run.id);
  archiveRunProgress(run.id);
  const archived = db.prepare("SELECT archived_at FROM runs WHERE id = ?").get(run.id) as { archived_at: string };

  emitEvent({
    ts: new Date().toISOString(),
    event: "run.archived",
    runId: run.id,
    workflowId: run.workflow_id,
    detail: `Archived from ${run.status}`,
  });

  return {
    status: "ok",
    runId: run.id,
    workflowId: run.workflow_id,
    archivedAt: archived.archived_at,
  };
}
