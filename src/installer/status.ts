import { getDb } from "../db.js";
import { teardownWorkflowCronsIfIdle } from "./agent-cron.js";
import { emitEvent } from "./events.js";
import { archiveRunProgress } from "./step-ops.js";

/**
 * Lifecycle states a run row in the `runs` table can have.
 *
 * `paused` is a resumable parked state distinct from `cancelled` /
 * `completed` / `failed` — the run keeps its progress and can later be
 * resumed without being archived.
 */
export type RunStatus =
  | "running"
  | "paused"
  | "blocked"
  | "completed"
  | "cancelled"
  | "failed";

export type RunInfo = {
  id: string;
  run_number: number | null;
  workflow_id: string;
  task: string;
  status: RunStatus | string;
  context: string;
  archived_at: string | null;
  pause_requested_at: string | null;
  paused_at: string | null;
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

export type PauseMode = "immediate" | "requested";

export type PauseWorkflowResult =
  | { status: "ok"; mode: PauseMode; runId: string; workflowId: string; pausedAt: string | null; pauseRequestedAt: string }
  | { status: "not_found"; message: string }
  | { status: "not_pausable"; message: string }
  | { status: "already_paused"; message: string };

export type ResumeMode = "paused" | "failed";

export type ResumeWorkflowResult =
  | {
      status: "ok";
      mode: ResumeMode;
      runId: string;
      workflowId: string;
      /** Step id (human-readable) that was returned to pending, when one exists. */
      nextStepId?: string | null;
      detail?: string;
    }
  | { status: "not_found"; message: string }
  | { status: "not_resumable"; message: string };

/**
 * Shared run lookup that mirrors the resolution order used across the
 * CLI and status helpers:
 *
 *   1. numeric `run_number` (if the query is pure digits)
 *   2. exact `id` match
 *   3. `id` prefix match
 *
 * Returns `undefined` when no run matches. Callers decide how to render
 * the "not found" message so they can include a recent-runs list.
 */
export function findRun(query: string): RunInfo | undefined {
  const db = getDb();
  let run: RunInfo | undefined;
  if (/^\d+$/.test(query)) {
    run = db
      .prepare("SELECT * FROM runs WHERE run_number = ? LIMIT 1")
      .get(parseInt(query, 10)) as RunInfo | undefined;
  }
  if (!run) {
    run = db.prepare("SELECT * FROM runs WHERE id = ?").get(query) as RunInfo | undefined;
  }
  if (!run) {
    run = db
      .prepare("SELECT * FROM runs WHERE id LIKE ? || '%' ORDER BY created_at DESC LIMIT 1")
      .get(query) as RunInfo | undefined;
  }
  return run;
}

/**
 * Build a "no run matching X" message that lists up to 20 recent
 * non-archived runs so operators can correct typos quickly. Shared by
 * stop/archive/pause/resume so the UX is consistent.
 */
function notFoundMessage(query: string): string {
  const db = getDb();
  const allRuns = db
    .prepare(
      "SELECT id, run_number, task, status, created_at FROM runs WHERE archived_at IS NULL ORDER BY created_at DESC LIMIT 20",
    )
    .all() as Array<{ id: string; run_number: number | null; task: string; status: string; created_at: string }>;
  const available = allRuns.map((r) => {
    const num = r.run_number != null ? `#${r.run_number}` : r.id.slice(0, 8);
    return `  [${r.status}] ${num.padEnd(6)} ${r.task.slice(0, 60)}`;
  });
  return available.length
    ? `No run matching "${query}". Recent runs:\n${available.join("\n")}`
    : "No workflow runs found.";
}

export async function stopWorkflow(query: string): Promise<StopWorkflowResult> {
  const db = getDb();

  const run = findRun(query);
  if (!run) {
    return { status: "not_found", message: notFoundMessage(query) };
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

  const run = findRun(query);
  if (!run) {
    return { status: "not_found", message: notFoundMessage(query) };
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

/**
 * Cooperatively pause a run.
 *
 * If no step is currently running, the run is moved straight into the
 * `paused` state. If a step is mid-flight, we only record
 * `pause_requested_at` — the run keeps its active status and pipeline
 * advancement is expected to honor the flag between steps rather than
 * killing in-flight work.
 */
export async function pauseWorkflow(query: string): Promise<PauseWorkflowResult> {
  const db = getDb();

  const run = findRun(query);
  if (!run) {
    return { status: "not_found", message: notFoundMessage(query) };
  }

  if (run.status === "paused") {
    return {
      status: "already_paused",
      message: `Run ${run.id.slice(0, 8)} is already paused.`,
    };
  }

  if (["completed", "failed", "cancelled"].includes(run.status)) {
    return {
      status: "not_pausable",
      message: `Run ${run.id.slice(0, 8)} is "${run.status}" and cannot be paused.`,
    };
  }

  const runningStep = db
    .prepare("SELECT id FROM steps WHERE run_id = ? AND status = 'running' LIMIT 1")
    .get(run.id) as { id: string } | undefined;

  const now = new Date().toISOString();

  if (runningStep) {
    // Cooperative pause: mark the request but leave the running step alone.
    db.prepare(
      "UPDATE runs SET pause_requested_at = COALESCE(pause_requested_at, ?), updated_at = datetime('now') WHERE id = ?",
    ).run(now, run.id);
    const after = db
      .prepare("SELECT pause_requested_at FROM runs WHERE id = ?")
      .get(run.id) as { pause_requested_at: string };
    emitEvent({
      ts: now,
      event: "run.failed",
      runId: run.id,
      workflowId: run.workflow_id,
      detail: "Pause requested (cooperative); will settle between steps",
    });
    return {
      status: "ok",
      mode: "requested",
      runId: run.id,
      workflowId: run.workflow_id,
      pausedAt: null,
      pauseRequestedAt: after.pause_requested_at,
    };
  }

  // Immediate pause — no step is running, so settle into paused now.
  db.prepare(
    `UPDATE runs
       SET status = 'paused',
           pause_requested_at = COALESCE(pause_requested_at, ?),
           paused_at = ?,
           updated_at = datetime('now')
     WHERE id = ?`,
  ).run(now, now, run.id);

  // Best-effort teardown of workflow crons if no other active runs are left.
  await teardownWorkflowCronsIfIdle(run.workflow_id);

  emitEvent({
    ts: now,
    event: "run.failed",
    runId: run.id,
    workflowId: run.workflow_id,
    detail: "Paused by user",
  });

  return {
    status: "ok",
    mode: "immediate",
    runId: run.id,
    workflowId: run.workflow_id,
    pausedAt: now,
    pauseRequestedAt: now,
  };
}

/**
 * Resume a run.
 *
 * - Paused runs: clear pause metadata, set status back to running, and
 *   promote the next eligible step from `waiting` to `pending` so the
 *   agent cron picks it up again.
 * - Failed runs: preserve the historical behavior — reset the failed
 *   step (or failed story for loop steps) and set the run back to
 *   running. The verify-each loop case is handled explicitly so resume
 *   works for both simple steps and verify-each loops.
 */
export async function resumeWorkflow(query: string): Promise<ResumeWorkflowResult> {
  const db = getDb();

  const run = findRun(query);
  if (!run) {
    return { status: "not_found", message: notFoundMessage(query) };
  }

  if (run.status === "paused") {
    return resumePausedRun(run);
  }
  if (run.status === "failed") {
    return resumeFailedRun(run);
  }

  return {
    status: "not_resumable",
    message: `Run ${run.id.slice(0, 8)} is "${run.status}". Only paused or failed runs can be resumed.`,
  };
}

async function resumePausedRun(run: RunInfo): Promise<ResumeWorkflowResult> {
  const db = getDb();

  db.prepare(
    `UPDATE runs
       SET status = 'running',
           pause_requested_at = NULL,
           paused_at = NULL,
           updated_at = datetime('now')
     WHERE id = ?`,
  ).run(run.id);

  // Find the next step that is not already terminal. If it's still
  // `waiting` promote to `pending`; if it's already `pending` or
  // `running` leave it alone.
  const nextStep = db
    .prepare(
      `SELECT id, step_id, status FROM steps
        WHERE run_id = ? AND status IN ('waiting', 'pending', 'running')
        ORDER BY step_index ASC LIMIT 1`,
    )
    .get(run.id) as { id: string; step_id: string; status: string } | undefined;

  if (nextStep && nextStep.status === "waiting") {
    db.prepare(
      "UPDATE steps SET status = 'pending', updated_at = datetime('now') WHERE id = ?",
    ).run(nextStep.id);
  }

  await ensureCronsForWorkflow(run.workflow_id);

  emitEvent({
    ts: new Date().toISOString(),
    event: "run.started",
    runId: run.id,
    workflowId: run.workflow_id,
    stepId: nextStep?.step_id,
    detail: "Resumed from paused",
  });

  return {
    status: "ok",
    mode: "paused",
    runId: run.id,
    workflowId: run.workflow_id,
    nextStepId: nextStep?.step_id ?? null,
    detail: nextStep
      ? `Resumed from paused — next step "${nextStep.step_id}" is pending`
      : "Resumed from paused — no pending steps remain",
  };
}

async function resumeFailedRun(run: RunInfo): Promise<ResumeWorkflowResult> {
  const db = getDb();

  const failedStep = db
    .prepare(
      "SELECT id, step_id, type, current_story_id FROM steps WHERE run_id = ? AND status = 'failed' ORDER BY step_index ASC LIMIT 1",
    )
    .get(run.id) as { id: string; step_id: string; type: string; current_story_id: string | null } | undefined;

  if (!failedStep) {
    return {
      status: "not_resumable",
      message: `No failed step found in run ${run.id.slice(0, 8)}.`,
    };
  }

  // If it's a loop step with a failed story, reset that story to pending.
  if (failedStep.type === "loop") {
    const failedStory = db
      .prepare(
        "SELECT id FROM stories WHERE run_id = ? AND status = 'failed' ORDER BY story_index ASC LIMIT 1",
      )
      .get(run.id) as { id: string } | undefined;
    if (failedStory) {
      db.prepare(
        "UPDATE stories SET status = 'pending', updated_at = datetime('now') WHERE id = ?",
      ).run(failedStory.id);
    }
    db.prepare(
      "UPDATE steps SET retry_count = 0 WHERE run_id = ? AND type = 'loop'",
    ).run(run.id);
  }

  // Verify-each loop: a failing verify step means we have to rewind the
  // paired loop (developer) step so it re-claims the story and repopulates
  // context, and put the verify step back into `waiting`.
  const loopStep = db
    .prepare(
      "SELECT id, loop_config FROM steps WHERE run_id = ? AND type = 'loop' AND status IN ('running', 'failed') LIMIT 1",
    )
    .get(run.id) as { id: string; loop_config: string | null } | undefined;

  if (loopStep?.loop_config) {
    const lc = JSON.parse(loopStep.loop_config) as { verifyEach?: boolean; verifyStep?: string };
    if (lc.verifyEach && lc.verifyStep === failedStep.step_id) {
      db.prepare(
        "UPDATE steps SET status = 'pending', current_story_id = NULL, retry_count = 0, updated_at = datetime('now') WHERE id = ?",
      ).run(loopStep.id);
      db.prepare(
        "UPDATE steps SET status = 'waiting', current_story_id = NULL, retry_count = 0, updated_at = datetime('now') WHERE id = ?",
      ).run(failedStep.id);
      db.prepare(
        "UPDATE stories SET status = 'pending', updated_at = datetime('now') WHERE run_id = ? AND status = 'failed'",
      ).run(run.id);

      db.prepare(
        "UPDATE runs SET status = 'running', updated_at = datetime('now') WHERE id = ?",
      ).run(run.id);

      await ensureCronsForWorkflow(run.workflow_id);

      return {
        status: "ok",
        mode: "failed",
        runId: run.id,
        workflowId: run.workflow_id,
        nextStepId: failedStep.step_id,
        detail: `Reset loop step "${loopStep.id.slice(0, 8)}" to pending, verify step "${failedStep.step_id}" to waiting`,
      };
    }
  }

  // Simple failed step: reset to pending and run.
  db.prepare(
    "UPDATE steps SET status = 'pending', current_story_id = NULL, retry_count = 0, updated_at = datetime('now') WHERE id = ?",
  ).run(failedStep.id);

  db.prepare(
    "UPDATE runs SET status = 'running', updated_at = datetime('now') WHERE id = ?",
  ).run(run.id);

  await ensureCronsForWorkflow(run.workflow_id);

  return {
    status: "ok",
    mode: "failed",
    runId: run.id,
    workflowId: run.workflow_id,
    nextStepId: failedStep.step_id,
    detail: `Resumed from failed step "${failedStep.step_id}"`,
  };
}

async function ensureCronsForWorkflow(workflowId: string): Promise<void> {
  try {
    const { loadWorkflowSpec } = await import("./workflow-spec.js");
    const { resolveWorkflowDir } = await import("./paths.js");
    const { ensureWorkflowCrons } = await import("./agent-cron.js");
    const workflowDir = resolveWorkflowDir(workflowId);
    const workflow = await loadWorkflowSpec(workflowDir);
    await ensureWorkflowCrons(workflow);
  } catch {
    // Best-effort — callers should not fail their lifecycle operation
    // just because cron bootstrap failed. Operators can re-run
    // `workflow ensure-crons` to recover.
  }
}
