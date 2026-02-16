/**
 * Tests for doc-revision workflow directory structure and skeleton files.
 * Story 001: Verify workflow directory, agent subdirectories, SOUL.md files, and workflow.yml exist.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import yaml from "yaml";

const WORKFLOW_DIR = path.resolve(
  import.meta.dirname,
  "..",
  "workflows",
  "doc-revision"
);

describe("doc-revision workflow structure (story-001)", () => {
  it("workflow directory exists", () => {
    assert.ok(
      fs.existsSync(WORKFLOW_DIR),
      "workflows/doc-revision/ should exist"
    );
  });

  it("agents directory exists", () => {
    const agentsDir = path.join(WORKFLOW_DIR, "agents");
    assert.ok(fs.existsSync(agentsDir), "agents/ subdirectory should exist");
  });

  it("has 5 agent directories: reader, analyzer, revisor, qa, cleaner", () => {
    const agentsDir = path.join(WORKFLOW_DIR, "agents");
    const expectedAgents = ["reader", "analyzer", "revisor", "qa", "cleaner"];

    for (const agent of expectedAgents) {
      const agentDir = path.join(agentsDir, agent);
      assert.ok(
        fs.existsSync(agentDir),
        `agents/${agent}/ directory should exist`
      );
    }
  });

  it("each agent directory contains SOUL.md file", () => {
    const agentsDir = path.join(WORKFLOW_DIR, "agents");
    const expectedAgents = ["reader", "analyzer", "revisor", "qa", "cleaner"];

    for (const agent of expectedAgents) {
      const soulPath = path.join(agentsDir, agent, "SOUL.md");
      assert.ok(
        fs.existsSync(soulPath),
        `agents/${agent}/SOUL.md should exist`
      );

      const content = fs.readFileSync(soulPath, "utf-8");
      assert.ok(
        content.length > 0,
        `agents/${agent}/SOUL.md should not be empty`
      );
      assert.ok(
        content.includes("# "),
        `agents/${agent}/SOUL.md should have a heading`
      );
    }
  });

  it("workflow.yml exists", () => {
    const workflowPath = path.join(WORKFLOW_DIR, "workflow.yml");
    assert.ok(fs.existsSync(workflowPath), "workflow.yml should exist");
  });

  it("workflow.yml has required fields", () => {
    const workflowPath = path.join(WORKFLOW_DIR, "workflow.yml");
    const content = fs.readFileSync(workflowPath, "utf-8");
    const workflow = yaml.parse(content);

    assert.strictEqual(
      workflow.id,
      "doc-revision",
      "workflow id should be doc-revision"
    );
    assert.ok(workflow.name, "workflow should have a name");
    assert.ok(workflow.version, "workflow should have a version");
    assert.ok(workflow.description, "workflow should have a description");
  });

  it("workflow.yml defines 5 agents", () => {
    const workflowPath = path.join(WORKFLOW_DIR, "workflow.yml");
    const content = fs.readFileSync(workflowPath, "utf-8");
    const workflow = yaml.parse(content);

    assert.ok(Array.isArray(workflow.agents), "agents should be an array");
    assert.strictEqual(
      workflow.agents.length,
      5,
      "should have 5 agent definitions"
    );

    const expectedAgentIds = ["reader", "analyzer", "revisor", "qa", "cleaner"];
    const actualAgentIds = workflow.agents.map((a: any) => a.id);

    for (const expectedId of expectedAgentIds) {
      assert.ok(
        actualAgentIds.includes(expectedId),
        `agents should include ${expectedId}`
      );
    }
  });

  it("workflow.yml has no steps defined yet (skeleton only)", () => {
    const workflowPath = path.join(WORKFLOW_DIR, "workflow.yml");
    const content = fs.readFileSync(workflowPath, "utf-8");
    const workflow = yaml.parse(content);

    assert.ok(Array.isArray(workflow.steps), "steps should be an array");
    assert.strictEqual(
      workflow.steps.length,
      0,
      "steps array should be empty (skeleton only)"
    );
  });
});
