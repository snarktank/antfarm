/**
 * Test: polling config in workflow YAML schema
 *
 * Verifies that WorkflowSpec supports top-level 'polling' config
 * and per-agent 'pollingModel' overrides.
 */

import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import YAML from "yaml";
import { loadWorkflowSpec } from "../dist/installer/workflow-spec.js";
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";

const WORKFLOW_WITH_POLLING = `
id: test-polling
name: Test Polling Config
version: 1

polling:
  model: anthropic/claude-sonnet-4-20250514
  timeoutSeconds: 30

agents:
  - id: planner
    name: Planner Agent
    pollingModel: anthropic/claude-haiku-3
    workspace:
      baseDir: agents/planner
      files:
        AGENTS.md: agents/planner/AGENTS.md

  - id: developer
    name: Developer Agent
    model: anthropic/claude-opus-4-6
    workspace:
      baseDir: agents/developer
      files:
        AGENTS.md: agents/developer/AGENTS.md

steps:
  - id: plan
    agent: planner
    input: "Plan the work"
    expects: "STORIES"
`;

const WORKFLOW_WITHOUT_POLLING = `
id: test-no-polling
name: Test No Polling Config
version: 1

agents:
  - id: developer
    name: Developer Agent
    workspace:
      baseDir: agents/developer
      files:
        AGENTS.md: agents/developer/AGENTS.md

steps:
  - id: implement
    agent: developer
    input: "Do the work"
    expects: "CHANGES"
`;

const WORKFLOW_INVALID_POLLING_TIMEOUT = `
id: test-bad-polling
name: Test Bad Polling
version: 1

polling:
  model: anthropic/claude-sonnet-4-20250514
  timeoutSeconds: -5

agents:
  - id: developer
    name: Developer Agent
    workspace:
      baseDir: agents/developer
      files:
        AGENTS.md: agents/developer/AGENTS.md

steps:
  - id: implement
    agent: developer
    input: "Do the work"
    expects: "CHANGES"
`;

const WORKFLOW_WITH_KIMI_POLLING = `
id: test-kimi-polling
name: Test Kimi Polling Config
version: 1

polling:
  model: kimi-k2
  timeoutSeconds: 45

agents:
  - id: planner
    name: Planner Agent
    pollingModel: kimi-code
    workspace:
      baseDir: agents/planner
      files:
        AGENTS.md: agents/planner/AGENTS.md

  - id: developer
    name: Developer Agent
    pollingModel: kimi-for-coding
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
    input: "Plan the work"
    expects: "STORIES"
`;

