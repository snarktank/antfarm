import { getDb } from "../db.js";
import { SHARED_CHECKOUT_EXCLUSIVE } from "./repo-isolation.js";
import type { StepInfo } from "./status.js";

/**
 * Operator-facing description of why a pending coding step is queued on a
 * shared repo checkout. Resolved from the raw `blocked_by_*` pointers the
 * scheduler writes so the CLI/dashboard can render "waiting on run #42"
 * without the UI having to do its own joins.
 *
 * All fields are optional/nullable because the blocking row may have been
 * released between the moment the step was annotated and the moment the
 * status reader resolved context.
 */
export interface RepoQueueContext {
  /** Normalized repo key the queued step is contending for. */
  repoKey: string;
  /** Raw repo path as supplied by the run context, for human display. */
  repoPath: string | null;
  /** ISO timestamp when the step first entered the blocked/queued state. */
  queuedAt: string | null;
  /** Run that is currently holding the shared checkout, if known. */
  blockingRunId: string | null;
  blockingRunNumber: number | null;
  blockingWorkflowId: string | null;
  blockingTask: string | null;
  /** Human-readable step id (e.g. "implement") of the blocking step. */
  blockingStepId: string | null;
  blockingAgentId: string | null;
}

/**
 * StepInfo + an optional `queue` block populated when the step is a pending
 * shared_checkout_exclusive coder waiting on a same-repo owner.
 */
export type EnrichedStepInfo = StepInfo & {
  queue: RepoQueueContext | null;
};

/**
 * A step is "queued on repo" when it is pending, scheduled as
 * shared_checkout_exclusive, and the scheduler annotated it with a same-repo
 * contender. We deliberately require both the repo key and a blocker pointer
 * so we do not flag steps that are simply pending because nothing has polled
 * them yet.
 */
export function isStepQueuedOnRepo(step: StepInfo): boolean {
  if (step.status !== "pending") return false;
  if (step.execution_mode !== SHARED_CHECKOUT_EXCLUSIVE) return false;
  if (!step.repo_key) return false;
  return step.blocked_by_step_id != null || step.blocked_by_run_id != null;
}

/**
 * Resolve the blocking run/step for a queued step via two small lookups.
 * Returns null for steps that are not queued-on-repo.
 */
export function resolveRepoQueueContext(step: StepInfo): RepoQueueContext | null {
  if (!isStepQueuedOnRepo(step)) return null;
  const db = getDb();

  let blockingRunNumber: number | null = null;
  let blockingWorkflowId: string | null = null;
  let blockingTask: string | null = null;
  if (step.blocked_by_run_id) {
    const runRow = db.prepare(
      "SELECT run_number, workflow_id, task FROM runs WHERE id = ?",
    ).get(step.blocked_by_run_id) as
      | { run_number: number | null; workflow_id: string; task: string }
      | undefined;
    if (runRow) {
      blockingRunNumber = runRow.run_number;
      blockingWorkflowId = runRow.workflow_id;
      blockingTask = runRow.task;
    }
  }

  let blockingStepId: string | null = null;
  let blockingAgentId: string | null = null;
  if (step.blocked_by_step_id) {
    const stepRow = db.prepare(
      "SELECT step_id, agent_id FROM steps WHERE id = ?",
    ).get(step.blocked_by_step_id) as { step_id: string; agent_id: string } | undefined;
    if (stepRow) {
      blockingStepId = stepRow.step_id;
      blockingAgentId = stepRow.agent_id;
    }
  }

  return {
    repoKey: step.repo_key!,
    repoPath: step.repo_path,
    queuedAt: step.queued_at,
    blockingRunId: step.blocked_by_run_id,
    blockingRunNumber,
    blockingWorkflowId,
    blockingTask,
    blockingStepId,
    blockingAgentId,
  };
}

export function enrichStepWithQueueContext(step: StepInfo): EnrichedStepInfo {
  return { ...step, queue: resolveRepoQueueContext(step) };
}

export function enrichStepsWithQueueContext(steps: StepInfo[]): EnrichedStepInfo[] {
  return steps.map(enrichStepWithQueueContext);
}

/**
 * Pure formatter for a one-line CLI annotation describing the queue state.
 * Returns null when the context has no useful information to render.
 *
 * Example:
 *   "queued on /Users/friday/repos/app — blocked by run #42 (implement)"
 */
export function formatQueuedAnnotation(ctx: RepoQueueContext | null): string | null {
  if (!ctx) return null;
  const repoLabel = ctx.repoPath ?? ctx.repoKey;
  const blockerPieces: string[] = [];
  if (ctx.blockingRunNumber != null) {
    blockerPieces.push(`run #${ctx.blockingRunNumber}`);
  } else if (ctx.blockingRunId) {
    blockerPieces.push(`run ${ctx.blockingRunId.slice(0, 8)}`);
  }
  if (ctx.blockingStepId) {
    blockerPieces.push(`step "${ctx.blockingStepId}"`);
  }
  const blocker = blockerPieces.length > 0 ? ` — blocked by ${blockerPieces.join(" ")}` : "";
  return `queued on ${repoLabel}${blocker}`;
}

/**
 * Pure formatter for one CLI status step line. Callers that already computed
 * enrichment can pass the `queue` context explicitly; otherwise they get the
 * standard `[status] step (agent)` line with no annotation.
 */
export function formatStepStatusLine(step: StepInfo, queue: RepoQueueContext | null): string {
  const base = `  [${step.status}] ${step.step_id} (${step.agent_id})`;
  const annotation = formatQueuedAnnotation(queue);
  if (!annotation) return base;
  return `${base}\n      ↳ ${annotation}`;
}
