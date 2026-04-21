import { getDb } from "../db.js";
import { SHARED_CHECKOUT_EXCLUSIVE } from "./repo-isolation.js";
import type { StepExecutionMode } from "./types.js";

/**
 * Repo scheduler boundary.
 *
 * Every terminal transition for a repo-mutating step (completed, failed,
 * cancelled, abandoned-and-reset) must run through this release helper. In
 * v1 the only responsibility is cleaning up stale `blocked_by_*` annotations
 * that were pointing at the step we just released so the dashboard doesn't
 * lie about why later same-repo work is queued. The claim guard itself
 * naturally promotes the next queued same-repo step on the next poll because
 * it filters on `status = 'running'`.
 *
 * Keeping this behind a helper gives us a single seam to extend when we add
 * per-step worktree isolation later: a future `worktree_isolated` mode will
 * plug its cleanup (rm -rf worktree, git worktree prune, release held file
 * lock) into this function without the runner needing to know about it.
 */

export type ReleaseReason =
  | "completed"
  | "failed"
  | "cancelled"
  | "abandoned";

export interface ReleaseStepResourcesArgs {
  stepId: string;
  runId?: string | null;
  executionMode: StepExecutionMode | string | null | undefined;
  repoKey: string | null | undefined;
  reason: ReleaseReason;
}

/**
 * Clear metadata attached to peer pending same-repo coding steps that were
 * annotated as "blocked by this step" so operators see the new state on the
 * next dashboard read instead of waiting for annotateBlockedCodingSteps to
 * refresh on the next poll.
 *
 * Returns the id of the oldest queued same-repo pending step (FIFO by
 * created_at, then id) for visibility / future promotion hooks. Today the
 * actual promotion happens in the claim path — this function does not flip
 * the successor to running.
 */
export function releaseStepResources(args: ReleaseStepResourcesArgs): {
  nextStepId: string | null;
} {
  if (args.executionMode !== SHARED_CHECKOUT_EXCLUSIVE) {
    return { nextStepId: null };
  }
  if (!args.repoKey) return { nextStepId: null };

  const db = getDb();

  // Wipe stale block annotations that referenced the step we just released.
  // These will be re-stamped against a new owner by annotateBlockedCodingSteps
  // on the next poll if the repo is re-claimed; for now we want the UI to
  // stop showing the released step as the blocker.
  db.prepare(
    `UPDATE steps
        SET blocked_by_run_id = NULL,
            blocked_by_step_id = NULL,
            updated_at = datetime('now')
      WHERE status = 'pending'
        AND execution_mode = 'shared_checkout_exclusive'
        AND repo_key = ?
        AND blocked_by_step_id = ?`,
  ).run(args.repoKey, args.stepId);

  // Identify the next queued same-repo step under deterministic FIFO ordering
  // (created_at ASC, then id ASC as tiebreaker). Callers may log / emit this
  // for observability; today we just return it so tests can assert ordering.
  const next = db.prepare(
    `SELECT s.id AS id
       FROM steps s
       JOIN runs r ON r.id = s.run_id
      WHERE s.status = 'pending'
        AND s.execution_mode = 'shared_checkout_exclusive'
        AND s.repo_key = ?
        AND s.id != ?
        AND r.status NOT IN ('failed','cancelled')
      ORDER BY s.created_at ASC, s.id ASC
      LIMIT 1`,
  ).get(args.repoKey, args.stepId) as { id: string } | undefined;

  return { nextStepId: next?.id ?? null };
}

/**
 * Convenience wrapper: look up a step by id and release its lease.
 * Used by callers that don't already have execution_mode / repo_key in scope.
 * Silently no-ops for missing steps.
 */
export function releaseStepLeaseById(
  stepId: string,
  reason: ReleaseReason,
): { nextStepId: string | null } {
  const db = getDb();
  const row = db.prepare(
    `SELECT id, run_id, execution_mode, repo_key
       FROM steps
      WHERE id = ?`,
  ).get(stepId) as
    | { id: string; run_id: string; execution_mode: string | null; repo_key: string | null }
    | undefined;
  if (!row) return { nextStepId: null };
  return releaseStepResources({
    stepId: row.id,
    runId: row.run_id,
    executionMode: row.execution_mode,
    repoKey: row.repo_key,
    reason,
  });
}

/**
 * Release every currently-running repo-mutating step for a run. Used during
 * cancellation when the caller has already flipped statuses in bulk.
 *
 * Important: call this BEFORE marking the steps non-running is fine, or
 * AFTER — the helper just clears block metadata on peers that referenced
 * these steps. It does not inspect or change the released step's status.
 */
export function releaseRunSteps(
  runId: string,
  reason: ReleaseReason,
): void {
  const db = getDb();
  const rows = db.prepare(
    `SELECT id, execution_mode, repo_key
       FROM steps
      WHERE run_id = ?
        AND execution_mode = 'shared_checkout_exclusive'
        AND repo_key IS NOT NULL`,
  ).all(runId) as Array<{ id: string; execution_mode: string; repo_key: string }>;
  for (const row of rows) {
    releaseStepResources({
      stepId: row.id,
      runId,
      executionMode: row.execution_mode,
      repoKey: row.repo_key,
      reason,
    });
  }
}
