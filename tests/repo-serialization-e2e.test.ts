/**
 * End-to-end tests: same-repo coding-step serialization (US-005)
 *
 * Exercises the real step scheduling path — claimStep, completeStep, failStep,
 * stopWorkflow, getWorkflowStatus, dashboard getRunById/getRuns — across
 * multiple concurrent runs, proving that:
 *
 *   1. Two runs targeting the same repo never have more than one running
 *      shared_checkout_exclusive coding step at the same time.
 *   2. The later same-repo run stays pending (queued) until the earlier repo
 *      owner releases the shared checkout, then is promoted and claimed.
 *   3. A run targeting a different repo can still claim and run its coding
 *      step while the first repo is busy.
 *   4. Operator-visible queue metadata (runs' steps[*].queue on both the
 *      /api/runs dashboard path and the CLI status helper) reflects the
 *      contention window end-to-end — not just via unit formatters.
 *
 * Uses the tmp-HOME pattern so the compiled dist/db.js module points at an
 * isolated sqlite file.
 */
import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

type StepOpsModule = typeof import("../dist/installer/step-ops.js");
type StatusModule = typeof import("../dist/installer/status.js");
type DashboardModule = typeof import("../dist/server/dashboard.js");
type DbModule = typeof import("../dist/db.js");

let stepOps: StepOpsModule;
let statusMod: StatusModule;
let dashboardMod: DashboardModule;
let dbMod: DbModule;
let tmpHome: string;
let originalHome: string | undefined;

const REPO_A = "/tmp/antfarm-test-serialization-repo-a";
const REPO_B = "/tmp/antfarm-test-serialization-repo-b";

let runNumberCounter = 1;

function insertRun(
  db: DatabaseSync,
  opts: {
    id?: string;
    runNumber?: number;
    workflowId?: string;
    task?: string;
    status?: string;
    context?: Record<string, string>;
    createdAt?: string;
  } = {},
): string {
  const id = opts.id ?? crypto.randomUUID();
  const t = opts.createdAt ?? new Date().toISOString();
  db.prepare(
    `INSERT INTO runs
       (id, run_number, workflow_id, task, status, context, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    opts.runNumber ?? runNumberCounter++,
    opts.workflowId ?? "feature-dev",
    opts.task ?? "e2e task",
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
    createdAt?: string;
    maxRetries?: number;
  } = {},
): string {
  const id = crypto.randomUUID();
  const t = opts.createdAt ?? new Date().toISOString();
  db.prepare(
    `INSERT INTO steps
       (id, run_id, step_id, agent_id, step_index, input_template, expects,
        status, type, execution_mode, repo_key, repo_path, max_retries,
        created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'single', ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    runId,
    opts.stepId ?? "implement",
    opts.agentId ?? "feature-dev_developer",
    opts.stepIndex ?? 0,
    "",
    "",
    opts.status ?? "pending",
    opts.executionMode ?? "shared_checkout_exclusive",
    opts.repoKey ?? REPO_A,
    opts.repoPath ?? REPO_A,
    opts.maxRetries ?? 2,
    t,
    t,
  );
  return id;
}

function resetTables(db: DatabaseSync): void {
  db.exec("DELETE FROM steps");
  db.exec("DELETE FROM stories");
  db.exec("DELETE FROM runs");
  runNumberCounter = 1;
}

function countRunningCodingStepsForRepo(db: DatabaseSync, repoKey: string): number {
  const row = db.prepare(
    `SELECT COUNT(*) as cnt FROM steps
      WHERE status = 'running'
        AND execution_mode = 'shared_checkout_exclusive'
        AND repo_key = ?`,
  ).get(repoKey) as { cnt: number };
  return row.cnt;
}

function getStepStatus(db: DatabaseSync, stepId: string): string {
  return (db.prepare("SELECT status FROM steps WHERE id = ?").get(stepId) as { status: string }).status;
}

before(async () => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "antfarm-repo-serialization-e2e-"));
  originalHome = process.env.HOME;
  process.env.HOME = tmpHome;
  dbMod = await import("../dist/db.js");
  stepOps = await import("../dist/installer/step-ops.js");
  statusMod = await import("../dist/installer/status.js");
  dashboardMod = await import("../dist/server/dashboard.js");
});

after(() => {
  if (originalHome !== undefined) process.env.HOME = originalHome;
  else delete process.env.HOME;
  try { fs.rmSync(tmpHome, { recursive: true, force: true }); } catch {}
});

beforeEach(() => {
  resetTables(dbMod.getDb());
});

