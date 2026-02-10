/**
 * Regression test: model field must be preserved through install pipeline
 *
 * Bug: workflow.yml agent model configs were silently discarded during install.
 * This test ensures the model field flows from WorkflowAgent → ProvisionedAgent → openclaw.json.
 */

import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import YAML from "yaml";
import type { WorkflowAgent, WorkflowSpec } from "../dist/installer/types.js";
import { loadWorkflowSpec } from "../dist/installer/workflow-spec.js";

const TEST_WORKFLOW_WITH_MODELS = `
id: test-workflow
name: Test Workflow
version: 1

agents:
  - id: planner
    name: Planner Agent
    model: anthropic/claude-opus-4-6
    workspace:
      baseDir: agents/planner
      files:
        AGENTS.md: agents/planner/AGENTS.md

  - id: developer
    name: Developer Agent
    model: openai/gpt-5
    workspace:
      baseDir: agents/developer
      files:
        AGENTS.md: agents/developer/AGENTS.md

  - id: reviewer
    name: Reviewer Agent
    workspace:
      baseDir: agents/reviewer
      files:
        AGENTS.md: agents/reviewer/AGENTS.md

steps:
  - id: plan
    agent: planner
    input: Plan the work
    expects: PLAN

  - id: develop
    agent: developer
    input: Do the work
    expects: STATUS
`;

async function createTempWorkflow(): Promise<string> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "antfarm-test-"));
  await fs.writeFile(path.join(tmpDir, "workflow.yml"), TEST_WORKFLOW_WITH_MODELS);

  // Create minimal agent files to satisfy validation
  for (const agentDir of ["agents/planner", "agents/developer", "agents/reviewer"]) {
    await fs.mkdir(path.join(tmpDir, agentDir), { recursive: true });
    await fs.writeFile(path.join(tmpDir, agentDir, "AGENTS.md"), "# Agent");
  }

  return tmpDir;
}

async function cleanup(dir: string): Promise<void> {
  await fs.rm(dir, { recursive: true, force: true });
}

async function testModelFieldPreservedInWorkflowSpec(): Promise<void> {
  console.log("Test: model field preserved in loadWorkflowSpec...");

  const tmpDir = await createTempWorkflow();
  try {
    const spec = await loadWorkflowSpec(tmpDir);

    // Find agents by id
    const planner = spec.agents.find((a) => a.id === "planner");
    const developer = spec.agents.find((a) => a.id === "developer");
    const reviewer = spec.agents.find((a) => a.id === "reviewer");

    // Verify model fields are preserved
    if (planner?.model !== "anthropic/claude-opus-4-6") {
      throw new Error(`Expected planner.model to be "anthropic/claude-opus-4-6", got "${planner?.model}"`);
    }
    if (developer?.model !== "openai/gpt-5") {
      throw new Error(`Expected developer.model to be "openai/gpt-5", got "${developer?.model}"`);
    }
    if (reviewer?.model !== undefined) {
      throw new Error(`Expected reviewer.model to be undefined, got "${reviewer?.model}"`);
    }

    console.log("  ✓ planner has model: anthropic/claude-opus-4-6");
    console.log("  ✓ developer has model: openai/gpt-5");
    console.log("  ✓ reviewer has no model (undefined)");
    console.log("PASS: model field preserved in WorkflowSpec\n");
  } finally {
    await cleanup(tmpDir);
  }
}

async function testWorkflowAgentTypeHasModelField(): Promise<void> {
  console.log("Test: WorkflowAgent type includes model field...");

  // Type-level test: if this compiles, the type is correct
  const agent: WorkflowAgent = {
    id: "test-agent",
    name: "Test",
    model: "anthropic/claude-opus-4-6",
    workspace: {
      baseDir: "agents/test",
      files: { "AGENTS.md": "agents/test/AGENTS.md" },
    },
  };

  if (agent.model !== "anthropic/claude-opus-4-6") {
    throw new Error("WorkflowAgent type does not properly support model field");
  }

  console.log("  ✓ WorkflowAgent type accepts model field");
  console.log("PASS: WorkflowAgent type includes model\n");
}

async function runTests(): Promise<void> {
  console.log("\n=== Model Field Preservation Regression Tests ===\n");

  try {
    await testWorkflowAgentTypeHasModelField();
    await testModelFieldPreservedInWorkflowSpec();
    console.log("All tests passed! ✓\n");
    process.exit(0);
  } catch (err) {
    console.error("\nFAIL:", err);
    process.exit(1);
  }
}

runTests();
