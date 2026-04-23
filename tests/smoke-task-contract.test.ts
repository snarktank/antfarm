import { describe, it } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import { loadWorkflowSpec } from "../dist/installer/workflow-spec.js";

const ROOT = path.resolve(import.meta.dirname, "..");

describe("workflow task contract guidance", () => {
  for (const workflowId of ["bug-fix", "feature-dev", "security-audit"]) {
    it(`${workflowId} docs mention acceptance criteria in operator guidance`, async () => {
      const spec = await loadWorkflowSpec(path.join(ROOT, "workflows", workflowId));
      const joined = spec.steps.map((s) => s.input).join("\n\n").toLowerCase();
      assert.match(joined, /acceptance criteria|regression test|verify|verified/);
    });
  }

  for (const workflowId of ["bug-fix", "feature-dev", "security-audit"]) {
    it(`${workflowId} verifier step carries BUILD_CMD when it asks for build/typecheck`, async () => {
      const spec = await loadWorkflowSpec(path.join(ROOT, "workflows", workflowId));
      const verifyStep = spec.steps.find((step) => step.id === "verify");
      assert.ok(verifyStep, `${workflowId} should define a verify step`);
      assert.match(verifyStep!.input, /BUILD_CMD: \{\{build_cmd\}\}/);
    });
  }

  it("shared setup guidance tolerates repos without a build command", () => {
    const setupGuidance = fs.readFileSync(path.join(ROOT, "agents", "shared", "setup", "AGENTS.md"), "utf8");
    assert.match(setupGuidance, /BUILD_CMD: none/i);
    assert.match(setupGuidance, /no build command found/i);
  });

  it("smoke task keeps the no-build edge case explicit", () => {
    const smokeTask = fs.readFileSync(path.join(ROOT, "tests", "fixtures", "smoke-task.txt"), "utf8");
    assert.match(smokeTask, /build command passes if present/i);
  });
});
