import { describe, it } from "node:test";
import assert from "node:assert";
import { resolveBundledWorkflowDir, resolveBundledWorkflowsDir } from "../src/installer/paths.js";
import { listBundledWorkflows } from "../src/installer/workflow-fetch.js";
import { loadWorkflowSpec } from "../src/installer/workflow-spec.js";
import path from "node:path";

describe("bundled workflows", () => {
  it("includes test-run in the list", async () => {
    const list = await listBundledWorkflows();
    assert.ok(list.includes("test-run"), `expected test-run in ${list}`);
  });

  it("loadWorkflowSpec(resolveBundledWorkflowDir(test-run)) loads without throwing", async () => {
    const dir = resolveBundledWorkflowDir("test-run");
    const spec = await loadWorkflowSpec(dir);
    assert.strictEqual(spec.id, "test-run");
    // basic shape checks
    assert.ok(Array.isArray(spec.agents) && spec.agents.length > 0);
    assert.ok(Array.isArray(spec.steps) && spec.steps.length > 0);
  });
});
