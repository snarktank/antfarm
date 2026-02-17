import { describe, it } from "node:test";
import assert from "node:assert";
import { resolveBundledWorkflowDir } from "../dist/installer/paths.js";
import { listBundledWorkflows } from "../dist/installer/workflow-fetch.js";
import { loadWorkflowSpec } from "../dist/installer/workflow-spec.js";
import { installWorkflow } from "../dist/installer/install.js";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

// Avoid writing to the real ~/.openclaw during tests
async function withTempStateDir<T>(fn: () => Promise<T>): Promise<T> {
  const prev = process.env.OPENCLAW_STATE_DIR;
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "antfarm-test-openclaw-"));
  process.env.OPENCLAW_STATE_DIR = tmp;

  // installWorkflow requires an OpenClaw config file to exist
  await fs.writeFile(path.join(tmp, "openclaw.json"), "{}\n", "utf-8");

  try {
    return await fn();
  } finally {
    if (prev === undefined) delete process.env.OPENCLAW_STATE_DIR;
    else process.env.OPENCLAW_STATE_DIR = prev;
    await fs.rm(tmp, { recursive: true, force: true });
  }
}

describe("bundled workflows: test-run", () => {
  it("includes test-run in the list", async () => {
    const list = await listBundledWorkflows();
    assert.ok(list.includes("test-run"), `expected test-run in ${list}`);
  });

  it("loadWorkflowSpec(resolveBundledWorkflowDir(test-run)) loads without throwing", async () => {
    const dir = resolveBundledWorkflowDir("test-run");
    const spec = await loadWorkflowSpec(dir);
    assert.strictEqual(spec.id, "test-run");
    assert.ok(Array.isArray(spec.agents) && spec.agents.length > 0);
    assert.ok(Array.isArray(spec.steps) && spec.steps.length > 0);
  });

  it("workflow install succeeds (noop bootstrap file exists)", async () => {
    await withTempStateDir(async () => {
      const result = await installWorkflow({ workflowId: "test-run" });
      assert.strictEqual(result.workflowId, "test-run");
    });
  });
});
