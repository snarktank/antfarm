import crypto from "node:crypto";
import { getDb } from "../db.js";
import { logger } from "../lib/logger.js";
import { buildWorkPrompt } from "./agent-cron.js";
import { emitEvent } from "./events.js";
import { spawnSession } from "./gateway-api.js";
import {
  DEFAULT_DISPATCH_RETRY_BASE_MS,
  DEFAULT_MAX_DISPATCH_RETRIES,
  getResolvedHandoffConfig,
  getWorkflowAgentModel,
} from "./handoff.js";
import { getMaxRoleTimeoutSeconds } from "./install.js";
import { claimStepById } from "./step-ops.js";

type DispatchStatus =
  | "claimed"
  | "spawned"
  | "retrying"
  | "failed"
  | "duplicate_suppressed"
  | "stale"
  | "cancelled";

export const ACTIVE_DISPATCH_STATUSES = ["claimed", "spawned", "retrying"] as const;

const STALE_DISPATCH_THRESHOLD_MS = (getMaxRoleTimeoutSeconds() + 5 * 60) * 1000;

type DispatchRow = {
  id: string;
  run_id: string;
  step_uuid: string;
  step_id: string;
  agent_id: string;
  dispatch_generation: number;
  dispatch_attempt: number;
  dispatch_status: DispatchStatus;
};

type PendingStep = {
  id: string;
  run_id: string;
  step_id: string;
  agent_id: string;
  dispatch_generation: number;
};

function toIsoNow(): string {
  return new Date().toISOString();
}

function isUniqueViolation(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return message.includes("UNIQUE constraint failed");
}

function releaseClaimToPending(stepUuid: string): void {
  const db = getDb();
  const step = db.prepare(
    "SELECT id, run_id, step_id, type, current_story_id, status FROM steps WHERE id = ?"
  ).get(stepUuid) as { id: string; run_id: string; step_id: string; type: string; current_story_id: string | null; status: string } | undefined;
  if (!step || step.status !== "running") return;

  if (step.type === "loop" && step.current_story_id) {
    db.prepare(
      "UPDATE stories SET status = 'pending', updated_at = datetime('now') WHERE id = ? AND status = 'running'"
    ).run(step.current_story_id);
    db.prepare(
      "UPDATE steps SET status = 'pending', current_story_id = NULL, updated_at = datetime('now') WHERE id = ?"
    ).run(step.id);
  } else {
    db.prepare(
      "UPDATE steps SET status = 'pending', updated_at = datetime('now') WHERE id = ?"
    ).run(step.id);
  }
}

function backoffMs(baseMs: number, attempt: number): number {
  // attempt=1 -> base, attempt=2 -> 2*base
  return baseMs * Math.max(1, 2 ** Math.max(0, attempt - 1));
}

async function spawnForDispatch(dispatch: DispatchRow, workflowId: string): Promise<{ ok: boolean; childSessionKey?: string; error?: string }> {
  const cfg = await getResolvedHandoffConfig(workflowId);
  const model = getWorkflowAgentModel(cfg.workflow, dispatch.agent_id);
  const agentPrefix = `${workflowId}_`;
  const localAgentId = dispatch.agent_id.startsWith(agentPrefix)
    ? dispatch.agent_id.slice(agentPrefix.length)
    : dispatch.agent_id;

  const claimedStep = claimStepById(dispatch.step_uuid, { skipCleanup: true, allowDispatchedClaim: true });
  if (!claimedStep.found || !claimedStep.stepId || !claimedStep.runId || !claimedStep.resolvedInput) {
    return { ok: false, error: "STEP_NOT_CLAIMABLE" };
  }

  const workPrompt = buildWorkPrompt(workflowId, localAgentId);
  const claimedJson = JSON.stringify({
    stepId: claimedStep.stepId,
    runId: claimedStep.runId,
    input: claimedStep.resolvedInput,
  });
  const task = `${workPrompt}\n\nCLAIMED STEP JSON:\n${claimedJson}`;

  const spawnResult = await spawnSession({
    task,
    model,
    label: `${workflowId}:${dispatch.step_id}`,
    // Use the target agent's own main session as the requester, so sessions_spawn
    // does not require cross-agent allowlist entries for agentId.
    sessionKey: `agent:${dispatch.agent_id}:main`,
  });
  if (!spawnResult.ok) {
    return { ok: false, error: spawnResult.error ?? "sessions_spawn failed" };
  }
  return { ok: true, childSessionKey: spawnResult.childSessionKey };
}

