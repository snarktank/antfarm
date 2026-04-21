/**
 * Tests: claimStep() repo-isolation guard
 *
 * Covers US-002 (Block same-repo coding-step claims while a shared checkout
 * is busy):
 *   - When a shared_checkout_exclusive step is already running for a repo
 *     key, claimStep() refuses to claim another same-repo coding step —
 *     regardless of which run / workflow the pending step belongs to.
 *   - The blocked same-repo step stays pending and gets `blocked_by_run_id`
 *     / `blocked_by_step_id` / `queued_at` metadata pointing at the busy
 *     owner so operators can see why it's queued.
 *   - A pending shared_checkout_exclusive step for a *different* repo key
 *     is still claimable while the first repo is busy.
 *   - Once the busy step finishes, the queued step becomes claimable and
 *     its block metadata is cleared on the winning transition.
 *
 * Mirrors the tmp-HOME pattern used in run-pause-resume.test.ts so the
 * compiled dist/db.js module points at an isolated sqlite file.
 */
import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

type StepOpsModule = typeof import("../dist/installer/step-ops.js");
type DbModule = typeof import("../dist/db.js");

let stepOps: StepOpsModule;
let dbMod: DbModule;
let tmpHome: string;
let originalHome: string | undefined;

const REPO_A = "/tmp/antfarm-test-repo-a";
const REPO_B = "/tmp/antfarm-test-repo-b";

function nowIso(offsetMs = 0): string {
  return new Date(Date.now() + offsetMs).toISOString();
}

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
  const t = nowIso();
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
  } = {},
): string {
  const id = crypto.randomUUID();
  const t = nowIso();
  db.prepare(
    `INSERT INTO steps
      (id, run_id, step_id, agent_id, step_index, input_template, expects,
       status, type, execution_mode, repo_key, repo_path, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, '', ?, 'single', ?, ?, ?, ?, ?)`,
  ).run(
    id,
    runId,
    opts.stepId ?? "implement",
    opts.agentId ?? "feature-dev_developer",
    opts.stepIndex ?? 0,
    opts.inputTemplate ?? "",
    opts.status ?? "pending",
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
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "antfarm-repo-isolation-claim-"));
  originalHome = process.env.HOME;
  process.env.HOME = tmpHome;
  dbMod = await import("../dist/db.js");
  stepOps = await import("../dist/installer/step-ops.js");
});

after(() => {
  if (originalHome !== undefined) process.env.HOME = originalHome;
  else delete process.env.HOME;
  try { fs.rmSync(tmpHome, { recursive: true, force: true }); } catch {}
});

beforeEach(() => {
  resetTables(dbMod.getDb());
});

