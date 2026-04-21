/**
 * Tests: shared pause / resume lifecycle helpers
 *
 * Covers US-002:
 *   - pauseWorkflow pauses immediately when no step is running
 *   - pauseWorkflow records pause_requested_at when a step is mid-flight
 *   - resumeWorkflow clears pause metadata and returns the next eligible
 *     step to pending for paused runs
 *   - resumeWorkflow preserves the existing failed-run resume behavior
 *   - resumeWorkflow honors the verify-each loop shape
 *   - findRun resolves by run number, id, and id prefix
 *
 * We point HOME at a tmp dir before importing dist/db.js so the
 * compiled module reads our sandbox path.
 */
import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

type StatusModule = typeof import("../dist/installer/status.js");
type DbModule = typeof import("../dist/db.js");

let statusMod: StatusModule;
let dbMod: DbModule;
let tmpHome: string;
let originalHome: string | undefined;

function nowIso(offsetMs = 0): string {
  return new Date(Date.now() + offsetMs).toISOString();
}

function insertRun(
  db: DatabaseSync,
  opts: {
    id?: string;
    runNumber?: number | null;
    workflowId?: string;
    task?: string;
    status?: string;
    pauseRequestedAt?: string | null;
    pausedAt?: string | null;
  } = {},
): string {
  const id = opts.id ?? crypto.randomUUID();
  const t = nowIso();
  db.prepare(
    `INSERT INTO runs
     (id, run_number, workflow_id, task, status, context,
      pause_requested_at, paused_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, '{}', ?, ?, ?, ?)`,
  ).run(
    id,
    opts.runNumber ?? null,
    opts.workflowId ?? "feature-dev",
    opts.task ?? "test task",
    opts.status ?? "running",
    opts.pauseRequestedAt ?? null,
    opts.pausedAt ?? null,
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
    type?: string;
    loopConfig?: string | null;
  } = {},
): string {
  const id = crypto.randomUUID();
  const t = nowIso();
  db.prepare(
    `INSERT INTO steps
      (id, run_id, step_id, agent_id, step_index, input_template, expects,
       status, type, loop_config, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, '', '', ?, ?, ?, ?, ?)`,
  ).run(
    id,
    runId,
    opts.stepId ?? "step-" + id.slice(0, 4),
    opts.agentId ?? "agent-1",
    opts.stepIndex ?? 0,
    opts.status ?? "waiting",
    opts.type ?? "single",
    opts.loopConfig ?? null,
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
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "antfarm-pause-resume-"));
  originalHome = process.env.HOME;
  process.env.HOME = tmpHome;
  // Dynamic import AFTER setting HOME so dist/db.js captures the sandbox path.
  dbMod = await import("../dist/db.js");
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

describe("findRun", () => {
  it("resolves by run_number, id, and id prefix", () => {
    const db = dbMod.getDb();
    const id = insertRun(db, { runNumber: 42, id: "abcdef1234567890abcdef1234567890" });

    const byNumber = statusMod.findRun("42");
    assert.ok(byNumber && byNumber.id === id);

    const byId = statusMod.findRun(id);
    assert.ok(byId && byId.run_number === 42);

    const byPrefix = statusMod.findRun("abcdef12");
    assert.ok(byPrefix && byPrefix.id === id);

    assert.equal(statusMod.findRun("nope-xx"), undefined);
  });
});

