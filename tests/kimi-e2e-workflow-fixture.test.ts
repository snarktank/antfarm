/**
 * Test: End-to-end workflow fixture with Kimi polling configuration
 *
 * Loads the tests/fixtures/kimi-polling-workflow.yml fixture and verifies
 * it passes loadWorkflowSpec validation with correct Kimi model configuration
 * across polling, agent model, and agent pollingModel fields.
 */

import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { loadWorkflowSpec } from "../dist/installer/workflow-spec.js";
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("kimi e2e workflow fixture", () => {
  let tmpDir: string;

  before(async () => {
    // Create a temp directory and copy the fixture into it as workflow.yml
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "antfarm-kimi-e2e-"));

    // Copy fixture YAML
    const fixturePath = path.join(__dirname, "fixtures", "kimi-polling-workflow.yml");
    const fixtureContent = await fs.readFile(fixturePath, "utf-8");
    await fs.writeFile(path.join(tmpDir, "workflow.yml"), fixtureContent);

    // Create required agent directory stubs (loadWorkflowSpec doesn't read them,
    // but the YAML references them as relative paths)
    for (const agentId of ["planner", "developer", "reviewer"]) {
      const agentDir = path.join(tmpDir, "agents", agentId);
      await fs.mkdir(agentDir, { recursive: true });
      await fs.writeFile(path.join(agentDir, "AGENTS.md"), `# ${agentId}`);
    }
  });

  after(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("fixture passes loadWorkflowSpec validation", async () => {
    const spec = await loadWorkflowSpec(tmpDir);
    assert.ok(spec, "spec should be loaded");
    assert.equal(spec.id, "kimi-polling-e2e");
  });

  it("workflow-level polling.model is set to kimi-k2", async () => {
    const spec = await loadWorkflowSpec(tmpDir);
    assert.ok(spec.polling, "polling config should exist");
    assert.equal(spec.polling.model, "kimi-k2");
    assert.equal(spec.polling.timeoutSeconds, 60);
  });

  it("planner agent uses kimi-k2 for work model (inherits workflow polling)", async () => {
    const spec = await loadWorkflowSpec(tmpDir);
    const planner = spec.agents.find(a => a.id === "planner");
    assert.ok(planner, "planner agent should exist");
    assert.equal(planner.model, "kimi-k2");
    assert.equal(planner.pollingModel, undefined, "planner should inherit workflow-level polling model");
  });

  it("developer agent overrides pollingModel to kimi-code", async () => {
    const spec = await loadWorkflowSpec(tmpDir);
    const developer = spec.agents.find(a => a.id === "developer");
    assert.ok(developer, "developer agent should exist");
    assert.equal(developer.model, "kimi-k2");
    assert.equal(developer.pollingModel, "kimi-code");
  });

  it("reviewer agent overrides pollingModel to kimi-for-coding with traditional work model", async () => {
    const spec = await loadWorkflowSpec(tmpDir);
    const reviewer = spec.agents.find(a => a.id === "reviewer");
    assert.ok(reviewer, "reviewer agent should exist");
    assert.equal(reviewer.model, "anthropic/claude-sonnet-4-20250514");
    assert.equal(reviewer.pollingModel, "kimi-for-coding");
  });

  it("all three agents are present with correct roles", async () => {
    const spec = await loadWorkflowSpec(tmpDir);
    assert.equal(spec.agents.length, 3);

    const planner = spec.agents.find(a => a.id === "planner");
    const developer = spec.agents.find(a => a.id === "developer");
    const reviewer = spec.agents.find(a => a.id === "reviewer");

    assert.equal(planner?.role, "analysis");
    assert.equal(developer?.role, "coding");
    assert.equal(reviewer?.role, "analysis");
  });

  it("steps are valid with loop configuration", async () => {
    const spec = await loadWorkflowSpec(tmpDir);
    assert.equal(spec.steps.length, 3);

    const implementStep = spec.steps.find(s => s.id === "implement");
    assert.ok(implementStep, "implement step should exist");
    assert.equal(implementStep.type, "loop");
    assert.ok(implementStep.loop, "loop config should exist");
    assert.equal(implementStep.loop.over, "stories");
    assert.equal(implementStep.loop.completion, "all_done");
    assert.equal(implementStep.loop.freshSession, true);
    assert.equal(implementStep.loop.verifyEach, true);
    assert.equal(implementStep.loop.verifyStep, "review");
  });

  it("fixture file exists at expected path", async () => {
    const fixturePath = path.join(__dirname, "fixtures", "kimi-polling-workflow.yml");
    const stat = await fs.stat(fixturePath);
    assert.ok(stat.isFile(), "fixture should be a file");
  });
});