describe("same-repo serialization end-to-end", () => {
  it("two same-repo runs never have more than one running coding step at once; different repo runs independently", () => {
    const db = dbMod.getDb();

    // Two runs for repo A with distinct agent ids so we can prove the guard
    // keys on repo, not on agent/workflow.
    const runA1 = insertRun(db, {
      runNumber: 101,
      workflowId: "feature-dev",
      task: "ship feature to repo A",
      context: { repo: REPO_A, branch: "main" },
      createdAt: "2024-01-01T00:00:00.000Z",
    });
    const stepA1 = insertStep(db, runA1, {
      agentId: "feature-dev_developer",
      createdAt: "2024-01-01T00:00:00.000Z",
    });

    const runA2 = insertRun(db, {
      runNumber: 102,
      workflowId: "bug-fix",
      task: "hotfix on repo A",
      context: { repo: REPO_A, branch: "hotfix" },
      createdAt: "2024-01-02T00:00:00.000Z",
    });
    const stepA2 = insertStep(db, runA2, {
      stepId: "fix",
      agentId: "bug-fix_fixer",
      createdAt: "2024-01-02T00:00:00.000Z",
    });

    // One run on an unrelated repo B with its own agent.
    const runB = insertRun(db, {
      runNumber: 103,
      workflowId: "feature-dev-b",
      task: "ship on repo B",
      context: { repo: REPO_B, branch: "main" },
      createdAt: "2024-01-01T12:00:00.000Z",
    });
    const stepB = insertStep(db, runB, {
      agentId: "feature-dev-b_developer",
      repoKey: REPO_B,
      repoPath: REPO_B,
      createdAt: "2024-01-01T12:00:00.000Z",
    });

    // --- Claim cycle 1: the older same-repo A run wins; B claims independently.
    const claimA1 = stepOps.claimStep("feature-dev_developer");
    assert.equal(claimA1.found, true);
    assert.equal(claimA1.stepId, stepA1);
    assert.equal(getStepStatus(db, stepA1), "running");

    const claimB = stepOps.claimStep("feature-dev-b_developer");
    assert.equal(claimB.found, true, "different repo must claim regardless of repo A contention");
    assert.equal(claimB.stepId, stepB);
    assert.equal(getStepStatus(db, stepB), "running");

    // --- The later same-repo run must NOT claim while A1 holds the checkout.
    const blockedClaim = stepOps.claimStep("bug-fix_fixer");
    assert.equal(blockedClaim.found, false, "same-repo run must stay queued while checkout is busy");
    assert.equal(getStepStatus(db, stepA2), "pending");

    // AC #1: at most one running same-repo coding step at any time.
    assert.equal(
      countRunningCodingStepsForRepo(db, REPO_A),
      1,
      "repo A must never have >1 running shared_checkout_exclusive coding step",
    );

    // AC #3: different repo ran independently.
    assert.equal(countRunningCodingStepsForRepo(db, REPO_B), 1);

    // --- Operator visibility via the real status helper.
    const cliStatus = statusMod.getWorkflowStatus("102");
    assert.equal(cliStatus.status, "ok");
    if (cliStatus.status !== "ok") throw new Error("unreachable");
    const queuedStep = cliStatus.steps.find((s) => s.id === stepA2);
    assert.ok(queuedStep, "queued step must be present in status output");
    assert.ok(queuedStep!.queue, "queued step must carry queue context in status output");
    assert.equal(queuedStep!.queue!.blockingRunId, runA1);
    assert.equal(queuedStep!.queue!.blockingRunNumber, 101);
    assert.equal(queuedStep!.queue!.blockingStepId, "implement");

    // --- Operator visibility via the real dashboard data helpers.
    const dashRun = dashboardMod.getRunById(runA2);
    assert.ok(dashRun, "dashboard getRunById must return the queued run");
    const dashQueued = dashRun!.steps.find((s) => s.id === stepA2);
    assert.ok(dashQueued?.queue, "dashboard step payload must expose queue context");
    assert.equal(dashQueued!.queue!.blockingRunNumber, 101);

    const allRuns = dashboardMod.getRuns();
    const dashA2 = allRuns.find((r) => r.id === runA2);
    assert.ok(dashA2, "listing must include the queued run");
    assert.ok(dashA2!.steps.find((s) => s.id === stepA2)!.queue, "list view also carries queue context");

    // A running step (the repo A owner) must not be labeled "queued".
    const ownerStep = dashRun!.steps.find((_) => false); // sanity init
    void ownerStep;
    const dashOwnerRun = dashboardMod.getRunById(runA1);
    const runningOwner = dashOwnerRun!.steps.find((s) => s.id === stepA1);
    assert.equal(runningOwner!.queue, null, "running owner must not be enriched with queue context");

    // AC #2: releasing the owner promotes the queued same-repo step.
    const result = stepOps.completeStep(stepA1, "STATUS: done");
    assert.equal(result.runCompleted, true, "A1 run has one single step — completing it completes the run");

    // Block metadata on the queued step must be cleared by release.
    const releasedRow = db.prepare(
      "SELECT blocked_by_run_id, blocked_by_step_id, queued_at FROM steps WHERE id = ?",
    ).get(stepA2) as {
      blocked_by_run_id: string | null;
      blocked_by_step_id: string | null;
      queued_at: string | null;
    };
    assert.equal(releasedRow.blocked_by_run_id, null, "release must clear blocked_by_run_id");
    assert.equal(releasedRow.blocked_by_step_id, null, "release must clear blocked_by_step_id");

    // Next claim on the queued agent must now succeed.
    const promotedClaim = stepOps.claimStep("bug-fix_fixer");
    assert.equal(promotedClaim.found, true, "queued same-repo step must be claimable after owner release");
    assert.equal(promotedClaim.stepId, stepA2);
    assert.equal(getStepStatus(db, stepA2), "running");

    // And repo B's step is still running independently — never interrupted.
    assert.equal(getStepStatus(db, stepB), "running");
    assert.equal(countRunningCodingStepsForRepo(db, REPO_A), 1, "still at most one repo A coder");
  });

  it("three same-repo runs serialize in FIFO order across the full lifecycle", () => {
    const db = dbMod.getDb();

    const run1 = insertRun(db, {
      runNumber: 201,
      workflowId: "feature-dev",
      task: "first same-repo",
      context: { repo: REPO_A, branch: "main" },
      createdAt: "2024-02-01T00:00:00.000Z",
    });
    const step1 = insertStep(db, run1, { createdAt: "2024-02-01T00:00:00.000Z" });

    const run2 = insertRun(db, {
      runNumber: 202,
      workflowId: "feature-dev",
      task: "second same-repo",
      context: { repo: REPO_A, branch: "main" },
      createdAt: "2024-02-02T00:00:00.000Z",
    });
    const step2 = insertStep(db, run2, { createdAt: "2024-02-02T00:00:00.000Z" });

    const run3 = insertRun(db, {
      runNumber: 203,
      workflowId: "feature-dev",
      task: "third same-repo",
      context: { repo: REPO_A, branch: "main" },
      createdAt: "2024-02-03T00:00:00.000Z",
    });
    const step3 = insertStep(db, run3, { createdAt: "2024-02-03T00:00:00.000Z" });

    // Oldest wins first even though all three pend for the same agent.
    const first = stepOps.claimStep("feature-dev_developer");
    assert.equal(first.stepId, step1, "FIFO: oldest created_at claims first");
    assert.equal(countRunningCodingStepsForRepo(db, REPO_A), 1);

    // Second attempt is blocked; annotation should point at step1/run1.
    const blocked = stepOps.claimStep("feature-dev_developer");
    assert.equal(blocked.found, false);
    const ann2 = db.prepare(
      "SELECT blocked_by_step_id, blocked_by_run_id FROM steps WHERE id = ?",
    ).get(step2) as { blocked_by_step_id: string | null; blocked_by_run_id: string | null };
    assert.equal(ann2.blocked_by_step_id, step1);
    assert.equal(ann2.blocked_by_run_id, run1);

    // Complete step1 — the next claim must go to step2 (not step3) by FIFO.
    stepOps.completeStep(step1, "STATUS: done");
    const second = stepOps.claimStep("feature-dev_developer");
    assert.equal(second.stepId, step2, "FIFO: second-oldest promoted before newer peer");
    assert.equal(getStepStatus(db, step3), "pending", "third remains queued");
    assert.equal(countRunningCodingStepsForRepo(db, REPO_A), 1);

    // While step2 runs, step3 is annotated as blocked by step2/run2.
    const thirdBlocked = stepOps.claimStep("feature-dev_developer");
    assert.equal(thirdBlocked.found, false);
    const ann3 = db.prepare(
      "SELECT blocked_by_step_id, blocked_by_run_id FROM steps WHERE id = ?",
    ).get(step3) as { blocked_by_step_id: string | null; blocked_by_run_id: string | null };
    assert.equal(ann3.blocked_by_step_id, step2);
    assert.equal(ann3.blocked_by_run_id, run2);

    // Complete step2 — step3 is promoted.
    stepOps.completeStep(step2, "STATUS: done");
    const third = stepOps.claimStep("feature-dev_developer");
    assert.equal(third.stepId, step3);
    assert.equal(countRunningCodingStepsForRepo(db, REPO_A), 1);

    // Final completion — all three runs should be terminal and repo A free.
    stepOps.completeStep(step3, "STATUS: done");
    assert.equal(countRunningCodingStepsForRepo(db, REPO_A), 0);
    const finalRuns = dashboardMod.getRuns();
    for (const r of finalRuns) {
      assert.equal(r.status, "completed", `${r.id} should be completed`);
    }
  });

  it("cancelling an in-flight repo owner releases the queue and a later same-repo run can claim", async () => {
    const db = dbMod.getDb();

    const runBusy = insertRun(db, {
      runNumber: 301,
      workflowId: "feature-dev",
      task: "busy owner",
      context: { repo: REPO_A, branch: "main" },
      createdAt: "2024-03-01T00:00:00.000Z",
    });
    const busyStep = insertStep(db, runBusy, { createdAt: "2024-03-01T00:00:00.000Z" });

    const runQueued = insertRun(db, {
      runNumber: 302,
      workflowId: "bug-fix",
      task: "waiting on repo A",
      context: { repo: REPO_A, branch: "hotfix" },
      createdAt: "2024-03-02T00:00:00.000Z",
    });
    const queuedStep = insertStep(db, runQueued, {
      stepId: "fix",
      agentId: "bug-fix_fixer",
      createdAt: "2024-03-02T00:00:00.000Z",
    });

    // Claim owner, then queued attempt annotates block metadata.
    stepOps.claimStep("feature-dev_developer");
    stepOps.claimStep("bug-fix_fixer");

    const annotated = db.prepare(
      "SELECT blocked_by_run_id FROM steps WHERE id = ?",
    ).get(queuedStep) as { blocked_by_run_id: string | null };
    assert.equal(annotated.blocked_by_run_id, runBusy, "queued step must carry block pointer before cancel");

    // Cancel the in-flight run through the public API — this is the surface
    // operators hit from the CLI / dashboard.
    const stopRes = await statusMod.stopWorkflow(runBusy);
    assert.equal(stopRes.status, "ok");

    // Cancellation clears peer block metadata and the queued step becomes claimable.
    const afterCancel = db.prepare(
      "SELECT blocked_by_run_id FROM steps WHERE id = ?",
    ).get(queuedStep) as { blocked_by_run_id: string | null };
    assert.equal(afterCancel.blocked_by_run_id, null, "cancel must clear stale block metadata");

    const promoted = stepOps.claimStep("bug-fix_fixer");
    assert.equal(promoted.found, true, "queued same-repo run must be claimable after cancel");
    assert.equal(promoted.stepId, queuedStep);
    assert.equal(countRunningCodingStepsForRepo(db, REPO_A), 1);
  });

  it("failStep releases the lease and promotes the next same-repo run end-to-end", async () => {
    const db = dbMod.getDb();

    const runOwner = insertRun(db, {
      runNumber: 401,
      workflowId: "feature-dev",
      task: "will fail",
      context: { repo: REPO_A, branch: "main" },
      createdAt: "2024-04-01T00:00:00.000Z",
    });
    // max_retries = 0 so a single failStep exhausts the run.
    const ownerStep = insertStep(db, runOwner, {
      createdAt: "2024-04-01T00:00:00.000Z",
      maxRetries: 0,
    });

    const runNext = insertRun(db, {
      runNumber: 402,
      workflowId: "feature-dev",
      task: "next same-repo after failure",
      context: { repo: REPO_A, branch: "main" },
      createdAt: "2024-04-02T00:00:00.000Z",
    });
    const nextStep = insertStep(db, runNext, { createdAt: "2024-04-02T00:00:00.000Z" });

    // Owner claims; next is blocked and annotated.
    const ownerClaim = stepOps.claimStep("feature-dev_developer");
    assert.equal(ownerClaim.stepId, ownerStep);
    const blocked = stepOps.claimStep("feature-dev_developer");
    assert.equal(blocked.found, false);

    // Different-repo run seeded AFTER the contention starts must still claim.
    const runSideCar = insertRun(db, {
      runNumber: 403,
      workflowId: "feature-dev-b",
      task: "unrelated repo",
      context: { repo: REPO_B, branch: "main" },
      createdAt: "2024-04-01T06:00:00.000Z",
    });
    const sideStep = insertStep(db, runSideCar, {
      agentId: "feature-dev-b_developer",
      repoKey: REPO_B,
      repoPath: REPO_B,
      createdAt: "2024-04-01T06:00:00.000Z",
    });
    const sideClaim = stepOps.claimStep("feature-dev-b_developer");
    assert.equal(sideClaim.found, true, "different repo unaffected by repo A contention");
    assert.equal(sideClaim.stepId, sideStep);

    // Fail the owner — that releases the repo lease.
    const outcome = await stepOps.failStep(ownerStep, "boom");
    assert.equal(outcome.runFailed, true);

    // The next run's step is no longer blocked and can claim.
    const promoted = stepOps.claimStep("feature-dev_developer");
    assert.equal(promoted.found, true);
    assert.equal(promoted.stepId, nextStep);
    assert.equal(countRunningCodingStepsForRepo(db, REPO_A), 1);
    assert.equal(countRunningCodingStepsForRepo(db, REPO_B), 1);
  });
});