describe("polling config", () => {
  let tmpDir: string;

  before(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "antfarm-polling-test-"));
  });

  after(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("parses top-level polling config with model and timeoutSeconds", async () => {
    const dir = path.join(tmpDir, "with-polling");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, "workflow.yml"), WORKFLOW_WITH_POLLING);

    const spec = await loadWorkflowSpec(dir);
    assert.ok(spec.polling, "polling config should exist");
    assert.equal(spec.polling.model, "anthropic/claude-sonnet-4-20250514");
    assert.equal(spec.polling.timeoutSeconds, 30);
  });

  it("parses per-agent pollingModel", async () => {
    const dir = path.join(tmpDir, "agent-polling");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, "workflow.yml"), WORKFLOW_WITH_POLLING);

    const spec = await loadWorkflowSpec(dir);
    const planner = spec.agents.find(a => a.id === "planner");
    assert.ok(planner, "planner agent should exist");
    assert.equal(planner.pollingModel, "anthropic/claude-haiku-3");

    const developer = spec.agents.find(a => a.id === "developer");
    assert.ok(developer, "developer agent should exist");
    assert.equal(developer.pollingModel, undefined, "developer should not have pollingModel");
  });

  it("loads workflow without polling config (backward compat)", async () => {
    const dir = path.join(tmpDir, "no-polling");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, "workflow.yml"), WORKFLOW_WITHOUT_POLLING);

    const spec = await loadWorkflowSpec(dir);
    assert.equal(spec.polling, undefined, "polling should be undefined");
    assert.equal(spec.agents[0].pollingModel, undefined);
  });

  it("rejects invalid polling.timeoutSeconds", async () => {
    const dir = path.join(tmpDir, "bad-polling");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, "workflow.yml"), WORKFLOW_INVALID_POLLING_TIMEOUT);

    await assert.rejects(
      () => loadWorkflowSpec(dir),
      /polling\.timeoutSeconds must be positive/
    );
  });

  it("accepts kimi-k2 at workflow-level polling.model", async () => {
    const dir = path.join(tmpDir, "kimi-polling-workflow");
    await fs.mkdir(dir, { recursive: true });
    await fs.mkdir(path.join(dir, "agents", "planner"), { recursive: true });
    await fs.mkdir(path.join(dir, "agents", "developer"), { recursive: true });
    await fs.mkdir(path.join(dir, "agents", "reviewer"), { recursive: true });
    await fs.writeFile(path.join(dir, "agents", "planner", "AGENTS.md"), "# Planner");
    await fs.writeFile(path.join(dir, "agents", "developer", "AGENTS.md"), "# Developer");
    await fs.writeFile(path.join(dir, "agents", "reviewer", "AGENTS.md"), "# Reviewer");
    await fs.writeFile(path.join(dir, "workflow.yml"), WORKFLOW_WITH_KIMI_POLLING);

    const spec = await loadWorkflowSpec(dir);
    assert.ok(spec.polling, "polling config should exist");
    assert.equal(spec.polling.model, "kimi-k2", "workflow-level polling.model should accept kimi-k2");
    assert.equal(spec.polling.timeoutSeconds, 45);
  });

  it("accepts kimi-code and kimi-for-coding at per-agent pollingModel", async () => {
    const dir = path.join(tmpDir, "kimi-polling-agent");
    await fs.mkdir(dir, { recursive: true });
    await fs.mkdir(path.join(dir, "agents", "planner"), { recursive: true });
    await fs.mkdir(path.join(dir, "agents", "developer"), { recursive: true });
    await fs.mkdir(path.join(dir, "agents", "reviewer"), { recursive: true });
    await fs.writeFile(path.join(dir, "agents", "planner", "AGENTS.md"), "# Planner");
    await fs.writeFile(path.join(dir, "agents", "developer", "AGENTS.md"), "# Developer");
    await fs.writeFile(path.join(dir, "agents", "reviewer", "AGENTS.md"), "# Reviewer");
    await fs.writeFile(path.join(dir, "workflow.yml"), WORKFLOW_WITH_KIMI_POLLING);

    const spec = await loadWorkflowSpec(dir);
    const planner = spec.agents.find(a => a.id === "planner");
    const developer = spec.agents.find(a => a.id === "developer");
    const reviewer = spec.agents.find(a => a.id === "reviewer");

    assert.ok(planner, "planner agent should exist");
    assert.ok(developer, "developer agent should exist");
    assert.ok(reviewer, "reviewer agent should exist");

    assert.equal(planner.pollingModel, "kimi-code", "planner should have kimi-code pollingModel");
    assert.equal(developer.pollingModel, "kimi-for-coding", "developer should have kimi-for-coding pollingModel");
    assert.equal(reviewer.pollingModel, undefined, "reviewer should not have pollingModel (falls back)");
  });

  it("falls back to workflow-level polling.model when agent pollingModel not specified", async () => {
    const dir = path.join(tmpDir, "kimi-polling-fallback");
    await fs.mkdir(dir, { recursive: true });
    await fs.mkdir(path.join(dir, "agents", "planner"), { recursive: true });
    await fs.mkdir(path.join(dir, "agents", "developer"), { recursive: true });
    await fs.mkdir(path.join(dir, "agents", "reviewer"), { recursive: true });
    await fs.writeFile(path.join(dir, "agents", "planner", "AGENTS.md"), "# Planner");
    await fs.writeFile(path.join(dir, "agents", "developer", "AGENTS.md"), "# Developer");
    await fs.writeFile(path.join(dir, "agents", "reviewer", "AGENTS.md"), "# Reviewer");
    await fs.writeFile(path.join(dir, "workflow.yml"), WORKFLOW_WITH_KIMI_POLLING);

    const spec = await loadWorkflowSpec(dir);

    // Verify workflow-level config exists
    assert.ok(spec.polling, "workflow-level polling config should exist");
    assert.equal(spec.polling.model, "kimi-k2", "workflow-level model should be kimi-k2");

    // Verify reviewer has no override (would fall back to workflow-level)
    const reviewer = spec.agents.find(a => a.id === "reviewer");
    assert.ok(reviewer, "reviewer agent should exist");
    assert.equal(reviewer.pollingModel, undefined, "reviewer has no pollingModel override");
  });
});
