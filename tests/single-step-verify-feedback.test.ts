/**
 * Regression test for: single non-loop steps fail before first execution when
 * input_template contains {{verify_feedback}} and no prior retry has populated
 * that key in the run context.
 *
 * Root cause: claimStep() had two code paths (loop vs single). The loop path
 * correctly defaulted context["verify_feedback"] = "" when absent, but the
 * single-step path did NOT, causing findMissingTemplateKeys() to report it as
 * missing and failStepWithMissingInputs() to mark the step/run failed
 * immediately — before any agent ever executed the step.
 *
 * Fix: added the same guard to the single-step path (~line 658 of step-ops.ts):
 *   if (!context["verify_feedback"]) { context["verify_feedback"] = ""; }
 *
 * Reproduces: Step input is not ready: missing required template key(s) verify_feedback
 */

import { describe, it, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

// ── Integration tests using the production DB via claimStep() ────────

describe("claimStep — single step with {{verify_feedback}} in template", () => {
  // Track inserted test data for cleanup
  const insertedRunIds: string[] = [];

  after(async () => {
    // Clean up test data we inserted into the real DB
    if (insertedRunIds.length === 0) return;
    const { getDb } = await import("../dist/db.js");
    const db = getDb();
    for (const runId of insertedRunIds) {
      try {
        db.prepare("DELETE FROM steps WHERE run_id = ?").run(runId);
        db.prepare("DELETE FROM runs WHERE id = ?").run(runId);
      } catch {
        // Best-effort cleanup
      }
    }
  });

  it("should NOT fail a single step whose template contains {{verify_feedback}} on first execution (no prior retry)", async () => {
    const { claimStep } = await import("../dist/installer/step-ops.js");
    const { getDb } = await import("../dist/db.js");

    const runId = `test-run-${crypto.randomUUID()}`;
    const stepId = `test-step-${crypto.randomUUID()}`;
    const agentId = `test-fixer-${crypto.randomUUID().slice(0, 8)}`;
    const t = new Date().toISOString();

    insertedRunIds.push(runId);

    const db = getDb();

    // Run with empty context — no verify_feedback key present
    db.prepare(
      "INSERT INTO runs (id, workflow_id, task, status, context, created_at, updated_at) VALUES (?, 'bug-fix', 'fix bug', 'running', '{}', ?, ?)"
    ).run(runId, t, t);

    // Single step (type='single') whose template uses {{verify_feedback}}
    // This is exactly the scenario that triggered the bug in the fixer step
    const template = [
      "Implement the bug fix.",
      "",
      "VERIFY FEEDBACK (if retrying):",
      "{{verify_feedback}}",
      "",
      "Instructions:",
      "1. cd into the repo and implement the fix",
    ].join("\n");

    db.prepare(
      "INSERT INTO steps (id, run_id, step_id, agent_id, step_index, input_template, expects, status, type, created_at, updated_at) VALUES (?, ?, 'fix', ?, 0, ?, '', 'pending', 'single', ?, ?)"
    ).run(stepId, runId, agentId, template, t, t);

    // claimStep must NOT fail the step — the bug caused failStepWithMissingInputs
    // to fire immediately, marking the run as failed before any execution
    const result = claimStep(agentId);

    assert.equal(result.found, true, "claimStep should return found:true for a single step with {{verify_feedback}} on first pass (no prior retry)");

    // Run must still be 'running', not 'failed'
    const run = db.prepare("SELECT status FROM runs WHERE id = ?").get(runId) as { status: string };
    assert.equal(run.status, "running", "Run should remain 'running' — not failed due to missing verify_feedback on first pass");

    // Step should now be 'running'
    const step = db.prepare("SELECT status FROM steps WHERE id = ?").get(stepId) as { status: string };
    assert.equal(step.status, "running", "Step should be 'running' after successful claim");
  });

  it("should still provide verify_feedback when it exists in the run context (retry scenario)", async () => {
    const { claimStep } = await import("../dist/installer/step-ops.js");
    const { getDb } = await import("../dist/db.js");

    const runId = `test-run-${crypto.randomUUID()}`;
    const stepId = `test-step-${crypto.randomUUID()}`;
    const agentId = `test-fixer-${crypto.randomUUID().slice(0, 8)}`;
    const t = new Date().toISOString();

    insertedRunIds.push(runId);

    const db = getDb();

    // Run context with verify_feedback populated from a prior retry
    const context = { verify_feedback: "Tests were failing — make sure all 3 pass" };
    db.prepare(
      "INSERT INTO runs (id, workflow_id, task, status, context, created_at, updated_at) VALUES (?, 'bug-fix', 'fix bug', 'running', ?, ?, ?)"
    ).run(runId, JSON.stringify(context), t, t);

    const template = [
      "Implement the bug fix.",
      "",
      "VERIFY FEEDBACK (if retrying):",
      "{{verify_feedback}}",
      "",
      "Instructions:",
      "1. cd into the repo and implement the fix",
    ].join("\n");

    db.prepare(
      "INSERT INTO steps (id, run_id, step_id, agent_id, step_index, input_template, expects, status, type, created_at, updated_at) VALUES (?, ?, 'fix', ?, 0, ?, '', 'pending', 'single', ?, ?)"
    ).run(stepId, runId, agentId, template, t, t);

    const result = claimStep(agentId);

    assert.equal(result.found, true, "claimStep should succeed when verify_feedback is present in context");

    // The resolved input should contain the actual feedback, not an empty string
    const resolvedInput = (result as any).resolvedInput as string;
    assert.ok(
      resolvedInput.includes("Tests were failing"),
      "Resolved input should include the actual verify_feedback from prior retry"
    );
  });
});

// ── Unit test: findMissingTemplateKeys guard logic ────────────────────

describe("verify_feedback template resolution — guard logic", () => {
  it("empty string for verify_feedback satisfies template validation", () => {
    // Simulate what the guard does: context["verify_feedback"] = ""
    // Then verify that findMissingTemplateKeys would not flag it as missing
    const context: Record<string, string> = {
      repo: "/Users/brockduarte/antfarm",
      verify_feedback: "", // guard sets this to empty string on first pass
    };

    const template = "REPO: {{repo}}\n\nFEEDBACK:\n{{verify_feedback}}\n\nFix the bug.";

    // Replicate findMissingTemplateKeys logic
    const missing: string[] = [];
    const seen = new Set<string>();
    template.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (_match: string, key: string) => {
      const lower = key.toLowerCase();
      const hasExact = Object.prototype.hasOwnProperty.call(context, key);
      const hasLower = Object.prototype.hasOwnProperty.call(context, lower);
      if (!hasExact && !hasLower && !seen.has(lower)) {
        seen.add(lower);
        missing.push(lower);
      }
      return "";
    });

    assert.equal(missing.length, 0, "Empty string for verify_feedback should not be reported as missing");
  });

  it("absent verify_feedback without the guard causes template validation failure (demonstrates the bug)", () => {
    // Without the guard, context has NO verify_feedback key at all
    const context: Record<string, string> = {
      repo: "/Users/brockduarte/antfarm",
      // verify_feedback is NOT set — this is the bug scenario
    };

    const template = "REPO: {{repo}}\n\nFEEDBACK:\n{{verify_feedback}}\n\nFix the bug.";

    const missing: string[] = [];
    const seen = new Set<string>();
    template.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (_match: string, key: string) => {
      const lower = key.toLowerCase();
      const hasExact = Object.prototype.hasOwnProperty.call(context, key);
      const hasLower = Object.prototype.hasOwnProperty.call(context, lower);
      if (!hasExact && !hasLower && !seen.has(lower)) {
        seen.add(lower);
        missing.push(lower);
      }
      return "";
    });

    assert.ok(
      missing.includes("verify_feedback"),
      "Without the guard, verify_feedback is incorrectly reported as a missing required key"
    );
  });

  it("guard with falsy check preserves legitimate verify_feedback from a prior retry", () => {
    // Guard: if (!context["verify_feedback"]) { context["verify_feedback"] = ""; }
    // When verify_feedback is already set (non-empty), the guard must NOT overwrite it
    const context: Record<string, string> = {
      repo: "/Users/brockduarte/antfarm",
      verify_feedback: "Tests are failing — fix test 3 first",
    };

    // Apply the guard (simulating what the single-step path does)
    if (!context["verify_feedback"]) {
      context["verify_feedback"] = "";
    }

    assert.equal(
      context["verify_feedback"],
      "Tests are failing — fix test 3 first",
      "Guard must not overwrite a legitimately populated verify_feedback from a prior retry cycle"
    );
  });
});

// ── Source code guard presence test ─────────────────────────────────

describe("step-ops.ts source contains the guard in the single-step path", () => {
  it("source file has the verify_feedback guard before findMissingTemplateKeys in the single-step path", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const srcPath = path.resolve(import.meta.dirname, "..", "src", "installer", "step-ops.ts");
    const src = fs.readFileSync(srcPath, "utf-8");

    // The guard must appear in the source (for the single-step path)
    assert.ok(
      src.includes('if (!context["verify_feedback"])'),
      "src/installer/step-ops.ts must contain the verify_feedback guard"
    );

    // Ensure it appears at least twice: once in the loop path (existing) and once in the single-step path (the fix)
    const occurrences = (src.match(/if \(!context\["verify_feedback"\]\)/g) ?? []).length;
    assert.ok(
      occurrences >= 2,
      `Expected guard to appear in both loop and single-step paths (found ${occurrences} occurrence(s))`
    );
  });
});
