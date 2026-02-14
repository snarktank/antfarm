/**
 * Test: Model validation in workflow-spec.ts
 *
 * Verifies that validateModelIdentifier correctly validates Kimi model
 * identifiers and rejects invalid model strings.
 */

import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { loadWorkflowSpec } from "../dist/installer/workflow-spec.js";
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";

// Valid Kimi model: kimi-k2
const WORKFLOW_VALID_KIMI_K2 = `
id: test-valid-kimi-k2
name: Test Valid Kimi K2
version: 1

polling:
  model: kimi-k2

agents:
  - id: planner
    name: Planner Agent
    model: kimi-k2
    workspace:
      baseDir: agents/planner
      files:
        AGENTS.md: agents/planner/AGENTS.md

steps:
  - id: plan
    agent: planner
    input: "Plan the work"
    expects: "PLAN"
`;

// Valid Kimi model: kimi-code/kimi-for-coding
const WORKFLOW_VALID_KIMI_CODE_SLASH = `
id: test-valid-kimi-code-slash
name: Test Valid Kimi Code Slash
version: 1

agents:
  - id: developer
    name: Developer Agent
    model: kimi-code/kimi-for-coding
    workspace:
      baseDir: agents/developer
      files:
        AGENTS.md: agents/developer/AGENTS.md

steps:
  - id: code
    agent: developer
    input: "Write code"
    expects: "CODE"
`;

// Valid Kimi model: kimi-v1
const WORKFLOW_VALID_KIMI_V1 = `
id: test-valid-kimi-v1
name: Test Valid Kimi V1
version: 1

agents:
  - id: analyzer
    name: Analyzer Agent
    model: kimi-v1
    workspace:
      baseDir: agents/analyzer
      files:
        AGENTS.md: agents/analyzer/AGENTS.md

steps:
  - id: analyze
    agent: analyzer
    input: "Analyze the code"
    expects: "ANALYSIS"
`;

// Invalid: empty model string
const WORKFLOW_EMPTY_MODEL = `
id: test-empty-model
name: Test Empty Model
version: 1

agents:
  - id: planner
    name: Planner Agent
    model: ""
    workspace:
      baseDir: agents/planner
      files:
        AGENTS.md: agents/planner/AGENTS.md

steps:
  - id: plan
    agent: planner
    input: "Plan the work"
    expects: "PLAN"
`;

// Invalid: model with invalid characters
const WORKFLOW_INVALID_CHARS_MODEL = `
id: test-invalid-chars-model
name: Test Invalid Chars Model
version: 1

agents:
  - id: planner
    name: Planner Agent
    model: "kimi@model#123!"
    workspace:
      baseDir: agents/planner
      files:
        AGENTS.md: agents/planner/AGENTS.md

steps:
  - id: plan
    agent: planner
    input: "Plan the work"
    expects: "PLAN"
`;

describe("workflow-spec model validation", () => {
  let tmpDir: string;

  before(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "antfarm-workflow-spec-test-"));
  });

  after(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("accepts valid Kimi model: kimi-k2", async () => {
    const dir = path.join(tmpDir, "valid-kimi-k2");
    await fs.mkdir(dir, { recursive: true });
    await fs.mkdir(path.join(dir, "agents", "planner"), { recursive: true });
    await fs.writeFile(path.join(dir, "agents", "planner", "AGENTS.md"), "# Planner");
    await fs.writeFile(path.join(dir, "workflow.yml"), WORKFLOW_VALID_KIMI_K2);

    const spec = await loadWorkflowSpec(dir);
    assert.equal(spec.polling?.model, "kimi-k2");
    const planner = spec.agents.find(a => a.id === "planner");
    assert.ok(planner, "planner agent should exist");
    assert.equal(planner.model, "kimi-k2");
  });

  it("accepts valid Kimi model: kimi-code/kimi-for-coding", async () => {
    const dir = path.join(tmpDir, "valid-kimi-code-slash");
    await fs.mkdir(dir, { recursive: true });
    await fs.mkdir(path.join(dir, "agents", "developer"), { recursive: true });
    await fs.writeFile(path.join(dir, "agents", "developer", "AGENTS.md"), "# Developer");
    await fs.writeFile(path.join(dir, "workflow.yml"), WORKFLOW_VALID_KIMI_CODE_SLASH);

    const spec = await loadWorkflowSpec(dir);
    const developer = spec.agents.find(a => a.id === "developer");
    assert.ok(developer, "developer agent should exist");
    assert.equal(developer.model, "kimi-code/kimi-for-coding");
  });

  it("accepts valid Kimi model: kimi-v1", async () => {
    const dir = path.join(tmpDir, "valid-kimi-v1");
    await fs.mkdir(dir, { recursive: true });
    await fs.mkdir(path.join(dir, "agents", "analyzer"), { recursive: true });
    await fs.writeFile(path.join(dir, "agents", "analyzer", "AGENTS.md"), "# Analyzer");
    await fs.writeFile(path.join(dir, "workflow.yml"), WORKFLOW_VALID_KIMI_V1);

    const spec = await loadWorkflowSpec(dir);
    const analyzer = spec.agents.find(a => a.id === "analyzer");
    assert.ok(analyzer, "analyzer agent should exist");
    assert.equal(analyzer.model, "kimi-v1");
  });

  it("rejects empty model string", async () => {
    const dir = path.join(tmpDir, "empty-model");
    await fs.mkdir(dir, { recursive: true });
    await fs.mkdir(path.join(dir, "agents", "planner"), { recursive: true });
    await fs.writeFile(path.join(dir, "agents", "planner", "AGENTS.md"), "# Planner");
    await fs.writeFile(path.join(dir, "workflow.yml"), WORKFLOW_EMPTY_MODEL);

    await assert.rejects(
      () => loadWorkflowSpec(dir),
      /must be a non-empty string/
    );
  });

  it("rejects model with invalid characters", async () => {
    const dir = path.join(tmpDir, "invalid-chars-model");
    await fs.mkdir(dir, { recursive: true });
    await fs.mkdir(path.join(dir, "agents", "planner"), { recursive: true });
    await fs.writeFile(path.join(dir, "agents", "planner", "AGENTS.md"), "# Planner");
    await fs.writeFile(path.join(dir, "workflow.yml"), WORKFLOW_INVALID_CHARS_MODEL);

    await assert.rejects(
      () => loadWorkflowSpec(dir),
      /invalid format/
    );
  });
});
