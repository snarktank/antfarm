import { describe, it } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { existsSync, readFileSync } from "node:fs";
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

  it("wires planner and architect workflow-local analysis agents", async () => {
    const workflowDir = path.resolve("workflows/workflow-dev");
    const spec = await loadWorkflowSpec(workflowDir);

    const planner = spec.agents.find((agent) => agent.id === "planner");
    const architect = spec.agents.find((agent) => agent.id === "architect");

    assert.ok(planner, "planner agent should exist");
    assert.ok(architect, "architect agent should exist");
    assert.equal(planner?.role, "analysis");
    assert.equal(architect?.role, "analysis");

    assert.equal(planner?.workspace.files["AGENTS.md"], "agents/planner/AGENTS.md");
    assert.equal(architect?.workspace.files["AGENTS.md"], "agents/architect/AGENTS.md");

    const localAgentFiles = [
      "agents/planner/AGENTS.md",
      "agents/planner/SOUL.md",
      "agents/planner/IDENTITY.md",
      "agents/architect/AGENTS.md",
      "agents/architect/SOUL.md",
      "agents/architect/IDENTITY.md",
    ];

    for (const relativeFile of localAgentFiles) {
      assert.ok(existsSync(path.join(workflowDir, relativeFile)), `missing ${relativeFile}`);
    }
  });

  it("enforces planner and architect KEY: value contracts and constraints in prompts", async () => {
    const workflowDir = path.resolve("workflows/workflow-dev");
    const spec = await loadWorkflowSpec(workflowDir);

    const planStep = spec.steps.find((step) => step.id === "plan");
    const specifyStep = spec.steps.find((step) => step.id === "specify");

    assert.ok(planStep?.input.includes("Reply using KEY: value lines only:"));
    assert.ok(planStep?.input.includes("STORIES_JSON: [ ... JSON array of <=20 story objects ... ]"));
    assert.ok(planStep?.input.includes("Keep dependency ordering explicit"));
    assert.ok(planStep?.input.includes("mechanically verifiable acceptance criteria"));

    assert.ok(specifyStep?.input.includes("Reply using KEY: value lines only:"));
    assert.ok(specifyStep?.input.includes("SPEC_JSON:"));
    assert.ok(specifyStep?.input.includes("SPEC_CHECKS:"));
    assert.ok(specifyStep?.input.includes("Keep dependency ordering consistent"));
    assert.ok(specifyStep?.input.includes("one session"));
    assert.ok(specifyStep?.input.includes("mechanically verifiable acceptance criteria"));

    const plannerPrompt = readFileSync(path.join(workflowDir, "agents/planner/AGENTS.md"), "utf-8");
    const architectPrompt = readFileSync(path.join(workflowDir, "agents/architect/AGENTS.md"), "utf-8");

    assert.ok(plannerPrompt.includes("Maximum 20 stories"));
    assert.ok(plannerPrompt.includes("KEY: value"));
    assert.ok(plannerPrompt.includes("docs/creating-workflows.md"));

    assert.ok(architectPrompt.includes("KEY: value"));
    assert.ok(architectPrompt.includes("docs/creating-workflows.md"));
    assert.ok(architectPrompt.includes("dependency ordering"));
    assert.ok(architectPrompt.includes("mechanically verifiable"));
  });

  it("defines implementation template for workflow and agent-file generation", async () => {
    const workflowDir = path.resolve("workflows/workflow-dev");
    const spec = await loadWorkflowSpec(workflowDir);

    const implementStep = spec.steps.find((step) => step.id === "implement");

    assert.ok(implementStep?.input.includes("Generate or update `workflow.yml`"));
    assert.ok(implementStep?.input.includes("Generate per-agent workspace files"));
    assert.ok(implementStep?.input.includes("`AGENTS.md`, `SOUL.md`, and `IDENTITY.md`"));

    assert.ok(implementStep?.input.includes("Reply with KEY: value lines only:"));
    assert.ok(implementStep?.input.includes("WORKFLOW_ID:"));
    assert.ok(implementStep?.input.includes("CREATED_FILES:"));
    assert.ok(implementStep?.input.includes("AGENTS_CREATED:"));

    assert.ok(implementStep?.input.includes("Validate path correctness before writing"));
    assert.ok(implementStep?.input.includes("Do not overwrite existing files unless"));
    assert.ok(implementStep?.input.includes("preserve it and report it as preserved"));
  });

  it("defines verification loop checks and bounded retry wiring", async () => {
    const workflowDir = path.resolve("workflows/workflow-dev");
    const spec = await loadWorkflowSpec(workflowDir);

    const verifyStep = spec.steps.find((step) => step.id === "verify");

    assert.ok(verifyStep, "verify step should exist");
    assert.ok(verifyStep?.input.includes("Generated `workflow.yml` parses as valid YAML"));
    assert.ok(verifyStep?.input.includes("required top-level fields exist"));
    assert.ok(verifyStep?.input.includes("every step has `id`, `agent`, and `input`"));
    assert.ok(verifyStep?.input.includes("references a declared agent id"));
    assert.ok(verifyStep?.input.includes("workspace.files"));
    assert.ok(verifyStep?.input.includes("path traversal"));
    assert.ok(verifyStep?.input.includes("STATUS: retry"));
    assert.ok(verifyStep?.input.includes("ISSUES:"));

    assert.equal(verifyStep?.on_fail?.retry_step, "implement");
    assert.equal(verifyStep?.on_fail?.max_retries, 2);
  });
});
