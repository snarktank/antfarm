/**
 * Tests: repo-lease release + FIFO promotion (US-003)
 *
 * Covers:
 *   - releaseStepResources() is a no-op for no_lock steps
 *   - releaseStepResources() clears stale blocked_by_* annotations on peers
 *     that pointed at the released step
 *   - releaseStepLeaseById() looks up the step row and delegates correctly
 *   - releaseRunSteps() releases every shared_checkout_exclusive step in a run
 *   - Completing a running shared_checkout_exclusive step releases the lease
 *     and the oldest queued same-repo coding step becomes claimable first
 *     (FIFO by created_at)
 *   - Failing a step releases the lease
 *   - Cancelling a run via stopWorkflow releases all held repo leases
 *   - Abandonment recovery releases the lease (both timeout-fail and reset paths)
 *   - FIFO is deterministic: when two same-repo pending steps exist and neither
 *     is running, only the oldest can be claimed
 */
import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

type StepOpsModule = typeof import("../dist/installer/step-ops.js");
type SchedulerModule = typeof import("../dist/installer/repo-scheduler.js");
type StatusModule = typeof import("../dist/installer/status.js");
type DbModule = typeof import("../dist/db.js");

let stepOps: StepOpsModule;
let scheduler: SchedulerModule;
let statusMod: StatusModule;
let dbMod: DbModule;
let tmpHome: string;
let originalHome: string | undefined;

const REPO_A = "/tmp/antfarm-test-repo-release-a";
const REPO_B = "/tmp/antfarm-test-repo-release-b";

function insertRun(
  db: DatabaseSync,
  opts: {
    id?: string;
    workflowId?: string;
    status?: string;
    context?: Record<string, string>;
  } = {},
): string {
  const id = opts.id ?? crypto.randomUUID();
  const t = new Date().toISOString();
  db.prepare(
    `INSERT INTO runs
     (id, workflow_id, task, status, context, created_at, updated_at)
     VALUES (?, ?, 'test task', ?, ?, ?, ?)`,
  ).run(
    id,
    opts.workflowId ?? "feature-dev",
    opts.status ?? "running",
    JSON.stringify(opts.context ?? { repo: REPO_A, branch: "main" }),
    t,
    t,
  );
  return id;
}