describe("pauseWorkflow", () => {
  it("pauses immediately when no step is running", async () => {
    const db = dbMod.getDb();
    const runId = insertRun(db, { status: "running" });
    insertStep(db, runId, { status: "waiting" });
    insertStep(db, runId, { status: "pending", stepIndex: 1 });

    const result = await statusMod.pauseWorkflow(runId);
    assert.equal(result.status, "ok");
    if (result.status !== "ok") return;
    assert.equal(result.mode, "immediate");
    assert.ok(result.pausedAt);
    assert.ok(result.pauseRequestedAt);

    const row = db
      .prepare("SELECT status, pause_requested_at, paused_at FROM runs WHERE id = ?")
      .get(runId) as { status: string; pause_requested_at: string | null; paused_at: string | null };
    assert.equal(row.status, "paused");
    assert.ok(row.pause_requested_at);
    assert.ok(row.paused_at);

    // Steps untouched by a pause (no failure injected).
    const steps = db
      .prepare("SELECT status FROM steps WHERE run_id = ? ORDER BY step_index ASC")
      .all(runId) as Array<{ status: string }>;
    assert.deepEqual(steps.map((s) => s.status), ["waiting", "pending"]);
  });

  it("records pause_requested_at but keeps run running when a step is mid-flight", async () => {
    const db = dbMod.getDb();
    const runId = insertRun(db, { status: "running" });
    insertStep(db, runId, { status: "running" });
    insertStep(db, runId, { status: "waiting", stepIndex: 1 });

    const result = await statusMod.pauseWorkflow(runId);
    assert.equal(result.status, "ok");
    if (result.status !== "ok") return;
    assert.equal(result.mode, "requested");
    assert.equal(result.pausedAt, null);

    const row = db
      .prepare("SELECT status, pause_requested_at, paused_at FROM runs WHERE id = ?")
      .get(runId) as { status: string; pause_requested_at: string | null; paused_at: string | null };
    // Run is NOT killed; it stays running and just carries the request.
    assert.equal(row.status, "running");
    assert.ok(row.pause_requested_at);
    assert.equal(row.paused_at, null);

    // The running step is left alone — cooperative pause.
    const step = db
      .prepare("SELECT status FROM steps WHERE run_id = ? AND step_index = 0")
      .get(runId) as { status: string };
    assert.equal(step.status, "running");
  });

  it("refuses to pause completed/failed/cancelled runs", async () => {
    const db = dbMod.getDb();
    for (const status of ["completed", "failed", "cancelled"] as const) {
      const runId = insertRun(db, { status });
      const result = await statusMod.pauseWorkflow(runId);
      assert.equal(result.status, "not_pausable", `status=${status} should be not_pausable`);
    }
  });

  it("returns already_paused for an already paused run", async () => {
    const db = dbMod.getDb();
    const runId = insertRun(db, {
      status: "paused",
      pauseRequestedAt: nowIso(-1000),
      pausedAt: nowIso(),
    });
    const result = await statusMod.pauseWorkflow(runId);
    assert.equal(result.status, "already_paused");
  });

  it("returns not_found for an unknown query", async () => {
    const result = await statusMod.pauseWorkflow("no-such-run");
    assert.equal(result.status, "not_found");
  });
});

describe("resumeWorkflow (paused runs)", () => {
  it("clears pause metadata and promotes next waiting step to pending", async () => {
    const db = dbMod.getDb();
    const runId = insertRun(db, {
      status: "paused",
      pauseRequestedAt: nowIso(-2000),
      pausedAt: nowIso(-1000),
    });
    insertStep(db, runId, { status: "done", stepIndex: 0 });
    insertStep(db, runId, { status: "waiting", stepIndex: 1, stepId: "next-step" });
    insertStep(db, runId, { status: "waiting", stepIndex: 2 });

    const result = await statusMod.resumeWorkflow(runId);
    assert.equal(result.status, "ok");
    if (result.status !== "ok") return;
    assert.equal(result.mode, "paused");
    assert.equal(result.nextStepId, "next-step");

    const row = db
      .prepare("SELECT status, pause_requested_at, paused_at FROM runs WHERE id = ?")
      .get(runId) as { status: string; pause_requested_at: string | null; paused_at: string | null };
    assert.equal(row.status, "running");
    assert.equal(row.pause_requested_at, null);
    assert.equal(row.paused_at, null);

    const steps = db
      .prepare("SELECT step_id, status FROM steps WHERE run_id = ? ORDER BY step_index ASC")
      .all(runId) as Array<{ step_id: string; status: string }>;
    assert.deepEqual(steps.map((s) => s.status), ["done", "pending", "waiting"]);
  });

  it("leaves an already-pending step alone on resume", async () => {
    const db = dbMod.getDb();
    const runId = insertRun(db, { status: "paused", pauseRequestedAt: nowIso(), pausedAt: nowIso() });
    insertStep(db, runId, { status: "pending", stepIndex: 0, stepId: "p" });

    const result = await statusMod.resumeWorkflow(runId);
    assert.equal(result.status, "ok");

    const step = db
      .prepare("SELECT status FROM steps WHERE run_id = ? AND step_index = 0")
      .get(runId) as { status: string };
    assert.equal(step.status, "pending");
  });

  it("refuses to resume runs that are neither paused nor failed", async () => {
    const db = dbMod.getDb();
    for (const status of ["running", "completed", "cancelled"] as const) {
      const runId = insertRun(db, { status });
      const result = await statusMod.resumeWorkflow(runId);
      assert.equal(result.status, "not_resumable", `status=${status} should be not_resumable`);
    }
  });
});

