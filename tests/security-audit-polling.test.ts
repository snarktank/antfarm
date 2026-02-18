/**
 * Test: security-audit workflow has polling config
 *
 * Verifies that the security-audit workflow.yml includes a valid polling
 * section and that existing workflow structure is unchanged.
 */

import path from "node:path";
import { loadWorkflowSpec } from "../dist/installer/workflow-spec.js";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

const WORKFLOW_DIR = path.resolve(
  import.meta.dirname,
  "..",
  "workflows",
  "security-audit"
);

describe("security-audit workflow polling config", () => {
  it("has a polling section with model and timeoutSeconds", async () => {
    const spec = await loadWorkflowSpec(WORKFLOW_DIR);
    assert.ok(spec.polling, "polling config should exist");
    assert.equal(spec.polling.model, "claude-sonnet-4-20250514");
    assert.equal(spec.polling.timeoutSeconds, 120);
  });

  it("still has all expected agents", async () => {
    const spec = await loadWorkflowSpec(WORKFLOW_DIR);
    const ids = spec.agents.map((a) => a.id);
    assert.deepEqual(ids, [
      "scanner",
      "prioritizer",
      "setup",
      "fixer",
      "verifier",
      "tester",
      "pr",
    ]);
  });

  it("still has all expected steps", async () => {
    const spec = await loadWorkflowSpec(WORKFLOW_DIR);
    const stepIds = spec.steps.map((s) => s.id);
    assert.deepEqual(stepIds, [
      "scan",
      "prioritize",
      "setup",
      "fix",
      "verify",
      "test",
      "pr",
    ]);
  });

  it("workflow id and version are unchanged", async () => {
    const spec = await loadWorkflowSpec(WORKFLOW_DIR);
    assert.equal(spec.id, "security-audit");
    assert.equal(spec.version, 1);
  });
});