function markDispatchStatus(dispatchId: string, status: DispatchStatus, extra?: { error?: string; nextRetryAt?: string | null; childSessionKey?: string | null }): void {
  const db = getDb();
  db.prepare(
    `UPDATE step_dispatches
     SET dispatch_status = ?, last_error = COALESCE(?, last_error),
         next_retry_at = ?, child_session_key = COALESCE(?, child_session_key),
         spawned_at = CASE WHEN ? = 'spawned' THEN ? ELSE spawned_at END,
         updated_at = ?
     WHERE id = ?`
  ).run(
    status,
    extra?.error ?? null,
    extra?.nextRetryAt ?? null,
    extra?.childSessionKey ?? null,
    status,
    toIsoNow(),
    toIsoNow(),
    dispatchId
  );
}

async function handleDispatchFailure(dispatch: DispatchRow, workflowId: string, error: string): Promise<void> {
  const db = getDb();
  const cfg = await getResolvedHandoffConfig(workflowId);
  const maxRetries = cfg.maxDispatchRetries || DEFAULT_MAX_DISPATCH_RETRIES;
  const baseMs = cfg.retryBaseMs || DEFAULT_DISPATCH_RETRY_BASE_MS;
  const attempt = dispatch.dispatch_attempt;

  emitEvent({
    ts: toIsoNow(),
    event: "step.dispatch_failed",
    runId: dispatch.run_id,
    workflowId,
    stepId: dispatch.step_id,
    agentId: dispatch.agent_id,
    detail: error,
  });

  if (attempt < maxRetries) {
    releaseClaimToPending(dispatch.step_uuid);
    const nextAt = new Date(Date.now() + backoffMs(baseMs, attempt)).toISOString();
    markDispatchStatus(dispatch.id, "retrying", { error, nextRetryAt: nextAt });
    emitEvent({
      ts: toIsoNow(),
      event: "step.requeued",
      runId: dispatch.run_id,
      workflowId,
      stepId: dispatch.step_id,
      agentId: dispatch.agent_id,
      detail: `Retry ${attempt}/${maxRetries} scheduled`,
    });
    return;
  }

  db.prepare(
    "UPDATE steps SET status = 'failed', output = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(`Dispatch failed after ${attempt} attempts: ${error}`, dispatch.step_uuid);
  db.prepare(
    "UPDATE runs SET status = 'failed', updated_at = datetime('now') WHERE id = ? AND status = 'running'"
  ).run(dispatch.run_id);
  markDispatchStatus(dispatch.id, "failed", { error });

  emitEvent({
    ts: toIsoNow(),
    event: "step.failed",
    runId: dispatch.run_id,
    workflowId,
    stepId: dispatch.step_id,
    agentId: dispatch.agent_id,
    detail: `Dispatch exhausted retries: ${error}`,
  });
  emitEvent({
    ts: toIsoNow(),
    event: "run.failed",
    runId: dispatch.run_id,
    workflowId,
    detail: `Dispatch exhausted retries for step ${dispatch.step_id}`,
  });
}

async function attemptDispatch(dispatch: DispatchRow, source: string): Promise<void> {
  const db = getDb();
  const run = db.prepare("SELECT workflow_id, status FROM runs WHERE id = ?").get(dispatch.run_id) as { workflow_id: string; status: string } | undefined;
  if (!run || run.status !== "running") {
    markDispatchStatus(dispatch.id, "cancelled", { error: "Run no longer running" });
    return;
  }

  const spawnResult = await spawnForDispatch(dispatch, run.workflow_id);
  if (!spawnResult.ok) {
    if (spawnResult.error === "STEP_NOT_CLAIMABLE") {
      markDispatchStatus(dispatch.id, "duplicate_suppressed", { error: "Step already claimed or advanced" });
      emitEvent({
        ts: toIsoNow(),
        event: "step.duplicate_suppressed",
        runId: dispatch.run_id,
        workflowId: run.workflow_id,
        stepId: dispatch.step_id,
        agentId: dispatch.agent_id,
        detail: "Step no longer claimable",
      });
      return;
    }
    await handleDispatchFailure(dispatch, run.workflow_id, spawnResult.error ?? "Unknown dispatch failure");
    return;
  }

  markDispatchStatus(dispatch.id, "spawned", { childSessionKey: spawnResult.childSessionKey ?? null, nextRetryAt: null });
  emitEvent({
    ts: toIsoNow(),
    event: "step.dispatched",
    runId: dispatch.run_id,
    workflowId: run.workflow_id,
    stepId: dispatch.step_id,
    agentId: dispatch.agent_id,
    childSessionKey: spawnResult.childSessionKey,
    detail: source,
  });
  logger.info("Step dispatched", {
    workflowId: run.workflow_id,
    runId: dispatch.run_id,
    stepId: dispatch.step_id,
  });
}

export async function dispatchNextPendingStep(runId: string, source = "event"): Promise<void> {
  const db = getDb();
  const run = db.prepare("SELECT workflow_id, status FROM runs WHERE id = ?").get(runId) as { workflow_id: string; status: string } | undefined;
  if (!run || run.status !== "running") return;

  const cfg = await getResolvedHandoffConfig(run.workflow_id);
  if (cfg.mode === "polling") return;

  const step = db.prepare(
    "SELECT id, run_id, step_id, agent_id, dispatch_generation FROM steps WHERE run_id = ? AND status = 'pending' ORDER BY step_index ASC LIMIT 1"
  ).get(runId) as PendingStep | undefined;
  if (!step) return;

  const now = toIsoNow();
  const dispatchId = crypto.randomUUID();
  const idempotencyKey = `${step.run_id}:${step.id}:${step.dispatch_generation}`;
  try {
    db.prepare(
      `INSERT INTO step_dispatches (
        id, run_id, step_uuid, step_id, agent_id, dispatch_generation,
        idempotency_key, dispatch_attempt, dispatch_status, claimed_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, 'claimed', ?, ?, ?)`
    ).run(
      dispatchId,
      step.run_id,
      step.id,
      step.step_id,
      step.agent_id,
      step.dispatch_generation,
      idempotencyKey,
      now,
      now,
      now
    );
  } catch (err) {
    if (isUniqueViolation(err)) {
      emitEvent({
        ts: now,
        event: "step.duplicate_suppressed",
        runId: step.run_id,
        workflowId: run.workflow_id,
        stepId: step.step_id,
        agentId: step.agent_id,
        detail: "Dispatch idempotency key already claimed",
      });
      return;
    }
    throw err;
  }

  const dispatch = db.prepare(
    "SELECT id, run_id, step_uuid, step_id, agent_id, dispatch_generation, dispatch_attempt, dispatch_status FROM step_dispatches WHERE id = ?"
  ).get(dispatchId) as DispatchRow | undefined;
  if (!dispatch) return;

  await attemptDispatch(dispatch, source);
}

async function retryDispatch(dispatchId: string): Promise<void> {
  const db = getDb();
  const updated = db.prepare(
    `UPDATE step_dispatches
     SET dispatch_status = 'claimed',
         dispatch_attempt = dispatch_attempt + 1,
         claimed_at = ?, next_retry_at = NULL, updated_at = ?
     WHERE id = ? AND dispatch_status = 'retrying'`
  ).run(toIsoNow(), toIsoNow(), dispatchId);
  if (Number(updated.changes) === 0) return;

  const dispatch = db.prepare(
    "SELECT id, run_id, step_uuid, step_id, agent_id, dispatch_generation, dispatch_attempt, dispatch_status FROM step_dispatches WHERE id = ?"
  ).get(dispatchId) as DispatchRow | undefined;
  if (!dispatch) return;

  await attemptDispatch(dispatch, "retry");
}

export async function reconcileDispatches(limit = 20): Promise<void> {
  const db = getDb();

  const stale = db.prepare(
    `SELECT d.id, d.run_id, d.step_uuid, d.step_id, d.agent_id, d.dispatch_generation, d.dispatch_attempt, d.dispatch_status
       FROM step_dispatches d
       JOIN steps s ON s.id = d.step_uuid
      WHERE d.dispatch_status IN ('claimed', 'retrying')
        AND s.status = 'pending'
        AND (julianday('now') - julianday(d.updated_at)) * 86400000 > ?
      ORDER BY d.updated_at ASC
      LIMIT ?`
  ).all(STALE_DISPATCH_THRESHOLD_MS, limit) as DispatchRow[];

  for (const row of stale) {
    markDispatchStatus(row.id, "stale", { error: "Dispatch claim became stale" });
    emitEvent({
      ts: toIsoNow(),
      event: "step.requeued",
      runId: row.run_id,
      stepId: row.step_id,
      agentId: row.agent_id,
      detail: "Stale dispatch claim released",
    });
    // Re-trigger dispatch attempt for this run now that stale claim is released.
    await dispatchNextPendingStep(row.run_id, "stale_reconcile");
  }

  const due = db.prepare(
    `SELECT id FROM step_dispatches
      WHERE dispatch_status = 'retrying'
        AND next_retry_at IS NOT NULL
        AND next_retry_at <= ?
      ORDER BY next_retry_at ASC
      LIMIT ?`
  ).all(toIsoNow(), limit) as Array<{ id: string }>;

  for (const row of due) {
    await retryDispatch(row.id);
  }
}

export function markRunDispatchesCancelled(runId: string): void {
  const db = getDb();
  db.prepare(
    "UPDATE step_dispatches SET dispatch_status = 'cancelled', updated_at = datetime('now') WHERE run_id = ? AND dispatch_status IN ('claimed', 'spawned', 'retrying')"
  ).run(runId);
}
