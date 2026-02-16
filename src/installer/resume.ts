import { getDb } from "../db.js";
import { loadWorkflowSpec } from "./workflow-spec.js";
import { resolveWorkflowDir } from "./paths.js";
import { ensureWorkflowCrons } from "./agent-cron.js";
import { emitEvent } from "./events.js";

export type ResumeResult =
  | { status: "ok"; runId: string; message: string }
  | { status: "not_found"; message: string }
  | { status: "not_resumable"; message: string };

export async function resumeWorkflowRun(query: string): Promise<ResumeResult> {
  const db = getDb();

  // Find the run (support run number, UUID, or prefix match)
  let run: { id: string; run_number: number | null; workflow_id: string; status: string } | undefined;
  if (/^\d+$/.test(query)) {
    run = db.prepare(
      "SELECT id, run_number, workflow_id, status FROM runs WHERE run_number = ?"
    ).get(parseInt(query, 10)) as typeof run;
  }
  if (!run) {
    run = db.prepare(
      "SELECT id, run_number, workflow_id, status FROM runs WHERE id = ? OR id LIKE ?"
    ).get(query, `${query}%`) as typeof run;
  }

  if (!run) {
    return { status: "not_found", message: `Run not found: ${query}` };
  }

  if (run.status !== "failed") {
    return {
      status: "not_resumable",
      message: `Run ${run.id.slice(0, 8)} is "${run.status}", not "failed". Nothing to resume.`,
    };
  }

  // Find the failed step (or first non-done step)
  const failedStep = db.prepare(
    "SELECT id, step_id, type, current_story_id FROM steps WHERE run_id = ? AND status = 'failed' ORDER BY step_index ASC LIMIT 1"
  ).get(run.id) as { id: string; step_id: string; type: string; current_story_id: string | null } | undefined;

  if (!failedStep) {
    return {
      status: "not_resumable",
      message: `No failed step found in run ${run.id.slice(0, 8)}.`,
    };
  }

  // If it's a loop step with a failed story, reset that story to pending
  if (failedStep.type === "loop") {
    const failedStory = db.prepare(
      "SELECT id FROM stories WHERE run_id = ? AND status = 'failed' ORDER BY story_index ASC LIMIT 1"
    ).get(run.id) as { id: string } | undefined;
    if (failedStory) {
      db.prepare(
        "UPDATE stories SET status = 'pending', updated_at = datetime('now') WHERE id = ?"
      ).run(failedStory.id);
    }
    db.prepare(
      "UPDATE steps SET retry_count = 0 WHERE run_id = ? AND type = 'loop'"
    ).run(run.id);
  }

  // Check if the failed step is a verify step linked to a loop step's verify_each
  const loopStep = db.prepare(
    "SELECT id, loop_config FROM steps WHERE run_id = ? AND type = 'loop' AND status IN ('running', 'failed') LIMIT 1"
  ).get(run.id) as { id: string; loop_config: string | null } | undefined;

  if (loopStep?.loop_config) {
    const lc = JSON.parse(loopStep.loop_config);
    if (lc.verifyEach && lc.verifyStep === failedStep.step_id) {
      // Reset the loop step (developer) to pending so it re-claims the story and populates context
      db.prepare(
        "UPDATE steps SET status = 'pending', current_story_id = NULL, retry_count = 0, updated_at = datetime('now') WHERE id = ?"
      ).run(loopStep.id);
      // Reset verify step to waiting (fires after developer completes)
      db.prepare(
        "UPDATE steps SET status = 'waiting', current_story_id = NULL, retry_count = 0, updated_at = datetime('now') WHERE id = ?"
      ).run(failedStep.id);
      // Reset any failed stories to pending
      db.prepare(
        "UPDATE stories SET status = 'pending', updated_at = datetime('now') WHERE run_id = ? AND status = 'failed'"
      ).run(run.id);

      // Reset run to running
      db.prepare(
        "UPDATE runs SET status = 'running', updated_at = datetime('now') WHERE id = ?"
      ).run(run.id);

      // Ensure crons are running for this workflow
      try {
        const workflowDir = resolveWorkflowDir(run.workflow_id);
        const workflow = await loadWorkflowSpec(workflowDir);
        await ensureWorkflowCrons(workflow);
      } catch (err) {
        // Non-fatal: run is resumed, crons may need manual restart
      }

      emitEvent({
        ts: new Date().toISOString(),
        event: "run.started",
        runId: run.id,
        workflowId: run.workflow_id,
        detail: "Resumed",
      });

      return {
        status: "ok",
        runId: run.id,
        message: `Resumed run ${run.id.slice(0, 8)} — reset loop step to pending, verify step "${failedStep.step_id}" to waiting`,
      };
    }
  }

  // Reset step to pending
  db.prepare(
    "UPDATE steps SET status = 'pending', current_story_id = NULL, retry_count = 0, updated_at = datetime('now') WHERE id = ?"
  ).run(failedStep.id);

  // Reset run to running
  db.prepare(
    "UPDATE runs SET status = 'running', updated_at = datetime('now') WHERE id = ?"
  ).run(run.id);

  // Ensure crons are running for this workflow
  try {
    const workflowDir = resolveWorkflowDir(run.workflow_id);
    const workflow = await loadWorkflowSpec(workflowDir);
    await ensureWorkflowCrons(workflow);
  } catch (err) {
    // Non-fatal: run is resumed, crons may need manual restart
  }

  emitEvent({
    ts: new Date().toISOString(),
    event: "run.started",
    runId: run.id,
    workflowId: run.workflow_id,
    detail: "Resumed",
  });

  return {
    status: "ok",
    runId: run.id,
    message: `Resumed run ${run.id.slice(0, 8)} from step "${failedStep.step_id}"`,
  };
}
