import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { getDb } from "../db.js";
import { completeStep, validateStepOutputContract } from "./step-ops.js";

type TestStep = {
  id?: string;
  stepId: string;
  status?: string;
  expects?: string;
  stepIndex: number;
  maxRetries?: number;
};

const testRunIds: string[] = [];

function createRunWithSteps(opts: { runId: string; workflowId?: string; runStatus?: string; steps: TestStep[] }) {
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare(
    "INSERT INTO runs (id, workflow_id, task, status, context, created_at, updated_at) VALUES (?, ?, ?, ?, '{}', ?, ?)"
  ).run(opts.runId, opts.workflowId ?? "test-workflow", "test task", opts.runStatus ?? "running", now, now);

  for (const step of opts.steps) {
    const id = step.id ?? crypto.randomUUID();
    db.prepare(
      "INSERT INTO steps (id, run_id, step_id, agent_id, step_index, input_template, expects, status, output, retry_count, max_retries, created_at, updated_at) VALUES (?, ?, ?, ?, ?, '', ?, ?, NULL, 0, ?, ?, ?)"
    ).run(
      id,
      opts.runId,
      step.stepId,
      "test-agent",
      step.stepIndex,
      step.expects ?? "STATUS: done",
      step.status ?? "pending",
      step.maxRetries ?? 2,
      now,
      now,
    );
    step.id = id;
  }
}

function cleanupRun(runId: string) {
  const db = getDb();
  db.prepare("DELETE FROM stories WHERE run_id = ?").run(runId);
  db.prepare("DELETE FROM steps WHERE run_id = ?").run(runId);
  db.prepare("DELETE FROM runs WHERE id = ?").run(runId);
}

afterEach(() => {
  for (const runId of testRunIds) cleanupRun(runId);
  testRunIds.length = 0;
});

describe("validateStepOutputContract", () => {
  it("rejects missing STATUS", () => {
    assert.throws(
      () => validateStepOutputContract("FINAL_REPORT: hello", "FINAL_REPORT:"),
      /Missing required STATUS field/,
    );
  });

  it("rejects malformed JSON payloads", () => {
    assert.throws(
      () => validateStepOutputContract("STATUS: done\nVERIFIED_PACKET_JSON: {not valid}", "VERIFIED_PACKET_JSON:"),
      /Malformed VERIFIED_PACKET_JSON/,
    );
  });

  it("allows blocked output even when expects targets success fields", () => {
    const validated = validateStepOutputContract("STATUS: blocked\nBLOCK_REASON: waiting on human", "VERIFIED_PACKET_JSON:");
    assert.equal(validated.status, "blocked");
  });
});

describe("completeStep contract enforcement", () => {
  it("blocks the run when a step reports STATUS: blocked", () => {
    const runId = crypto.randomUUID();
    testRunIds.push(runId);
    const step: TestStep = { stepId: "verify", stepIndex: 0, expects: "VERIFIED_PACKET_JSON:" };
    createRunWithSteps({ runId, steps: [step] });

    const result = completeStep(step.id!, "STATUS: blocked\nBLOCK_REASON: waiting on human review");
    assert.deepEqual(result, { advanced: false, runCompleted: false });

    const db = getDb();
    const run = db.prepare("SELECT status FROM runs WHERE id = ?").get(runId) as { status: string };
    const stepRow = db.prepare("SELECT status, output FROM steps WHERE id = ?").get(step.id!) as { status: string; output: string };
    assert.equal(run.status, "blocked");
    assert.equal(stepRow.status, "blocked");
    assert.match(stepRow.output, /BLOCK_REASON: waiting on human review/);
  });

  it("fails closed when verifier output is missing required VERIFIED_PACKET_JSON", () => {
    const runId = crypto.randomUUID();
    testRunIds.push(runId);
    const verifyStep: TestStep = { stepId: "verify", stepIndex: 0, expects: "VERIFIED_PACKET_JSON:" };
    const writeStep: TestStep = { stepId: "write", stepIndex: 1, status: "waiting", expects: "FINAL_REPORT:" };
    createRunWithSteps({ runId, steps: [verifyStep, writeStep] });

    const result = completeStep(verifyStep.id!, "STATUS: done\nCONFIDENCE_SUMMARY: looks good");
    assert.deepEqual(result, { advanced: false, runCompleted: false });

    const db = getDb();
    const verifyRow = db.prepare("SELECT status, retry_count FROM steps WHERE id = ?").get(verifyStep.id!) as { status: string; retry_count: number };
    const writeRow = db.prepare("SELECT status FROM steps WHERE id = ?").get(writeStep.id!) as { status: string };
    assert.equal(verifyRow.status, "pending");
    assert.equal(verifyRow.retry_count, 1);
    assert.equal(writeRow.status, "waiting");
  });
});