describe("claimStep() same-repo coding guard", () => {
  it("refuses to claim a same-repo coding step while another is running — across workflows", () => {
    const db = dbMod.getDb();

    // Run A is actively running a coding step against REPO_A. Its agent_id
    // differs from Run B's to prove the guard keys on repo, not workflow id.
    const runA = insertRun(db, { workflowId: "feature-dev" });
    insertStep(db, runA, {
      stepId: "implement",
      agentId: "feature-dev_developer",
      status: "running",
      executionMode: "shared_checkout_exclusive",
      repoKey: REPO_A,
      repoPath: REPO_A,
    });

    // Run B (different workflow id) has a pending coding step for the same repo.
    const runB = insertRun(db, { workflowId: "bug-fix" });
    const pendingStepB = insertStep(db, runB, {
      stepId: "fix",
      agentId: "bug-fix_fixer",
      status: "pending",
      executionMode: "shared_checkout_exclusive",
      repoKey: REPO_A,
      repoPath: REPO_A,
    });

    const result = stepOps.claimStep("bug-fix_fixer");

    assert.equal(result.found, false, "claimStep must not hand out a same-repo step");

    const row = db.prepare(
      "SELECT status FROM steps WHERE id = ?"
    ).get(pendingStepB) as { status: string };
    assert.equal(row.status, "pending", "pending step must remain pending, not running");
  });

  it("records blocked_by metadata referencing the busy repo owner", () => {
    const db = dbMod.getDb();

    const runA = insertRun(db, { workflowId: "feature-dev" });
    const runningStepA = insertStep(db, runA, {
      stepId: "implement",
      agentId: "feature-dev_developer",
      status: "running",
      executionMode: "shared_checkout_exclusive",
      repoKey: REPO_A,
      repoPath: REPO_A,
    });

    const runB = insertRun(db, { workflowId: "bug-fix" });
    const pendingStepB = insertStep(db, runB, {
      stepId: "fix",
      agentId: "bug-fix_fixer",
      status: "pending",
      executionMode: "shared_checkout_exclusive",
      repoKey: REPO_A,
      repoPath: REPO_A,
    });

    const result = stepOps.claimStep("bug-fix_fixer");
    assert.equal(result.found, false);

    const row = db.prepare(
      `SELECT status, blocked_by_run_id, blocked_by_step_id, queued_at
         FROM steps WHERE id = ?`
    ).get(pendingStepB) as {
      status: string;
      blocked_by_run_id: string | null;
      blocked_by_step_id: string | null;
      queued_at: string | null;
    };

    assert.equal(row.status, "pending");
    assert.equal(row.blocked_by_run_id, runA, "blocked_by_run_id must point at the busy run");
    assert.equal(row.blocked_by_step_id, runningStepA, "blocked_by_step_id must point at the running step");
    assert.ok(row.queued_at, "queued_at must be stamped so operators see when it was first blocked");
  });

  it("same-repo coding step stays blocked even within the same workflow across runs", () => {
    const db = dbMod.getDb();

    const runA = insertRun(db, { workflowId: "feature-dev" });
    insertStep(db, runA, {
      stepId: "implement",
      agentId: "feature-dev_developer",
      status: "running",
      executionMode: "shared_checkout_exclusive",
      repoKey: REPO_A,
      repoPath: REPO_A,
    });

    const runB = insertRun(db, { workflowId: "feature-dev" });
    const pendingStepB = insertStep(db, runB, {
      stepId: "implement",
      agentId: "feature-dev_developer",
      status: "pending",
      executionMode: "shared_checkout_exclusive",
      repoKey: REPO_A,
      repoPath: REPO_A,
    });

    const result = stepOps.claimStep("feature-dev_developer");
    assert.equal(result.found, false, "Same agent, same workflow, same repo — must stay queued");

    const row = db.prepare(
      "SELECT status FROM steps WHERE id = ?"
    ).get(pendingStepB) as { status: string };
    assert.equal(row.status, "pending");
  });

  it("claims a pending shared_checkout_exclusive step for a DIFFERENT repo while first repo is busy", () => {
    const db = dbMod.getDb();

    // Busy repo A
    const runA = insertRun(db, { workflowId: "feature-dev" });
    insertStep(db, runA, {
      stepId: "implement",
      agentId: "feature-dev_developer",
      status: "running",
      executionMode: "shared_checkout_exclusive",
      repoKey: REPO_A,
      repoPath: REPO_A,
    });

    // Unrelated repo B, different workflow
    const runB = insertRun(db, {
      workflowId: "other-feature",
      context: { repo: REPO_B, branch: "main" },
    });
    const pendingStepB = insertStep(db, runB, {
      stepId: "implement",
      agentId: "other-feature_developer",
      status: "pending",
      executionMode: "shared_checkout_exclusive",
      repoKey: REPO_B,
      repoPath: REPO_B,
      inputTemplate: "Implement in {{repo}} on {{branch}}",
    });

    const result = stepOps.claimStep("other-feature_developer");

    assert.equal(result.found, true, "Different repo must still be claimable");
    assert.equal(result.stepId, pendingStepB);

    const row = db.prepare(
      "SELECT status FROM steps WHERE id = ?"
    ).get(pendingStepB) as { status: string };
    assert.equal(row.status, "running", "Unrelated repo's step should transition to running");
  });

  it("does not block a non-coding step (no_lock) even when it shares the repo_key", () => {
    const db = dbMod.getDb();

    const runA = insertRun(db, { workflowId: "feature-dev" });
    insertStep(db, runA, {
      stepId: "implement",
      agentId: "feature-dev_developer",
      status: "running",
      executionMode: "shared_checkout_exclusive",
      repoKey: REPO_A,
      repoPath: REPO_A,
    });

    // A pending verify step on the same repo — verify is no_lock and should
    // be allowed to proceed even while coding is active. (In practice the
    // pipeline ordering inside the same run stops this, but across runs /
    // agents it must not be blocked by the repo lock.)
    const runB = insertRun(db, { workflowId: "feature-dev" });
    const pendingStepB = insertStep(db, runB, {
      stepId: "verify",
      agentId: "feature-dev_verifier",
      status: "pending",
      executionMode: "no_lock",
      repoKey: REPO_A,
      repoPath: REPO_A,
    });

    const result = stepOps.claimStep("feature-dev_verifier");
    assert.equal(result.found, true, "no_lock steps must not be affected by repo lock");
    assert.equal(result.stepId, pendingStepB);
  });

  it("claims the queued step once the busy owner is no longer running and clears block metadata", () => {
    const db = dbMod.getDb();

    const runA = insertRun(db, { workflowId: "feature-dev" });
    const runningStepA = insertStep(db, runA, {
      stepId: "implement",
      agentId: "feature-dev_developer",
      status: "running",
      executionMode: "shared_checkout_exclusive",
      repoKey: REPO_A,
      repoPath: REPO_A,
    });

    const runB = insertRun(db, { workflowId: "bug-fix" });
    const pendingStepB = insertStep(db, runB, {
      stepId: "fix",
      agentId: "bug-fix_fixer",
      status: "pending",
      executionMode: "shared_checkout_exclusive",
      repoKey: REPO_A,
      repoPath: REPO_A,
    });

    // First poll: blocked and annotated.
    let result = stepOps.claimStep("bug-fix_fixer");
    assert.equal(result.found, false);

    const blocked = db.prepare(
      "SELECT blocked_by_run_id, queued_at FROM steps WHERE id = ?"
    ).get(pendingStepB) as { blocked_by_run_id: string | null; queued_at: string | null };
    assert.equal(blocked.blocked_by_run_id, runA);
    assert.ok(blocked.queued_at);

    // Finish the owner step.
    db.prepare(
      "UPDATE steps SET status = 'done', updated_at = datetime('now') WHERE id = ?"
    ).run(runningStepA);

    // Second poll: should now claim.
    result = stepOps.claimStep("bug-fix_fixer");
    assert.equal(result.found, true, "Queued step must claim once owner is no longer running");
    assert.equal(result.stepId, pendingStepB);

    const cleared = db.prepare(
      `SELECT status, blocked_by_run_id, blocked_by_step_id, queued_at
         FROM steps WHERE id = ?`
    ).get(pendingStepB) as {
      status: string;
      blocked_by_run_id: string | null;
      blocked_by_step_id: string | null;
      queued_at: string | null;
    };
    assert.equal(cleared.status, "running");
    assert.equal(cleared.blocked_by_run_id, null, "block metadata must be cleared on claim");
    assert.equal(cleared.blocked_by_step_id, null);
    assert.equal(cleared.queued_at, null);
  });

  it("clears stale block metadata on next poll when owner is gone even if claim would be denied for other reasons", () => {
    const db = dbMod.getDb();

    // Pre-populate a pending step with stale block metadata pointing at a
    // run/step that's already completed.
    const runOld = insertRun(db, { workflowId: "feature-dev", status: "completed" });
    const oldStep = insertStep(db, runOld, {
      stepId: "implement",
      agentId: "feature-dev_developer",
      status: "done",
      executionMode: "shared_checkout_exclusive",
      repoKey: REPO_A,
      repoPath: REPO_A,
    });

    const runB = insertRun(db, { workflowId: "feature-dev" });
    const pendingStepB = insertStep(db, runB, {
      stepId: "implement",
      agentId: "feature-dev_developer",
      status: "pending",
      executionMode: "shared_checkout_exclusive",
      repoKey: REPO_A,
      repoPath: REPO_A,
    });
    // Seed stale metadata that should be cleared because no step is running now.
    db.prepare(
      `UPDATE steps
          SET blocked_by_run_id = ?, blocked_by_step_id = ?, queued_at = datetime('now')
        WHERE id = ?`
    ).run(runOld, oldStep, pendingStepB);

    // Claim should succeed; the SELECT guard only excludes pending same-repo
    // steps when a *running* owner exists. So this polls, claims the step,
    // and clears block metadata in the same transition.
    const result = stepOps.claimStep("feature-dev_developer");
    assert.equal(result.found, true);

    const row = db.prepare(
      "SELECT blocked_by_run_id, blocked_by_step_id, queued_at FROM steps WHERE id = ?"
    ).get(pendingStepB) as {
      blocked_by_run_id: string | null;
      blocked_by_step_id: string | null;
      queued_at: string | null;
    };
    assert.equal(row.blocked_by_run_id, null);
    assert.equal(row.blocked_by_step_id, null);
    assert.equal(row.queued_at, null);
  });
});
