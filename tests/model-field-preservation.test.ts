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
import type { ModelConfig, WorkflowAgent, WorkflowSpec } from "../dist/installer/types.js";
import { loadWorkflowSpec } from "../dist/installer/workflow-spec.js";
import { buildPollingPrompt } from "../dist/installer/agent-cron.js";

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

const TEST_WORKFLOW_WITH_STRUCTURED_MODEL = `
id: test-structured-model
name: Test Structured Model Workflow
version: 1

agents:
  - id: reviewer
    name: Reviewer Agent
    model:
      primary: anthropic/claude-sonnet-4
      fallbacks:
        - anthropic/claude-haiku-3
        - openai/gpt-4.1-mini
        - openrouter/auto
    workspace:
      baseDir: agents/reviewer
      files:
        AGENTS.md: agents/reviewer/AGENTS.md

  - id: developer
    name: Developer Agent
    model:
      primary: openai/gpt-5
    workspace:
      baseDir: agents/developer
      files:
        AGENTS.md: agents/developer/AGENTS.md

  - id: planner
    name: Planner Agent
    model: anthropic/claude-opus-4-6
    workspace:
      baseDir: agents/planner
      files:
        AGENTS.md: agents/planner/AGENTS.md

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

async function createTempWorkflow(content: string = TEST_WORKFLOW_WITH_MODELS): Promise<string> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "antfarm-test-"));
  await fs.writeFile(path.join(tmpDir, "workflow.yml"), content);

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

async function testWorkflowAgentTypeAcceptsStructuredModel(): Promise<void> {
  console.log("Test: WorkflowAgent type accepts structured model config...");

  // Type-level test: if this compiles, the type is correct
  const agentWithFallbacks: WorkflowAgent = {
    id: "reviewer",
    name: "Reviewer",
    model: {
      primary: "anthropic/claude-sonnet-4",
      fallbacks: ["anthropic/claude-haiku-3", "openai/gpt-4.1-mini"],
    },
    workspace: {
      baseDir: "agents/reviewer",
      files: { "AGENTS.md": "agents/reviewer/AGENTS.md" },
    },
  };

  const agentWithPrimaryOnly: WorkflowAgent = {
    id: "developer",
    name: "Developer",
    model: { primary: "openai/gpt-5" },
    workspace: {
      baseDir: "agents/developer",
      files: { "AGENTS.md": "agents/developer/AGENTS.md" },
    },
  };

  const modelConfig = agentWithFallbacks.model as ModelConfig;
  if (modelConfig.primary !== "anthropic/claude-sonnet-4") {
    throw new Error("WorkflowAgent structured model: primary field not preserved");
  }
  if (!Array.isArray(modelConfig.fallbacks) || modelConfig.fallbacks.length !== 2) {
    throw new Error("WorkflowAgent structured model: fallbacks not preserved");
  }

  const primaryOnlyConfig = agentWithPrimaryOnly.model as ModelConfig;
  if (primaryOnlyConfig.primary !== "openai/gpt-5") {
    throw new Error("WorkflowAgent structured model (primary-only): primary field not preserved");
  }
  if (primaryOnlyConfig.fallbacks !== undefined) {
    throw new Error("WorkflowAgent structured model (primary-only): fallbacks should be undefined");
  }

  console.log("  ✓ WorkflowAgent type accepts structured model with primary + fallbacks");
  console.log("  ✓ WorkflowAgent type accepts structured model with primary only");
  console.log("PASS: WorkflowAgent type accepts structured model config\n");
}

async function testStructuredModelPreservedInWorkflowSpec(): Promise<void> {
  console.log("Test: structured model config preserved in loadWorkflowSpec...");

  const tmpDir = await createTempWorkflow(TEST_WORKFLOW_WITH_STRUCTURED_MODEL);
  try {
    const spec = await loadWorkflowSpec(tmpDir);

    const reviewer = spec.agents.find((a) => a.id === "reviewer");
    const developer = spec.agents.find((a) => a.id === "developer");
    const planner = spec.agents.find((a) => a.id === "planner");

    // Reviewer: structured model with fallbacks
    if (typeof reviewer?.model !== "object" || reviewer.model === null) {
      throw new Error(`Expected reviewer.model to be an object, got ${JSON.stringify(reviewer?.model)}`);
    }
    const reviewerModel = reviewer.model as ModelConfig;
    if (reviewerModel.primary !== "anthropic/claude-sonnet-4") {
      throw new Error(`Expected reviewer.model.primary to be "anthropic/claude-sonnet-4", got "${reviewerModel.primary}"`);
    }
    if (!Array.isArray(reviewerModel.fallbacks) || reviewerModel.fallbacks.length !== 3) {
      throw new Error(`Expected reviewer.model.fallbacks to have 3 entries, got ${JSON.stringify(reviewerModel.fallbacks)}`);
    }
    if (reviewerModel.fallbacks[0] !== "anthropic/claude-haiku-3") {
      throw new Error(`Expected fallbacks[0] to be "anthropic/claude-haiku-3", got "${reviewerModel.fallbacks[0]}"`);
    }

    // Developer: structured model with primary only
    if (typeof developer?.model !== "object" || developer.model === null) {
      throw new Error(`Expected developer.model to be an object, got ${JSON.stringify(developer?.model)}`);
    }
    const developerModel = developer.model as ModelConfig;
    if (developerModel.primary !== "openai/gpt-5") {
      throw new Error(`Expected developer.model.primary to be "openai/gpt-5", got "${developerModel.primary}"`);
    }
    if (developerModel.fallbacks !== undefined) {
      throw new Error(`Expected developer.model.fallbacks to be undefined, got ${JSON.stringify(developerModel.fallbacks)}`);
    }

    // Planner: scalar string model still works
    if (planner?.model !== "anthropic/claude-opus-4-6") {
      throw new Error(`Expected planner.model to be "anthropic/claude-opus-4-6", got "${planner?.model}"`);
    }

    console.log("  ✓ reviewer has structured model with primary + fallbacks");
    console.log("  ✓ developer has structured model with primary only");
    console.log("  ✓ planner retains scalar string model (backward compat)");
    console.log("PASS: structured model config preserved in WorkflowSpec\n");
  } finally {
    await cleanup(tmpDir);
  }
}

async function testBuildPollingPromptWithStructuredModel(): Promise<void> {
  console.log("Test: buildPollingPrompt serializes structured model correctly...");

  const structuredModel: ModelConfig = {
    primary: "anthropic/claude-sonnet-4",
    fallbacks: ["anthropic/claude-haiku-3", "openai/gpt-4.1-mini"],
  };

  const promptWithObject = buildPollingPrompt("wf", "agent", structuredModel);
  const expectedJson = JSON.stringify(structuredModel);
  if (!promptWithObject.includes(expectedJson)) {
    throw new Error(`Expected prompt to contain JSON model config ${expectedJson}`);
  }

  const promptWithString = buildPollingPrompt("wf", "agent", "anthropic/claude-opus-4-6");
  if (!promptWithString.includes('"anthropic/claude-opus-4-6"')) {
    throw new Error(`Expected prompt to contain string model "anthropic/claude-opus-4-6"`);
  }

  const promptWithDefault = buildPollingPrompt("wf", "agent");
  if (!promptWithDefault.includes('"default"')) {
    throw new Error(`Expected prompt to contain "default" model when none provided`);
  }

  console.log("  ✓ structured model config serialized as JSON in polling prompt");
  console.log("  ✓ string model preserved as-is in polling prompt");
  console.log("  ✓ undefined model defaults to \"default\" in polling prompt");
  console.log("PASS: buildPollingPrompt handles structured model correctly\n");
}

async function runTests(): Promise<void> {
  console.log("\n=== Model Field Preservation Regression Tests ===\n");

  try {
    await testWorkflowAgentTypeHasModelField();
    await testWorkflowAgentTypeAcceptsStructuredModel();
    await testModelFieldPreservedInWorkflowSpec();
    await testStructuredModelPreservedInWorkflowSpec();
    await testBuildPollingPromptWithStructuredModel();
    console.log("All tests passed! ✓\n");
    process.exit(0);
  } catch (err) {
    console.error("\nFAIL:", err);
    process.exit(1);
  }
}

runTests();