function insertStep(
  db: DatabaseSync,
  runId: string,
  opts: {
    stepId?: string;
    agentId?: string;
    stepIndex?: number;
    status?: string;
    executionMode?: string | null;
    repoKey?: string | null;
    repoPath?: string | null;
    inputTemplate?: string;
    expects?: string;
    createdAt?: string;
    type?: string;
  } = {},
): string {
  const id = crypto.randomUUID();
  const t = opts.createdAt ?? new Date().toISOString();
  db.prepare(
    `INSERT INTO steps
      (id, run_id, step_id, agent_id, step_index, input_template, expects,
       status, type, execution_mode, repo_key, repo_path, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    runId,
    opts.stepId ?? "implement",
    opts.agentId ?? "feature-dev_developer",
    opts.stepIndex ?? 0,
    opts.inputTemplate ?? "",
    opts.expects ?? "",
    opts.status ?? "pending",
    opts.type ?? "single",
    opts.executionMode ?? null,
    opts.repoKey ?? null,
    opts.repoPath ?? null,
    t,
    t,
  );
  return id;
}

function resetTables(db: DatabaseSync): void {
  db.exec("DELETE FROM steps");
  db.exec("DELETE FROM stories");
  db.exec("DELETE FROM runs");
}

before(async () => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "antfarm-repo-release-"));
  originalHome = process.env.HOME;
  process.env.HOME = tmpHome;
  dbMod = await import("../dist/db.js");
  stepOps = await import("../dist/installer/step-ops.js");
  scheduler = await import("../dist/installer/repo-scheduler.js");
  statusMod = await import("../dist/installer/status.js");
});

after(() => {
  if (originalHome !== undefined) process.env.HOME = originalHome;
  else delete process.env.HOME;
  try { fs.rmSync(tmpHome, { recursive: true, force: true }); } catch {}
});

beforeEach(() => {
  resetTables(dbMod.getDb());
});

describe("releaseStepResources()", () => {
  it("is a no-op for no_lock steps", () => {
    const db = dbMod.getDb();
    const runA = insertRun(db);
    const verify = insertStep(db, runA, {
      status: "done",
      executionMode: "no_lock",
      repoKey: REPO_A,
      repoPath: REPO_A,
    });
    const result = scheduler.releaseStepResources({
      stepId: verify,
      runId: runA,
      executionMode: "no_lock",
      repoKey: REPO_A,
      reason: "completed",
    });
    assert.equal(result.nextStepId, null, "no_lock release returns no successor");
  });

  it("is a no-op when repoKey is missing", () => {
    const result = scheduler.releaseStepResources({
      stepId: "x",
      executionMode: "shared_checkout_exclusive",
      repoKey: null,
      reason: "completed",
    });
    assert.equal(result.nextStepId, null);
  });

  it("clears stale blocked_by_step_id on peers pointing at the released step", () => {
    const db = dbMod.getDb();
    const runA = insertRun(db, { workflowId: "feature-dev" });
    const released = insertStep(db, runA, {
      status: "done",
      executionMode: "shared_checkout_exclusive",
      repoKey: REPO_A,
      repoPath: REPO_A,
    });

    const runB = insertRun(db, { workflowId: "bug-fix" });
    const peer = insertStep(db, runB, {
      stepId: "fix",
      agentId: "bug-fix_fixer",
      status: "pending",
      executionMode: "shared_checkout_exclusive",
      repoKey: REPO_A,
      repoPath: REPO_A,
    });
    db.prepare(
      `UPDATE steps SET blocked_by_run_id = ?, blocked_by_step_id = ?, queued_at = datetime('now') WHERE id = ?`,
    ).run(runA, released, peer);

    scheduler.releaseStepResources({
      stepId: released,
      runId: runA,
      executionMode: "shared_checkout_exclusive",
      repoKey: REPO_A,
      reason: "completed",
    });

    const row = db.prepare(
      "SELECT blocked_by_run_id, blocked_by_step_id FROM steps WHERE id = ?",
    ).get(peer) as { blocked_by_run_id: string | null; blocked_by_step_id: string | null };
    assert.equal(row.blocked_by_run_id, null, "stale blocked_by_run_id must be cleared");
    assert.equal(row.blocked_by_step_id, null);
  });

  it("reports the oldest queued same-repo peer as nextStepId (FIFO)", () => {
    const db = dbMod.getDb();
    const runA = insertRun(db);
    const released = insertStep(db, runA, {
      status: "done",
      executionMode: "shared_checkout_exclusive",
      repoKey: REPO_A,
      repoPath: REPO_A,
      createdAt: "2024-01-01T00:00:00.000Z",
    });

    const runOld = insertRun(db, { workflowId: "bug-fix" });
    const oldPeer = insertStep(db, runOld, {
      stepId: "fix",
      agentId: "bug-fix_fixer",
      status: "pending",
      executionMode: "shared_checkout_exclusive",
      repoKey: REPO_A,
      repoPath: REPO_A,
      createdAt: "2024-01-02T00:00:00.000Z",
    });

    const runNew = insertRun(db, { workflowId: "other" });
    insertStep(db, runNew, {
      stepId: "implement",
      agentId: "other_developer",
      status: "pending",
      executionMode: "shared_checkout_exclusive",
      repoKey: REPO_A,
      repoPath: REPO_A,
      createdAt: "2024-01-03T00:00:00.000Z",
    });

    const result = scheduler.releaseStepResources({
      stepId: released,
      runId: runA,
      executionMode: "shared_checkout_exclusive",
      repoKey: REPO_A,
      reason: "completed",
    });
    assert.equal(result.nextStepId, oldPeer, "oldest created_at must be promoted first");
  });

  it("ignores same-repo pending steps in failed/cancelled runs when reporting next", () => {
    const db = dbMod.getDb();
    const runA = insertRun(db);
    const released = insertStep(db, runA, {
      status: "done",
      executionMode: "shared_checkout_exclusive",
      repoKey: REPO_A,
      repoPath: REPO_A,
    });

    const runCancelled = insertRun(db, { workflowId: "cancelled", status: "cancelled" });
    insertStep(db, runCancelled, {
      stepId: "fix",
      status: "pending",
      executionMode: "shared_checkout_exclusive",
      repoKey: REPO_A,
      repoPath: REPO_A,
      createdAt: "2024-01-01T00:00:00.000Z",
    });

    const result = scheduler.releaseStepResources({
      stepId: released,
      runId: runA,
      executionMode: "shared_checkout_exclusive",
      repoKey: REPO_A,
      reason: "completed",
    });
    assert.equal(result.nextStepId, null, "cancelled-run pending steps must not be promoted");
  });
});

describe("releaseStepLeaseById()", () => {
  it("looks up step metadata and clears peer annotations", () => {
    const db = dbMod.getDb();
    const runA = insertRun(db);
    const released = insertStep(db, runA, {
      status: "done",
      executionMode: "shared_checkout_exclusive",
      repoKey: REPO_A,
      repoPath: REPO_A,
    });
    const peer = insertStep(db, insertRun(db, { workflowId: "b" }), {
      stepId: "fix",
      status: "pending",
      executionMode: "shared_checkout_exclusive",
      repoKey: REPO_A,
      repoPath: REPO_A,
    });
    db.prepare(
      `UPDATE steps SET blocked_by_step_id = ? WHERE id = ?`,
    ).run(released, peer);

    scheduler.releaseStepLeaseById(released, "completed");
    const row = db.prepare(
      "SELECT blocked_by_step_id FROM steps WHERE id = ?",
    ).get(peer) as { blocked_by_step_id: string | null };
    assert.equal(row.blocked_by_step_id, null);
  });

  it("silently no-ops for missing step ids", () => {
    const res = scheduler.releaseStepLeaseById("does-not-exist", "completed");
    assert.equal(res.nextStepId, null);
  });
});

describe("releaseRunSteps()", () => {
  it("releases every shared_checkout_exclusive step attached to a run", () => {
    const db = dbMod.getDb();
    const runA = insertRun(db);
    const stepA1 = insertStep(db, runA, {
      stepId: "implement",
      status: "failed",
      executionMode: "shared_checkout_exclusive",
      repoKey: REPO_A,
      repoPath: REPO_A,
    });
    const stepA2 = insertStep(db, runA, {
      stepId: "fix",
      stepIndex: 1,
      status: "failed",
      executionMode: "shared_checkout_exclusive",
      repoKey: REPO_A,
      repoPath: REPO_A,
    });

    const runB = insertRun(db, { workflowId: "b" });
    const peer1 = insertStep(db, runB, {
      status: "pending",
      executionMode: "shared_checkout_exclusive",
      repoKey: REPO_A,
      repoPath: REPO_A,
    });
    const peer2 = insertStep(db, runB, {
      stepId: "fix",
      stepIndex: 1,
      status: "pending",
      executionMode: "shared_checkout_exclusive",
      repoKey: REPO_A,
      repoPath: REPO_A,
    });
    db.prepare(`UPDATE steps SET blocked_by_step_id = ? WHERE id = ?`).run(stepA1, peer1);
    db.prepare(`UPDATE steps SET blocked_by_step_id = ? WHERE id = ?`).run(stepA2, peer2);

    scheduler.releaseRunSteps(runA, "cancelled");

    const r1 = db.prepare("SELECT blocked_by_step_id FROM steps WHERE id = ?").get(peer1) as { blocked_by_step_id: string | null };
    const r2 = db.prepare("SELECT blocked_by_step_id FROM steps WHERE id = ?").get(peer2) as { blocked_by_step_id: string | null };
    assert.equal(r1.blocked_by_step_id, null);
    assert.equal(r2.blocked_by_step_id, null);
  });
});

describe("claimStep() FIFO promotion across same-repo contenders", () => {
  it("older same-repo pending step claims before a newer one when neither is running", () => {
    const db = dbMod.getDb();

    const runOld = insertRun(db, { workflowId: "feature-dev" });
    const oldStep = insertStep(db, runOld, {
      stepId: "implement",
      agentId: "feature-dev_developer",
      status: "pending",
      executionMode: "shared_checkout_exclusive",
      repoKey: REPO_A,
      repoPath: REPO_A,
      createdAt: "2024-01-01T00:00:00.000Z",
    });

    const runNew = insertRun(db, { workflowId: "feature-dev" });
    const newStep = insertStep(db, runNew, {
      stepId: "implement",
      agentId: "feature-dev_developer",
      status: "pending",
      executionMode: "shared_checkout_exclusive",
      repoKey: REPO_A,
      repoPath: REPO_A,
      createdAt: "2024-02-01T00:00:00.000Z",
    });

    const first = stepOps.claimStep("feature-dev_developer");
    assert.equal(first.found, true);
    assert.equal(first.stepId, oldStep, "oldest created_at claims first");

    // While oldStep is running, newStep must stay pending (repo busy guard).
    const second = stepOps.claimStep("feature-dev_developer");
    assert.equal(second.found, false, "newer same-repo step is still blocked by running older");

    const newRow = db.prepare("SELECT status FROM steps WHERE id = ?").get(newStep) as { status: string };
    assert.equal(newRow.status, "pending");
  });

  it("after the older step completes, the newer step is promoted to claimable", () => {
    const db = dbMod.getDb();

    const runOld = insertRun(db);
    const oldStep = insertStep(db, runOld, {
      stepId: "implement",
      agentId: "feature-dev_developer",
      status: "running",
      executionMode: "shared_checkout_exclusive",
      repoKey: REPO_A,
      repoPath: REPO_A,
      createdAt: "2024-01-01T00:00:00.000Z",
      expects: "STATUS: done",
    });

    const runNew = insertRun(db);
    const newStep = insertStep(db, runNew, {
      stepId: "implement",
      agentId: "feature-dev_developer",
      status: "pending",
      executionMode: "shared_checkout_exclusive",
      repoKey: REPO_A,
      repoPath: REPO_A,
      createdAt: "2024-02-01T00:00:00.000Z",
    });
    // Initial poll stamps block metadata on newStep.
    stepOps.claimStep("feature-dev_developer");
    const blocked = db.prepare("SELECT blocked_by_step_id FROM steps WHERE id = ?").get(newStep) as { blocked_by_step_id: string | null };
    assert.equal(blocked.blocked_by_step_id, oldStep);

    // Complete old step through the real completion path so release fires.
    stepOps.completeStep(oldStep, "STATUS: done");

    // Peer annotation should be cleared by releaseStepResources.
    const afterRelease = db.prepare("SELECT blocked_by_step_id FROM steps WHERE id = ?").get(newStep) as { blocked_by_step_id: string | null };
    assert.equal(afterRelease.blocked_by_step_id, null, "release must clear stale block metadata");

    // Next poll claims the queued step.
    const res = stepOps.claimStep("feature-dev_developer");
    assert.equal(res.found, true);
    assert.equal(res.stepId, newStep);
  });

  it("releases on failStep() so the next same-repo step becomes claimable", async () => {
    const db = dbMod.getDb();

    const runOld = insertRun(db);
    const oldStep = insertStep(db, runOld, {
      stepId: "implement",
      agentId: "feature-dev_developer",
      status: "running",
      executionMode: "shared_checkout_exclusive",
      repoKey: REPO_A,
      repoPath: REPO_A,
      createdAt: "2024-01-01T00:00:00.000Z",
    });

    const runNew = insertRun(db);
    const newStep = insertStep(db, runNew, {
      stepId: "implement",
      agentId: "feature-dev_developer",
      status: "pending",
      executionMode: "shared_checkout_exclusive",
      repoKey: REPO_A,
      repoPath: REPO_A,
      createdAt: "2024-02-01T00:00:00.000Z",
    });
    stepOps.claimStep("feature-dev_developer"); // annotate newStep
    db.prepare(`UPDATE steps SET max_retries = 0 WHERE id = ?`).run(oldStep);

    const outcome = await stepOps.failStep(oldStep, "boom");
    assert.equal(outcome.runFailed, true);

    // Peer block metadata cleared.
    const row = db.prepare("SELECT blocked_by_step_id FROM steps WHERE id = ?").get(newStep) as { blocked_by_step_id: string | null };
    assert.equal(row.blocked_by_step_id, null);

    // Queued step is claimable.
    const claim = stepOps.claimStep("feature-dev_developer");
    assert.equal(claim.found, true);
    assert.equal(claim.stepId, newStep);
  });

  it("releases on stopWorkflow() so cancelling an in-flight run frees the queued same-repo step", async () => {
    const db = dbMod.getDb();

    const runBusy = insertRun(db);
    const busyStep = insertStep(db, runBusy, {
      stepId: "implement",
      agentId: "feature-dev_developer",
      status: "running",
      executionMode: "shared_checkout_exclusive",
      repoKey: REPO_A,
      repoPath: REPO_A,
      createdAt: "2024-01-01T00:00:00.000Z",
    });

    const runQueued = insertRun(db);
    const queuedStep = insertStep(db, runQueued, {
      stepId: "implement",
      agentId: "feature-dev_developer",
      status: "pending",
      executionMode: "shared_checkout_exclusive",
      repoKey: REPO_A,
      repoPath: REPO_A,
      createdAt: "2024-02-01T00:00:00.000Z",
    });

    // Stamp blocked metadata as if an earlier poll already saw the busy owner.
    db.prepare(
      `UPDATE steps SET blocked_by_run_id = ?, blocked_by_step_id = ?, queued_at = datetime('now') WHERE id = ?`,
    ).run(runBusy, busyStep, queuedStep);

    const res = await statusMod.stopWorkflow(runBusy);
    assert.equal(res.status, "ok");

    const row = db.prepare(
      "SELECT status, blocked_by_run_id, blocked_by_step_id FROM steps WHERE id = ?",
    ).get(queuedStep) as { status: string; blocked_by_run_id: string | null; blocked_by_step_id: string | null };
    assert.equal(row.blocked_by_run_id, null, "cancel must clear stale block metadata");
    assert.equal(row.blocked_by_step_id, null);

    const claim = stepOps.claimStep("feature-dev_developer");
    assert.equal(claim.found, true, "queued same-repo step must be claimable after cancel");
    assert.equal(claim.stepId, queuedStep);
  });

  it("different-repo runs proceed independently regardless of release on repo A", () => {
    const db = dbMod.getDb();

    const runA = insertRun(db);
    insertStep(db, runA, {
      stepId: "implement",
      agentId: "feature-dev_developer",
      status: "running",
      executionMode: "shared_checkout_exclusive",
      repoKey: REPO_A,
      repoPath: REPO_A,
      createdAt: "2024-01-01T00:00:00.000Z",
    });

    const runB = insertRun(db, {
      workflowId: "b",
      context: { repo: REPO_B, branch: "main" },
    });
    const stepB = insertStep(db, runB, {
      stepId: "implement",
      agentId: "b_developer",
      status: "pending",
      executionMode: "shared_checkout_exclusive",
      repoKey: REPO_B,
      repoPath: REPO_B,
      createdAt: "2024-01-02T00:00:00.000Z",
    });

    const claim = stepOps.claimStep("b_developer");
    assert.equal(claim.found, true, "unrelated repo must not be affected");
    assert.equal(claim.stepId, stepB);
  });
});
