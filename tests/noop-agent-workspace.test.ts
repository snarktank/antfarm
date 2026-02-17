import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

import { resolveBundledWorkflowDir } from "../dist/installer/paths.js";
import { loadWorkflowSpec } from "../dist/installer/workflow-spec.js";
import { provisionAgents } from "../dist/installer/agent-provision.js";

async function withTempStateDir<T>(fn: () => Promise<T>): Promise<T> {
  const prev = process.env.OPENCLAW_STATE_DIR;
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "antfarm-test-openclaw-"));
  process.env.OPENCLAW_STATE_DIR = tmp;

  // not strictly needed for provisionAgents, but keeps parity with other tests
  await fs.writeFile(path.join(tmp, "openclaw.json"), "{}\n", "utf-8");

  try {
    return await fn();
  } finally {
    if (prev === undefined) delete process.env.OPENCLAW_STATE_DIR;
    else process.env.OPENCLAW_STATE_DIR = prev;
    await fs.rm(tmp, { recursive: true, force: true });
  }
}

describe("test-run noop agent workspace", () => {
  it("bundled workspace includes AGENTS.md, SOUL.md, and IDENTITY.md", async () => {
    const workflowDir = resolveBundledWorkflowDir("test-run");
    const spec = await loadWorkflowSpec(workflowDir);

    const noop = spec.agents.find((a) => a.id === "noop");
    assert.ok(noop, "expected noop agent");

    // validate workflow spec declares the files
    const files = Object.keys(noop.workspace.files).sort();
    assert.deepStrictEqual(files, ["AGENTS.md", "IDENTITY.md", "SOUL.md"].sort());

    // validate the bundle actually contains them
    for (const rel of Object.values(noop.workspace.files)) {
      await fs.access(path.join(workflowDir, rel));
    }

    // validate provisioning copies all workspace files
    await withTempStateDir(async () => {
      const provisioned = await provisionAgents({ workflow: spec, workflowDir });
      assert.strictEqual(provisioned.length, 1);
      const ws = provisioned[0]!.workspaceDir;

      const content = await Promise.all(
        ["AGENTS.md", "SOUL.md", "IDENTITY.md"].map((f) => fs.readFile(path.join(ws, f), "utf-8")),
      );

      assert.ok(content[0].includes("STATUS: done"), "AGENTS.md should instruct STATUS: done");
      assert.ok(content[1].includes("STATUS: done"), "SOUL.md should instruct STATUS: done");
      assert.ok(content[2].includes("Noop Agent"), "IDENTITY.md should name the agent");
    });
  });
});
