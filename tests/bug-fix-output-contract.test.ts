/**
 * Regression tests for bug-fix workflow output contract parsing/validation.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { getDb } from "../dist/db.js";
import { parseOutputKv, validateEvidenceRequirements } from "../dist/installer/step-ops.js";

function createRun(workflowId = "bug-fix"): string {
  const runId = `test-run-${crypto.randomUUID()}`;
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare(
    "INSERT INTO runs (id, workflow_id, task, status, context, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(runId, workflowId, "test task", "running", "{}", now, now);
  return runId;
}

function removeRun(runId: string): void {
  const db = getDb();
  db.prepare("DELETE FROM steps WHERE run_id = ?").run(runId);
  db.prepare("DELETE FROM runs WHERE id = ?").run(runId);
}

describe("bug-fix output contract", () => {
  it("parses KEY: value output into lowercase keys", () => {
    const kv = parseOutputKv([
      "STATUS: done",
      "CHECKS_RUN: npm test",
      "EVIDENCE: ok",
      "VERIFIED: yes"
    ].join("\n"));

    assert.equal(kv.status, "done");
    assert.equal(kv.checks_run, "npm test");
    assert.equal(kv.evidence, "ok");
    assert.equal(kv.verified, "yes");
  });

  it("validates verify output requires checks and evidence", () => {
    const runId = createRun();
    try {
      const okOutput = [
        "STATUS: done",
        "VERIFIED: yes",
        "CHECKS_RUN: npm test",
        "EVIDENCE: tests passed"
      ].join("\n");
      assert.equal(validateEvidenceRequirements(runId, "verify", okOutput), null);

      const missingEvidence = [
        "STATUS: done",
        "VERIFIED: yes",
        "CHECKS_RUN: npm test"
      ].join("\n");
      const error = validateEvidenceRequirements(runId, "verify", missingEvidence);
      assert.ok(error?.includes("evidence"));
    } finally {
      removeRun(runId);
    }
  });

  it("validates pr output requires PR field", () => {
    const runId = createRun();
    try {
      const okOutput = [
        "STATUS: done",
        "PR: https://github.com/example/repo/pull/123"
      ].join("\n");
      assert.equal(validateEvidenceRequirements(runId, "pr", okOutput), null);

      const missingPr = [
        "STATUS: done",
        "PR: N/A"
      ].join("\n");
      const error = validateEvidenceRequirements(runId, "pr", missingPr);
      assert.ok(error?.includes("pr"));
    } finally {
      removeRun(runId);
    }
  });

  it("allows prod-test skip output when evidence is provided", () => {
    const runId = createRun();
    try {
      const skipOutput = [
        "STATUS: done",
        "RESULT: skip",
        "EVIDENCE: local-only tool; production test skipped",
        "CHECKS_RUN: none (local-only)"
      ].join("\n");
      assert.equal(validateEvidenceRequirements(runId, "prod-test", skipOutput), null);

      const missingEvidence = [
        "STATUS: done",
        "RESULT: skip",
        "EVIDENCE: N/A"
      ].join("\n");
      const error = validateEvidenceRequirements(runId, "prod-test", missingEvidence);
      assert.ok(error?.includes("evidence"));
    } finally {
      removeRun(runId);
    }
  });
});
