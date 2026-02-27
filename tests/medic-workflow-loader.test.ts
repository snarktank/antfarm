/**
 * Tests for the medic workflow spec loader helper.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { loadWorkflowSpecForMedic } = await import("../dist/medic/checks.js");

// Resolve the actual workflow root path (where antfarm stores workflows)
const workflowRoot = path.join(os.homedir(), ".openclaw", "antfarm", "workflows");

describe("loadWorkflowSpecForMedic", () => {
  it("returns null when workflow directory doesn't exist", async () => {
    const result = await loadWorkflowSpecForMedic("nonexistent-workflow-xyz");
    assert.strictEqual(result, null);
  });

  it("returns workflow spec when directory exists with valid workflow.yml", async () => {
    // Create a temp workflow directory in the actual workflow root location
    const workflowId = `test-workflow-${Date.now()}`;
    const workflowDir = path.join(workflowRoot, workflowId);
    await fs.mkdir(workflowDir, { recursive: true });

    const workflowYaml = `
id: ${workflowId}
version: "1.0"
agents:
  - id: developer
    workspace:
      baseDir: ~/clawd/workspace/test
      files:
        - AGENTS.md
steps:
  - id: test-step
    agent: developer
    input: "Do something"
    expects: "Done"
`;
    await fs.writeFile(path.join(workflowDir, "workflow.yml"), workflowYaml);

    try {
      const result = await loadWorkflowSpecForMedic(workflowId);

      assert.ok(result, "should return a workflow spec");
      assert.strictEqual(result?.id, workflowId);
      assert.strictEqual(result?.version, "1.0");
      assert.ok(Array.isArray(result?.agents));
      assert.strictEqual(result?.agents.length, 1);
      assert.strictEqual(result?.agents[0].id, "developer");
      assert.ok(Array.isArray(result?.steps));
      assert.strictEqual(result?.steps.length, 1);
      assert.strictEqual(result?.steps[0].id, "test-step");
    } finally {
      // Cleanup
      await fs.rm(workflowDir, { recursive: true, force: true });
    }
  });
});