describe("resumeWorkflow (failed runs)", () => {
  it("resets a failed single step to pending and returns run to running", async () => {
    const db = dbMod.getDb();
    const runId = insertRun(db, { status: "failed" });
    insertStep(db, runId, { status: "done", stepIndex: 0 });
    insertStep(db, runId, { status: "failed", stepIndex: 1, stepId: "broken" });

    const result = await statusMod.resumeWorkflow(runId);
    assert.equal(result.status, "ok");
    if (result.status !== "ok") return;
    assert.equal(result.mode, "failed");
    assert.equal(result.nextStepId, "broken");

    const run = db.prepare("SELECT status FROM runs WHERE id = ?").get(runId) as { status: string };
    assert.equal(run.status, "running");

    const step = db
      .prepare("SELECT status, retry_count FROM steps WHERE run_id = ? AND step_id = 'broken'")
      .get(runId) as { status: string; retry_count: number };
    assert.equal(step.status, "pending");
    assert.equal(step.retry_count, 0);
  });

  it("resets a failed loop step's failed story to pending and zeroes loop retry counts", async () => {
    const db = dbMod.getDb();
    const runId = insertRun(db, { status: "failed" });
    insertStep(db, runId, {
      status: "failed",
      stepIndex: 0,
      stepId: "dev",
      type: "loop",
      loopConfig: JSON.stringify({ over: "stories", completion: "all_done" }),
    });
    // Pump retry_count above 0 so we can confirm it gets reset.
    db.prepare("UPDATE steps SET retry_count = 2 WHERE run_id = ?").run(runId);
    const storyId = crypto.randomUUID();
    const t = nowIso();
    db.prepare(
      `INSERT INTO stories
       (id, run_id, story_index, story_id, title, description, acceptance_criteria, status, created_at, updated_at)
       VALUES (?, ?, 0, 'US-1', 't', 'd', '[]', 'failed', ?, ?)`,
    ).run(storyId, runId, t, t);

    const result = await statusMod.resumeWorkflow(runId);
    assert.equal(result.status, "ok");
    const story = db
      .prepare("SELECT status FROM stories WHERE id = ?")
      .get(storyId) as { status: string };
    assert.equal(story.status, "pending");
    const loop = db
      .prepare("SELECT retry_count FROM steps WHERE run_id = ? AND type = 'loop'")
      .get(runId) as { retry_count: number };
    assert.equal(loop.retry_count, 0);
  });

  it("verify-each: resets loop step to pending and verify step to waiting", async () => {
    const db = dbMod.getDb();
    const runId = insertRun(db, { status: "failed" });
    const loopId = insertStep(db, runId, {
      status: "running",
      stepIndex: 0,
      stepId: "dev",
      type: "loop",
      loopConfig: JSON.stringify({
        over: "stories",
        completion: "all_done",
        verifyEach: true,
        verifyStep: "verify",
      }),
    });
    insertStep(db, runId, { status: "failed", stepIndex: 1, stepId: "verify" });

    const result = await statusMod.resumeWorkflow(runId);
    assert.equal(result.status, "ok");
    if (result.status !== "ok") return;
    assert.equal(result.mode, "failed");

    const loopStep = db.prepare("SELECT status FROM steps WHERE id = ?").get(loopId) as { status: string };
    assert.equal(loopStep.status, "pending");
    const verifyStep = db
      .prepare("SELECT status FROM steps WHERE run_id = ? AND step_id = 'verify'")
      .get(runId) as { status: string };
    assert.equal(verifyStep.status, "waiting");

    const run = db.prepare("SELECT status FROM runs WHERE id = ?").get(runId) as { status: string };
    assert.equal(run.status, "running");
  });

  it("returns not_resumable when a failed run has no failed step", async () => {
    const db = dbMod.getDb();
    const runId = insertRun(db, { status: "failed" });
    insertStep(db, runId, { status: "done", stepIndex: 0 });

    const result = await statusMod.resumeWorkflow(runId);
    assert.equal(result.status, "not_resumable");
  });
});

describe("pause → resume round trip", () => {
  it("paused run can be resumed and keeps progress", async () => {
    const db = dbMod.getDb();
    const runId = insertRun(db, { status: "running" });
    insertStep(db, runId, { status: "done", stepIndex: 0 });
    insertStep(db, runId, { status: "waiting", stepIndex: 1, stepId: "next" });

    const pauseRes = await statusMod.pauseWorkflow(runId);
    assert.equal(pauseRes.status, "ok");
    if (pauseRes.status === "ok") assert.equal(pauseRes.mode, "immediate");

    const pausedRow = db
      .prepare("SELECT status FROM runs WHERE id = ?")
      .get(runId) as { status: string };
    assert.equal(pausedRow.status, "paused");

    const resumeRes = await statusMod.resumeWorkflow(runId);
    assert.equal(resumeRes.status, "ok");
    if (resumeRes.status === "ok") assert.equal(resumeRes.mode, "paused");

    const after = db
      .prepare("SELECT status, pause_requested_at, paused_at FROM runs WHERE id = ?")
      .get(runId) as { status: string; pause_requested_at: string | null; paused_at: string | null };
    assert.equal(after.status, "running");
    assert.equal(after.pause_requested_at, null);
    assert.equal(after.paused_at, null);

    const nextStep = db
      .prepare("SELECT status FROM steps WHERE run_id = ? AND step_id = 'next'")
      .get(runId) as { status: string };
    assert.equal(nextStep.status, "pending");

    const doneStep = db
      .prepare("SELECT status FROM steps WHERE run_id = ? AND step_index = 0")
      .get(runId) as { status: string };
    assert.equal(doneStep.status, "done");
  });
});
