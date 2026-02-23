/**
 * Tests for script-class-processor workflow.yml agents section (SCP-009)
 * Validates all 7 agent definitions are correctly configured in workflow.yml.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "path";
import { fileURLToPath } from "node:url";
import yaml from "yaml";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKFLOW_DIR = path.resolve(__dirname, "..", "workflows", "script-class-processor");
const WORKFLOW_YML = path.join(WORKFLOW_DIR, "workflow.yml");

describe("workflow.yml agents section (SCP-009)", () => {
  let workflow: any;

  it("has valid workflow.yml file", () => {
    const stats = fs.statSync(WORKFLOW_YML);
    assert.ok(stats.isFile(), "workflow.yml should exist");
    
    const content = fs.readFileSync(WORKFLOW_YML, "utf-8");
    workflow = yaml.parse(content);
    assert.ok(workflow, "workflow.yml should parse successfully");
  });

  it("has agents array defined", () => {
    assert.ok(Array.isArray(workflow.agents), "agents should be an array");
    assert.strictEqual(workflow.agents.length, 7, "should have exactly 7 agents");
  });

  describe("file-watcher agent", () => {
    const agentId = "file-watcher";
    let agent: any;

    it("exists in agents array", () => {
      agent = workflow.agents.find((a: any) => a.id === agentId);
      assert.ok(agent, `agent ${agentId} should exist`);
    });

    it("has correct name", () => {
      assert.strictEqual(agent.name, "File Watcher", "should have correct name");
    });

    it("has correct role", () => {
      assert.strictEqual(agent.role, "coding", "should have coding role");
    });

    it("has description", () => {
      assert.ok(agent.description, "should have description");
      assert.ok(agent.description.toLowerCase().includes("detect"), "description should mention detection");
    });

    it("has workspace configured", () => {
      assert.ok(agent.workspace, "should have workspace");
      assert.strictEqual(agent.workspace.baseDir, "agents/file-watcher", "should have correct baseDir");
    });

    it("has workspace files configured", () => {
      assert.ok(agent.workspace.files, "should have workspace.files");
      assert.strictEqual(agent.workspace.files["AGENTS.md"], "agents/file-watcher/AGENTS.md");
      assert.strictEqual(agent.workspace.files["SOUL.md"], "agents/file-watcher/SOUL.md");
      assert.strictEqual(agent.workspace.files["IDENTITY.md"], "agents/file-watcher/IDENTITY.md");
    });
  });

  describe("transcript-cleaner agent", () => {
    const agentId = "transcript-cleaner";
    let agent: any;

    it("exists in agents array", () => {
      agent = workflow.agents.find((a: any) => a.id === agentId);
      assert.ok(agent, `agent ${agentId} should exist`);
    });

    it("has correct name", () => {
      assert.strictEqual(agent.name, "Transcript Cleaner", "should have correct name");
    });

    it("has correct role", () => {
      assert.strictEqual(agent.role, "coding", "should have coding role");
    });

    it("has description", () => {
      assert.ok(agent.description, "should have description");
      assert.ok(agent.description.includes("Parse VTT"), "description should mention parsing VTT");
    });

    it("has workspace configured", () => {
      assert.ok(agent.workspace, "should have workspace");
      assert.strictEqual(agent.workspace.baseDir, "agents/transcript-cleaner", "should have correct baseDir");
    });

    it("has workspace files configured", () => {
      assert.ok(agent.workspace.files, "should have workspace.files");
      assert.strictEqual(agent.workspace.files["AGENTS.md"], "agents/transcript-cleaner/AGENTS.md");
      assert.strictEqual(agent.workspace.files["SOUL.md"], "agents/transcript-cleaner/SOUL.md");
      assert.strictEqual(agent.workspace.files["IDENTITY.md"], "agents/transcript-cleaner/IDENTITY.md");
    });
  });

  describe("chunk-analyzer agent", () => {
    const agentId = "chunk-analyzer";
    let agent: any;

    it("exists in agents array", () => {
      agent = workflow.agents.find((a: any) => a.id === agentId);
      assert.ok(agent, `agent ${agentId} should exist`);
    });

    it("has correct name", () => {
      assert.strictEqual(agent.name, "Chunk Analyzer", "should have correct name");
    });

    it("has analysis role", () => {
      assert.strictEqual(agent.role, "analysis", "should have analysis role");
    });

    it("has description", () => {
      assert.ok(agent.description, "should have description");
      assert.ok(agent.description.includes("chunks"), "description should mention chunks");
    });

    it("has workspace configured", () => {
      assert.ok(agent.workspace, "should have workspace");
      assert.strictEqual(agent.workspace.baseDir, "agents/chunk-analyzer", "should have correct baseDir");
    });

    it("has workspace files configured", () => {
      assert.ok(agent.workspace.files, "should have workspace.files");
      assert.strictEqual(agent.workspace.files["AGENTS.md"], "agents/chunk-analyzer/AGENTS.md");
      assert.strictEqual(agent.workspace.files["SOUL.md"], "agents/chunk-analyzer/SOUL.md");
      assert.strictEqual(agent.workspace.files["IDENTITY.md"], "agents/chunk-analyzer/IDENTITY.md");
    });
  });

  describe("jump-guide-generator agent", () => {
    const agentId = "jump-guide-generator";
    let agent: any;

    it("exists in agents array", () => {
      agent = workflow.agents.find((a: any) => a.id === agentId);
      assert.ok(agent, `agent ${agentId} should exist`);
    });

    it("has correct name", () => {
      assert.strictEqual(agent.name, "Jump Guide Generator", "should have correct name");
    });

    it("has correct role", () => {
      assert.strictEqual(agent.role, "coding", "should have coding role");
    });

    it("has description", () => {
      assert.ok(agent.description, "should have description");
      assert.ok(agent.description.includes("timestamp"), "description should mention timestamps");
    });

    it("has workspace configured", () => {
      assert.ok(agent.workspace, "should have workspace");
      assert.strictEqual(agent.workspace.baseDir, "agents/jump-guide-generator", "should have correct baseDir");
    });

    it("has workspace files configured", () => {
      assert.ok(agent.workspace.files, "should have workspace.files");
      assert.strictEqual(agent.workspace.files["AGENTS.md"], "agents/jump-guide-generator/AGENTS.md");
      assert.strictEqual(agent.workspace.files["SOUL.md"], "agents/jump-guide-generator/SOUL.md");
      assert.strictEqual(agent.workspace.files["IDENTITY.md"], "agents/jump-guide-generator/IDENTITY.md");
    });
  });

  describe("notes-generator agent", () => {
    const agentId = "notes-generator";
    let agent: any;

    it("exists in agents array", () => {
      agent = workflow.agents.find((a: any) => a.id === agentId);
      assert.ok(agent, `agent ${agentId} should exist`);
    });

    it("has correct name", () => {
      assert.strictEqual(agent.name, "Notes Generator", "should have correct name");
    });

    it("has correct role", () => {
      assert.strictEqual(agent.role, "coding", "should have coding role");
    });

    it("has description", () => {
      assert.ok(agent.description, "should have description");
      assert.ok(agent.description.includes("notes"), "description should mention notes");
    });

    it("has workspace configured", () => {
      assert.ok(agent.workspace, "should have workspace");
      assert.strictEqual(agent.workspace.baseDir, "agents/notes-generator", "should have correct baseDir");
    });

    it("has workspace files configured", () => {
      assert.ok(agent.workspace.files, "should have workspace.files");
      assert.strictEqual(agent.workspace.files["AGENTS.md"], "agents/notes-generator/AGENTS.md");
      assert.strictEqual(agent.workspace.files["SOUL.md"], "agents/notes-generator/SOUL.md");
      assert.strictEqual(agent.workspace.files["IDENTITY.md"], "agents/notes-generator/IDENTITY.md");
    });
  });

  describe("quiz-generator agent", () => {
    const agentId = "quiz-generator";
    let agent: any;

    it("exists in agents array", () => {
      agent = workflow.agents.find((a: any) => a.id === agentId);
      assert.ok(agent, `agent ${agentId} should exist`);
    });

    it("has correct name", () => {
      assert.strictEqual(agent.name, "Quiz Generator", "should have correct name");
    });

    it("has correct role", () => {
      assert.strictEqual(agent.role, "coding", "should have coding role");
    });

    it("has description", () => {
      assert.ok(agent.description, "should have description");
      assert.ok(agent.description.toLowerCase().includes("practice"), "description should mention practice questions");
    });

    it("has workspace configured", () => {
      assert.ok(agent.workspace, "should have workspace");
      assert.strictEqual(agent.workspace.baseDir, "agents/quiz-generator", "should have correct baseDir");
    });

    it("has workspace files configured", () => {
      assert.ok(agent.workspace.files, "should have workspace.files");
      assert.strictEqual(agent.workspace.files["AGENTS.md"], "agents/quiz-generator/AGENTS.md");
      assert.strictEqual(agent.workspace.files["SOUL.md"], "agents/quiz-generator/SOUL.md");
      assert.strictEqual(agent.workspace.files["IDENTITY.md"], "agents/quiz-generator/IDENTITY.md");
    });
  });

  describe("verification-agent agent", () => {
    const agentId = "verification-agent";
    let agent: any;

    it("exists in agents array", () => {
      agent = workflow.agents.find((a: any) => a.id === agentId);
      assert.ok(agent, `agent ${agentId} should exist`);
    });

    it("has correct name", () => {
      assert.strictEqual(agent.name, "Verification Agent", "should have correct name");
    });

    it("has verification role", () => {
      assert.strictEqual(agent.role, "verification", "should have verification role");
    });

    it("has description", () => {
      assert.ok(agent.description, "should have description");
      assert.ok(agent.description.includes("validation"), "description should mention validation");
    });

    it("has workspace configured", () => {
      assert.ok(agent.workspace, "should have workspace");
      assert.strictEqual(agent.workspace.baseDir, "agents/verification-agent", "should have correct baseDir");
    });

    it("has workspace files configured", () => {
      assert.ok(agent.workspace.files, "should have workspace.files");
      assert.strictEqual(agent.workspace.files["AGENTS.md"], "agents/verification-agent/AGENTS.md");
      assert.strictEqual(agent.workspace.files["SOUL.md"], "agents/verification-agent/SOUL.md");
      assert.strictEqual(agent.workspace.files["IDENTITY.md"], "agents/verification-agent/IDENTITY.md");
    });
  });

  describe("agent order and completeness", () => {
    it("has all expected agent ids in correct order", () => {
      const expectedIds = [
        "file-watcher",
        "transcript-cleaner",
        "chunk-analyzer",
        "jump-guide-generator",
        "notes-generator",
        "quiz-generator",
        "verification-agent"
      ];
      
      const actualIds = workflow.agents.map((a: any) => a.id);
      assert.deepStrictEqual(actualIds, expectedIds, "agent ids should match expected order");
    });

    it("has no duplicate agent ids", () => {
      const ids = workflow.agents.map((a: any) => a.id);
      const uniqueIds = new Set(ids);
      assert.strictEqual(uniqueIds.size, ids.length, "should have no duplicate agent ids");
    });

    it("all agents have required fields", () => {
      for (const agent of workflow.agents) {
        assert.ok(agent.id, `agent should have id`);
        assert.ok(agent.name, `agent ${agent.id} should have name`);
        assert.ok(agent.role, `agent ${agent.id} should have role`);
        assert.ok(agent.description, `agent ${agent.id} should have description`);
        assert.ok(agent.workspace, `agent ${agent.id} should have workspace`);
        assert.ok(agent.workspace.baseDir, `agent ${agent.id} should have workspace.baseDir`);
        assert.ok(agent.workspace.files, `agent ${agent.id} should have workspace.files`);
      }
    });
  });
});
