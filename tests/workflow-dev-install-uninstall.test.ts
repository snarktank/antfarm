import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

import { listBundledWorkflows } from "../dist/installer/workflow-fetch.js";
import { installWorkflow } from "../dist/installer/install.js";
import { uninstallWorkflow } from "../dist/installer/uninstall.js";

describe("workflow-dev install/list/uninstall", () => {
  let tmpDir: string;
  let fakeHome: string;
  let stateDir: string;
  let configPath: string;
  let originalHome: string | undefined;
  let originalState: string | undefined;
  let originalConfigPath: string | undefined;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "antfarm-workflow-dev-"));
    fakeHome = path.join(tmpDir, "home");
    stateDir = path.join(fakeHome, ".openclaw");
    configPath = path.join(stateDir, "openclaw.json");

    await fs.mkdir(stateDir, { recursive: true });
    await fs.writeFile(
      configPath,
      JSON.stringify({
        agents: {
          list: [
            { id: "main", name: "Main", default: true, workspace: path.join(stateDir, "workspaces", "main") },
            { id: "feature-dev_planner", name: "Existing Feature Planner", workspace: path.join(stateDir, "workspaces", "workflows", "feature-dev", "planner") },
          ],
        },
      }, null, 2) + "\n",
      "utf-8",
    );

    originalHome = process.env.HOME;
    originalState = process.env.OPENCLAW_STATE_DIR;
    originalConfigPath = process.env.OPENCLAW_CONFIG_PATH;

    process.env.HOME = fakeHome;
    process.env.OPENCLAW_STATE_DIR = stateDir;
    process.env.OPENCLAW_CONFIG_PATH = configPath;
  });

  afterEach(async () => {
    if (originalHome === undefined) delete process.env.HOME;
    else process.env.HOME = originalHome;

    if (originalState === undefined) delete process.env.OPENCLAW_STATE_DIR;
    else process.env.OPENCLAW_STATE_DIR = originalState;

    if (originalConfigPath === undefined) delete process.env.OPENCLAW_CONFIG_PATH;
    else process.env.OPENCLAW_CONFIG_PATH = originalConfigPath;

    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("lists workflow-dev and installs/uninstalls only workflow-specific artifacts", async () => {
    const workflows = await listBundledWorkflows();
    assert.ok(workflows.includes("workflow-dev"), "workflow list should include workflow-dev");

    await installWorkflow({ workflowId: "workflow-dev" });

    const workflowDir = path.join(stateDir, "antfarm", "workflows", "workflow-dev");
    const workflowWorkspace = path.join(stateDir, "workspaces", "workflows", "workflow-dev");
    const plannerWorkspace = path.join(workflowWorkspace, "agents", "planner");
    const plannerAgentDir = path.join(stateDir, "agents", "workflow-dev_planner", "agent");

    await fs.access(path.join(workflowDir, "workflow.yml"));
    await fs.access(path.join(workflowDir, "metadata.json"));
    await fs.access(path.join(plannerWorkspace, "AGENTS.md"));
    await fs.access(plannerAgentDir);

    const installedConfig = JSON.parse(await fs.readFile(configPath, "utf-8"));
    const installedAgentIds = (installedConfig.agents?.list ?? []).map((entry: any) => entry.id);

    assert.ok(installedAgentIds.includes("workflow-dev_planner"), "workflow-dev planner should be provisioned");
    assert.ok(installedAgentIds.includes("workflow-dev_architect"), "workflow-dev architect should be provisioned");
    assert.ok(installedAgentIds.includes("feature-dev_planner"), "existing workflows should remain untouched");

    await uninstallWorkflow({ workflowId: "workflow-dev" });

    await assert.rejects(fs.access(workflowDir), "workflow install dir should be removed on uninstall");
    await assert.rejects(fs.access(workflowWorkspace), "workflow workspace should be removed on uninstall");
    await assert.rejects(fs.access(path.join(stateDir, "agents", "workflow-dev_planner")), "workflow-dev agent dir should be removed");

    const finalConfig = JSON.parse(await fs.readFile(configPath, "utf-8"));
    const finalAgentIds = (finalConfig.agents?.list ?? []).map((entry: any) => entry.id);

    assert.ok(!finalAgentIds.some((id: string) => id.startsWith("workflow-dev_")), "workflow-dev agents should be removed");
    assert.ok(finalAgentIds.includes("feature-dev_planner"), "other workflow agents must remain");
  });
});
