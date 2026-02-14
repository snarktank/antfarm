/**
 * Test: Kimi model identifier support in workflow spec
 *
 * Verifies that WorkflowSpec supports Kimi model identifiers (kimi-* prefix)
 * in agent model, agent pollingModel, and polling config.
 */

import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import YAML from "yaml";
import { loadWorkflowSpec } from "../dist/installer/workflow-spec.js";
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";

const WORKFLOW_WITH_KIMI_MODELS = `
id: test-kimi-models
name: Test Kimi Model Support
version: 1

polling:
  model: kimi-k2
  timeoutSeconds: 30

agents:
  - id: planner
    name: Planner Agent
    model: kimi-code
    pollingModel: kimi-k2
    workspace:
      baseDir: agents/planner
      files:
        AGENTS.md: agents/planner/AGENTS.md

  - id: developer
    name: Developer Agent
    model: kimi-k2-5
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

const WORKFLOW_MIXED_MODELS = `
id: test-mixed-models
name: Test Mixed Model Support
version: 1

polling:
  model: anthropic/claude-haiku-3

agents:
  - id: planner
    name: Planner Agent
    model: kimi-code
    workspace:
      baseDir: agents/planner
      files:
        AGENTS.md: agents/planner/AGENTS.md

  - id: developer
    name: Developer Agent
    model: anthropic/claude-opus-4-6
    pollingModel: kimi-k2
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

const WORKFLOW_INVALID_KIMI_FORMAT = `
id: test-invalid-kimi
name: Test Invalid Kimi Format
version: 1

agents:
  - id: planner
    name: Planner Agent
    model: kimik2
    workspace:
      baseDir: agents/planner
      files:
        AGENTS.md: agents/planner/AGENTS.md

steps:
  - id: plan
    agent: planner
    input: "Plan the work"
    expects: "STORIES"
`;

const WORKFLOW_INVALID_MODEL_FORMAT = `
id: test-invalid-model
name: Test Invalid Model Format
version: 1

agents:
  - id: planner
    name: Planner Agent
    model: invalid-model-format
    workspace:
      baseDir: agents/planner
      files:
        AGENTS.md: agents/planner/AGENTS.md

steps:
  - id: plan
    agent: planner
    input: "Plan the work"
    expects: "STORIES"
`;

describe("kimi model support", () => {
  let tmpDir: string;

  before(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "antfarm-kimi-test-"));
  });

  after(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("accepts kimi-* model identifiers in polling config", async () => {
    const dir = path.join(tmpDir, "kimi-polling");
    await fs.mkdir(dir, { recursive: true });
    await fs.mkdir(path.join(dir, "agents", "planner"), { recursive: true });
    await fs.mkdir(path.join(dir, "agents", "developer"), { recursive: true });
    await fs.writeFile(path.join(dir, "agents", "planner", "AGENTS.md"), "# Planner");
    await fs.writeFile(path.join(dir, "agents", "developer", "AGENTS.md"), "# Developer");
    await fs.writeFile(path.join(dir, "workflow.yml"), WORKFLOW_WITH_KIMI_MODELS);

    const spec = await loadWorkflowSpec(dir);
    assert.ok(spec.polling, "polling config should exist");
    assert.equal(spec.polling.model, "kimi-k2");
  });

  it("accepts kimi-* model identifiers in agent model field", async () => {
    const dir = path.join(tmpDir, "kimi-agent-model");
    await fs.mkdir(dir, { recursive: true });
    await fs.mkdir(path.join(dir, "agents", "planner"), { recursive: true });
    await fs.mkdir(path.join(dir, "agents", "developer"), { recursive: true });
    await fs.writeFile(path.join(dir, "agents", "planner", "AGENTS.md"), "# Planner");
    await fs.writeFile(path.join(dir, "agents", "developer", "AGENTS.md"), "# Developer");
    await fs.writeFile(path.join(dir, "workflow.yml"), WORKFLOW_WITH_KIMI_MODELS);

    const spec = await loadWorkflowSpec(dir);
    const planner = spec.agents.find(a => a.id === "planner");
    assert.ok(planner, "planner agent should exist");
    assert.equal(planner.model, "kimi-code");
  });

  it("accepts kimi-* model identifiers in agent pollingModel field", async () => {
    const dir = path.join(tmpDir, "kimi-polling-model");
    await fs.mkdir(dir, { recursive: true });
    await fs.mkdir(path.join(dir, "agents", "planner"), { recursive: true });
    await fs.mkdir(path.join(dir, "agents", "developer"), { recursive: true });
    await fs.writeFile(path.join(dir, "agents", "planner", "AGENTS.md"), "# Planner");
    await fs.writeFile(path.join(dir, "agents", "developer", "AGENTS.md"), "# Developer");
    await fs.writeFile(path.join(dir, "workflow.yml"), WORKFLOW_WITH_KIMI_MODELS);

    const spec = await loadWorkflowSpec(dir);
    const planner = spec.agents.find(a => a.id === "planner");
    assert.ok(planner, "planner agent should exist");
    assert.equal(planner.pollingModel, "kimi-k2");
  });

  it("accepts mixed kimi-* and provider/model formats", async () => {
    const dir = path.join(tmpDir, "mixed-models");
    await fs.mkdir(dir, { recursive: true });
    await fs.mkdir(path.join(dir, "agents", "planner"), { recursive: true });
    await fs.mkdir(path.join(dir, "agents", "developer"), { recursive: true });
    await fs.writeFile(path.join(dir, "agents", "planner", "AGENTS.md"), "# Planner");
    await fs.writeFile(path.join(dir, "agents", "developer", "AGENTS.md"), "# Developer");
    await fs.writeFile(path.join(dir, "workflow.yml"), WORKFLOW_MIXED_MODELS);

    const spec = await loadWorkflowSpec(dir);
    const planner = spec.agents.find(a => a.id === "planner");
    const developer = spec.agents.find(a => a.id === "developer");

    assert.ok(planner, "planner agent should exist");
    assert.ok(developer, "developer agent should exist");

    assert.equal(planner.model, "kimi-code");
    assert.equal(developer.model, "anthropic/claude-opus-4-6");
    assert.equal(developer.pollingModel, "kimi-k2");
    assert.equal(spec.polling?.model, "anthropic/claude-haiku-3");
  });

  it("rejects invalid kimi format (missing hyphen)", async () => {
    const dir = path.join(tmpDir, "invalid-kimi");
    await fs.mkdir(dir, { recursive: true });
    await fs.mkdir(path.join(dir, "agents", "planner"), { recursive: true });
    await fs.writeFile(path.join(dir, "agents", "planner", "AGENTS.md"), "# Planner");
    await fs.writeFile(path.join(dir, "workflow.yml"), WORKFLOW_INVALID_KIMI_FORMAT);

    await assert.rejects(
      () => loadWorkflowSpec(dir),
      /invalid format/
    );
  });

  it("rejects invalid model format (no provider prefix or kimi prefix)", async () => {
    const dir = path.join(tmpDir, "invalid-model");
    await fs.mkdir(dir, { recursive: true });
    await fs.mkdir(path.join(dir, "agents", "planner"), { recursive: true });
    await fs.writeFile(path.join(dir, "agents", "planner", "AGENTS.md"), "# Planner");
    await fs.writeFile(path.join(dir, "workflow.yml"), WORKFLOW_INVALID_MODEL_FORMAT);

    await assert.rejects(
      () => loadWorkflowSpec(dir),
      /invalid format/
    );
  });
});
