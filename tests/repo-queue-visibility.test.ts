/**
 * Tests: queued repo contention visibility (US-004)
 *
 * Verifies that operator-facing status/dashboard surfaces expose enough
 * repo-queue metadata to distinguish queued same-repo coding work from
 * actively running work.
 */
import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

type VisibilityModule = typeof import("../dist/installer/repo-visibility.js");
type StatusModule = typeof import("../dist/installer/status.js");
type DashboardModule = typeof import("../dist/server/dashboard.js");
type DbModule = typeof import("../dist/db.js");

let visibility: VisibilityModule;
let statusMod: StatusModule;
let dashboardMod: DashboardModule;
let dbMod: DbModule;
let tmpHome: string;
let originalHome: string | undefined;

const REPO_A = "/tmp/antfarm-test-repo-visibility-a";

function insertRun(
  db: DatabaseSync,
  opts: {
    id?: string;
    runNumber?: number | null;
    workflowId?: string;
    task?: string;
    status?: string;
    context?: Record<string, string>;
  } = {},
): string {
  const id = opts.id ?? crypto.randomUUID();
  const t = new Date().toISOString();
  db.prepare(
    `INSERT INTO runs
     (id, run_number, workflow_id, task, status, context, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    opts.runNumber ?? null,
    opts.workflowId ?? "feature-dev",
    opts.task ?? "test task",
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
    blockedByRunId?: string | null;
    blockedByStepId?: string | null;
    queuedAt?: string | null;
    createdAt?: string;
  } = {},
): string {
  const id = crypto.randomUUID();
  const t = opts.createdAt ?? new Date().toISOString();
  db.prepare(
    `INSERT INTO steps
       (id, run_id, step_id, agent_id, step_index, input_template, expects,
        status, type, execution_mode, repo_key, repo_path,
        blocked_by_run_id, blocked_by_step_id, queued_at,
        created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    runId,
    opts.stepId ?? "implement",
    opts.agentId ?? "feature-dev_developer",
    opts.stepIndex ?? 0,
    "",
    "",
    opts.status ?? "pending",
    "single",
    opts.executionMode ?? null,
    opts.repoKey ?? null,
    opts.repoPath ?? null,
    opts.blockedByRunId ?? null,
    opts.blockedByStepId ?? null,
    opts.queuedAt ?? null,
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
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "antfarm-repo-visibility-"));
  originalHome = process.env.HOME;
  process.env.HOME = tmpHome;
  dbMod = await import("../dist/db.js");
  visibility = await import("../dist/installer/repo-visibility.js");
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

describe("isStepQueuedOnRepo()", () => {
  it("is true for pending shared_checkout_exclusive step with blocker pointer", () => {
    const db = dbMod.getDb();
    const run = insertRun(db);
    const owner = insertStep(db, run, {
      status: "running",
      executionMode: "shared_checkout_exclusive",
      repoKey: REPO_A,
      repoPath: REPO_A,
    });
    const runB = insertRun(db);
    insertStep(db, runB, {
      stepId: "implement",
      status: "pending",
      executionMode: "shared_checkout_exclusive",
      repoKey: REPO_A,
      repoPath: REPO_A,
      blockedByRunId: run,
      blockedByStepId: owner,
    });
    const steps = db.prepare("SELECT * FROM steps WHERE run_id = ?").all(runB) as any[];
    assert.equal(visibility.isStepQueuedOnRepo(steps[0]), true);
  });

  it("is false for pending steps with no blocker annotation", () => {
    const db = dbMod.getDb();
    const run = insertRun(db);
    insertStep(db, run, {
      status: "pending",
      executionMode: "shared_checkout_exclusive",
      repoKey: REPO_A,
      repoPath: REPO_A,
    });
    const step = db.prepare("SELECT * FROM steps").get() as any;
    assert.equal(visibility.isStepQueuedOnRepo(step), false);
  });

  it("is false for running steps even if blocker metadata is stale", () => {
    const db = dbMod.getDb();
    const run = insertRun(db);
    insertStep(db, run, {
      status: "running",
      executionMode: "shared_checkout_exclusive",
      repoKey: REPO_A,
      repoPath: REPO_A,
      blockedByStepId: "old-id",
    });
    const step = db.prepare("SELECT * FROM steps").get() as any;
    assert.equal(visibility.isStepQueuedOnRepo(step), false);
  });

  it("is false for no_lock steps", () => {
    const db = dbMod.getDb();
    const run = insertRun(db);
    insertStep(db, run, {
      status: "pending",
      executionMode: "no_lock",
      repoKey: REPO_A,
      repoPath: REPO_A,
      blockedByStepId: "x",
    });
    const step = db.prepare("SELECT * FROM steps").get() as any;
    assert.equal(visibility.isStepQueuedOnRepo(step), false);
  });
});

describe("resolveRepoQueueContext()", () => {
  it("resolves blocking run number, workflow, task, and step id", () => {
    const db = dbMod.getDb();
    const ownerRun = insertRun(db, {
      runNumber: 42,
      workflowId: "feature-dev",
      task: "build new thing",
    });
    const ownerStep = insertStep(db, ownerRun, {
      stepId: "implement",
      agentId: "feature-dev_developer",
      status: "running",
      executionMode: "shared_checkout_exclusive",
      repoKey: REPO_A,
      repoPath: REPO_A,
    });

    const queuedRun = insertRun(db, { runNumber: 43, workflowId: "bug-fix" });
    insertStep(db, queuedRun, {
      stepId: "fix",
      agentId: "bug-fix_fixer",
      status: "pending",
      executionMode: "shared_checkout_exclusive",
      repoKey: REPO_A,
      repoPath: REPO_A,
      blockedByRunId: ownerRun,
      blockedByStepId: ownerStep,
      queuedAt: "2024-06-01T00:00:00.000Z",
    });

    const queuedStep = db.prepare("SELECT * FROM steps WHERE run_id = ?").get(queuedRun) as any;
    const ctx = visibility.resolveRepoQueueContext(queuedStep);
    assert.ok(ctx);
    assert.equal(ctx.repoKey, REPO_A);
    assert.equal(ctx.repoPath, REPO_A);
    assert.equal(ctx.queuedAt, "2024-06-01T00:00:00.000Z");
    assert.equal(ctx.blockingRunId, ownerRun);
    assert.equal(ctx.blockingRunNumber, 42);
    assert.equal(ctx.blockingWorkflowId, "feature-dev");
    assert.equal(ctx.blockingTask, "build new thing");
    assert.equal(ctx.blockingStepId, "implement");
    assert.equal(ctx.blockingAgentId, "feature-dev_developer");
  });

  it("returns null for steps that are not queued on repo", () => {
    const db = dbMod.getDb();
    const run = insertRun(db);
    insertStep(db, run, { status: "running" });
    const step = db.prepare("SELECT * FROM steps").get() as any;
    assert.equal(visibility.resolveRepoQueueContext(step), null);
  });

  it("returns context even when blocker rows have been deleted (graceful degrade)", () => {
    const db = dbMod.getDb();
    const run = insertRun(db);
    insertStep(db, run, {
      status: "pending",
      executionMode: "shared_checkout_exclusive",
      repoKey: REPO_A,
      repoPath: REPO_A,
      blockedByRunId: "missing-run-id",
      blockedByStepId: "missing-step-id",
    });
    const step = db.prepare("SELECT * FROM steps").get() as any;
    const ctx = visibility.resolveRepoQueueContext(step);
    assert.ok(ctx, "context is still returned");
    assert.equal(ctx.blockingRunNumber, null);
    assert.equal(ctx.blockingStepId, null);
    assert.equal(ctx.blockingRunId, "missing-run-id");
  });
});

describe("formatQueuedAnnotation() + formatStepStatusLine()", () => {
  it("produces a human-readable annotation with run number and step id", () => {
    const line = visibility.formatQueuedAnnotation({
      repoKey: REPO_A,
      repoPath: REPO_A,
      queuedAt: null,
      blockingRunId: "abc",
      blockingRunNumber: 42,
      blockingWorkflowId: "feature-dev",
      blockingTask: "t",
      blockingStepId: "implement",
      blockingAgentId: "feature-dev_developer",
    });
    assert.match(line ?? "", /queued on \/tmp\/antfarm-test-repo-visibility-a/);
    assert.match(line ?? "", /run #42/);
    assert.match(line ?? "", /step "implement"/);
  });

  it("falls back to run id prefix when run_number is missing", () => {
    const line = visibility.formatQueuedAnnotation({
      repoKey: REPO_A,
      repoPath: null,
      queuedAt: null,
      blockingRunId: "deadbeef-1111-2222-3333-444455556666",
      blockingRunNumber: null,
      blockingWorkflowId: null,
      blockingTask: null,
      blockingStepId: null,
      blockingAgentId: null,
    });
    assert.match(line ?? "", /run deadbeef/);
  });

  it("returns null for null context", () => {
    assert.equal(visibility.formatQueuedAnnotation(null), null);
  });

  it("formatStepStatusLine embeds annotation below the base line when queued", () => {
    const db = dbMod.getDb();
    const run = insertRun(db);
    const step: any = {
      id: "x",
      run_id: run,
      step_id: "implement",
      agent_id: "feature-dev_developer",
      status: "pending",
      execution_mode: "shared_checkout_exclusive",
      repo_key: REPO_A,
      repo_path: REPO_A,
      blocked_by_run_id: "r",
      blocked_by_step_id: "s",
    };
    const line = visibility.formatStepStatusLine(step, {
      repoKey: REPO_A,
      repoPath: REPO_A,
      queuedAt: null,
      blockingRunId: "r",
      blockingRunNumber: 7,
      blockingWorkflowId: "feature-dev",
      blockingTask: "t",
      blockingStepId: "implement",
      blockingAgentId: "feature-dev_developer",
    });
    assert.match(line, /\[pending\] implement \(feature-dev_developer\)/);
    assert.match(line, /↳ queued on \/tmp\/antfarm-test-repo-visibility-a/);
    assert.match(line, /run #7/);
  });

  it("formatStepStatusLine with null queue returns the base line unchanged", () => {
    const step: any = {
      status: "running",
      step_id: "implement",
      agent_id: "feature-dev_developer",
    };
    const line = visibility.formatStepStatusLine(step, null);
    assert.equal(line, "  [running] implement (feature-dev_developer)");
    assert.ok(!line.includes("↳"));
  });
});

describe("getWorkflowStatus() exposes queue context", () => {
  it("attaches queue context to queued steps and leaves active steps untouched", () => {
    const db = dbMod.getDb();
    const ownerRun = insertRun(db, { runNumber: 100, workflowId: "feature-dev", task: "owner task" });
    const ownerStep = insertStep(db, ownerRun, {
      stepId: "implement",
      agentId: "feature-dev_developer",
      status: "running",
      executionMode: "shared_checkout_exclusive",
      repoKey: REPO_A,
      repoPath: REPO_A,
    });

    const queuedRun = insertRun(db, { runNumber: 101, workflowId: "bug-fix", task: "queued task" });
    insertStep(db, queuedRun, {
      stepId: "fix",
      agentId: "bug-fix_fixer",
      status: "pending",
      executionMode: "shared_checkout_exclusive",
      repoKey: REPO_A,
      repoPath: REPO_A,
      blockedByRunId: ownerRun,
      blockedByStepId: ownerStep,
      queuedAt: "2024-06-01T00:00:00.000Z",
    });

    const result = statusMod.getWorkflowStatus("101");
    assert.equal(result.status, "ok");
    if (result.status !== "ok") return;
    assert.equal(result.steps.length, 1);
    const step = result.steps[0];
    assert.ok(step.queue, "queue context is present");
    assert.equal(step.queue!.blockingRunNumber, 100);
    assert.equal(step.queue!.blockingStepId, "implement");
    assert.equal(step.queue!.repoPath, REPO_A);

    const ownerResult = statusMod.getWorkflowStatus("100");
    assert.equal(ownerResult.status, "ok");
    if (ownerResult.status !== "ok") return;
    assert.equal(ownerResult.steps[0].queue, null, "running step carries no queue context");
  });
});

describe("dashboard data exposes queue context", () => {
  it("getRunById includes queue context on queued step", () => {
    const db = dbMod.getDb();
    const ownerRun = insertRun(db, { runNumber: 1, workflowId: "feature-dev" });
    const ownerStep = insertStep(db, ownerRun, {
      stepId: "implement",
      status: "running",
      executionMode: "shared_checkout_exclusive",
      repoKey: REPO_A,
      repoPath: REPO_A,
    });
    const queuedRun = insertRun(db, { runNumber: 2, workflowId: "bug-fix" });
    insertStep(db, queuedRun, {
      stepId: "fix",
      status: "pending",
      executionMode: "shared_checkout_exclusive",
      repoKey: REPO_A,
      repoPath: REPO_A,
      blockedByRunId: ownerRun,
      blockedByStepId: ownerStep,
    });

    const run = dashboardMod.getRunById(queuedRun);
    assert.ok(run);
    assert.equal(run!.steps.length, 1);
    const step = run!.steps[0];
    assert.ok(step.queue);
    assert.equal(step.queue!.blockingRunNumber, 1);
    assert.equal(step.queue!.blockingStepId, "implement");
    assert.equal(step.queue!.repoPath, REPO_A);
  });

  it("getRuns includes queue context across multiple runs on the same repo", () => {
    const db = dbMod.getDb();
    const ownerRun = insertRun(db, { runNumber: 10, workflowId: "feature-dev" });
    const ownerStep = insertStep(db, ownerRun, {
      stepId: "implement",
      status: "running",
      executionMode: "shared_checkout_exclusive",
      repoKey: REPO_A,
      repoPath: REPO_A,
    });
    const queuedRun = insertRun(db, { runNumber: 11, workflowId: "feature-dev" });
    insertStep(db, queuedRun, {
      stepId: "implement",
      status: "pending",
      executionMode: "shared_checkout_exclusive",
      repoKey: REPO_A,
      repoPath: REPO_A,
      blockedByRunId: ownerRun,
      blockedByStepId: ownerStep,
    });

    const runs = dashboardMod.getRuns("feature-dev");
    const queued = runs.find((r) => r.id === queuedRun);
    const owner = runs.find((r) => r.id === ownerRun);
    assert.ok(queued);
    assert.ok(owner);
    assert.ok(queued!.steps[0].queue, "queued run has queue context");
    assert.equal(queued!.steps[0].queue!.blockingRunNumber, 10);
    assert.equal(owner!.steps[0].queue, null, "running owner has no queue context");
  });
});
