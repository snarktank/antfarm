import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loadWorkflowSpec } from "./workflow-spec.js";
import { buildSubagentPolicy, buildToolsConfig } from "./install.js";

const tempDirs: string[] = [];

async function makeWorkflowDir(yaml: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "antfarm-workflow-spec-"));
  tempDirs.push(dir);
  await fs.writeFile(path.join(dir, "workflow.yml"), yaml, "utf-8");
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe("loadWorkflowSpec role validation", () => {
  it("rejects workflows with missing agent role", async () => {
    const dir = await makeWorkflowDir(`
id: testwf
agents:
  - id: planner
    workspace:
      baseDir: agents/planner
      files:
        AGENTS.md: agents/planner/AGENTS.md
steps:
  - id: plan
    agent: planner
    input: hello
    expects: "STATUS: done"
`);

    await assert.rejects(() => loadWorkflowSpec(dir), /missing role for agent "planner"/i);
  });

  it("rejects workflows with unknown agent role", async () => {
    const dir = await makeWorkflowDir(`
id: testwf
agents:
  - id: planner
    role: wizard
    workspace:
      baseDir: agents/planner
      files:
        AGENTS.md: agents/planner/AGENTS.md
steps:
  - id: plan
    agent: planner
    input: hello
    expects: "STATUS: done"
`);

    await assert.rejects(() => loadWorkflowSpec(dir), /unknown role "wizard"/i);
  });
});

describe("buildToolsConfig least-privilege defaults", () => {
  it("analysis denies sessions, memory, and web access", () => {
    const cfg = buildToolsConfig("analysis") as { deny?: string[] };
    assert.ok(cfg.deny?.includes("group:sessions"));
    assert.ok(cfg.deny?.includes("group:memory"));
    assert.ok(cfg.deny?.includes("web_search"));
    assert.ok(cfg.deny?.includes("web_fetch"));
  });

  it("coordination denies web access while keeping session-oriented orchestration", () => {
    const cfg = buildToolsConfig("coordination") as { deny?: string[] };
    assert.ok(cfg.deny?.includes("web_search"));
    assert.ok(cfg.deny?.includes("web_fetch"));
    assert.ok(!cfg.deny?.includes("group:sessions"));
  });

  it("scanning denies sessions and memory access", () => {
    const cfg = buildToolsConfig("scanning") as { deny?: string[] };
    assert.ok(cfg.deny?.includes("group:sessions"));
    assert.ok(cfg.deny?.includes("group:memory"));
  });
});


describe("buildSubagentPolicy", () => {
  it("only grants coordination agents access to sibling workflow agents", () => {
    assert.deepEqual(
      buildSubagentPolicy({
        workflowId: "deep-research",
        role: "coordination",
        agentId: "orchestrator",
        workflowAgentIds: ["planner", "orchestrator", "scout", "analyst"],
      }),
      { allowAgents: ["deep-research_planner", "deep-research_scout", "deep-research_analyst"] },
    );

    assert.deepEqual(
      buildSubagentPolicy({
        workflowId: "deep-research",
        role: "research",
        agentId: "scout",
        workflowAgentIds: ["planner", "orchestrator", "scout", "analyst"],
      }),
      { allowAgents: [] },
    );
  });
});
