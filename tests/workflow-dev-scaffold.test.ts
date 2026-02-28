import { describe, it } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { listBundledWorkflows } from "../dist/installer/workflow-fetch.js";
import { loadWorkflowSpec } from "../dist/installer/workflow-spec.js";

describe("workflow-dev scaffold", () => {
  it("is discoverable as a bundled workflow", async () => {
    const workflows = await listBundledWorkflows();
    assert.ok(workflows.includes("workflow-dev"), "workflow-dev should be discoverable");
  });

  it("loads workflow.yml with required contract fields", async () => {
    const workflowDir = path.resolve("workflows/workflow-dev");
    const spec = await loadWorkflowSpec(workflowDir);

    assert.equal(spec.id, "workflow-dev");
    assert.ok(spec.name?.length, "name should be set");
    assert.ok(typeof spec.version === "number", "version should be numeric");
    assert.ok(spec.description?.length, "description should be set");
    assert.ok(Array.isArray(spec.agents) && spec.agents.length > 0, "agents should be defined");
    assert.ok(Array.isArray(spec.steps) && spec.steps.length > 0, "steps should be defined");
    assert.equal(spec.polling?.model, "default");
    assert.equal(spec.polling?.timeoutSeconds, 120);
  });
});
