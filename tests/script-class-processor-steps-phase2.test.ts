/**
 * Tests for script-class-processor workflow.yml steps section Phase 2 (SCP-011)
 * Validates steps 4-6: jump-guide, notes, quiz
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

describe("workflow.yml steps section Phase 2 (SCP-011)", () => {
  let workflow: any;

  it("has valid workflow.yml file", () => {
    const stats = fs.statSync(WORKFLOW_YML);
    assert.ok(stats.isFile(), "workflow.yml should exist");
    
    const content = fs.readFileSync(WORKFLOW_YML, "utf-8");
    workflow = yaml.parse(content);
    assert.ok(workflow, "workflow.yml should parse successfully");
  });

  it("has steps array defined", () => {
    assert.ok(Array.isArray(workflow.steps), "steps should be an array");
  });

  describe("step 4: jump-guide", () => {
    let step: any;

    it("exists in steps array", () => {
      step = workflow.steps.find((s: any) => s.id === "jump-guide");
      assert.ok(step, "jump-guide step should exist");
    });

    it("has correct agent assignment", () => {
      assert.strictEqual(step.agent, "jump-guide-generator", "should use jump-guide-generator agent");
    });

    it("has input template referencing chunk_analysis_path", () => {
      assert.ok(step.input, "should have input template");
      assert.ok(step.input.includes("{{chunk_analysis_path}}"), "input should reference {{chunk_analysis_path}} variable");
    });

    it("expects STATUS: done", () => {
      assert.ok(step.expects, "should have expects field");
      assert.ok(step.expects.includes("STATUS: done"), "should expect STATUS: done");
    });

    it("outputs jump_guide_path", () => {
      assert.ok(step.outputs, "should have outputs");
      assert.ok(step.outputs.jump_guide_path, "should output jump_guide_path");
    });

    it("input describes jump guide generation", () => {
      assert.ok(step.input.toLowerCase().includes("jump"), "input should mention jump");
      assert.ok(step.input.includes("HH:MM:SS") || step.input.toLowerCase().includes("timestamp"), 
        "input should mention timestamps");
    });
  });

  describe("step 5: notes", () => {
    let step: any;

    it("exists in steps array", () => {
      step = workflow.steps.find((s: any) => s.id === "notes");
      assert.ok(step, "notes step should exist");
    });

    it("has correct agent assignment", () => {
      assert.strictEqual(step.agent, "notes-generator", "should use notes-generator agent");
    });

    it("has input template referencing cleaned transcript", () => {
      assert.ok(step.input, "should have input template");
      assert.ok(step.input.includes("{{cleaned_path}}"), "input should reference {{cleaned_path}} variable");
    });

    it("has input template referencing jump_guide_path", () => {
      assert.ok(step.input, "should have input template");
      assert.ok(step.input.includes("{{jump_guide_path}}"), "input should reference {{jump_guide_path}} variable");
    });

    it("expects STATUS: done", () => {
      assert.ok(step.expects, "should have expects field");
      assert.ok(step.expects.includes("STATUS: done"), "should expect STATUS: done");
    });

    it("outputs notes_path", () => {
      assert.ok(step.outputs, "should have outputs");
      assert.ok(step.outputs.notes_path, "should output notes_path");
    });

    it("input describes notes generation", () => {
      assert.ok(step.input.toLowerCase().includes("notes"), "input should mention notes");
      assert.ok(step.input.toLowerCase().includes("summary") || step.input.toLowerCase().includes("concept"), 
        "input should mention content sections");
    });
  });

  describe("step 6: quiz", () => {
    let step: any;

    it("exists in steps array", () => {
      step = workflow.steps.find((s: any) => s.id === "quiz");
      assert.ok(step, "quiz step should exist");
    });

    it("has correct agent assignment", () => {
      assert.strictEqual(step.agent, "quiz-generator", "should use quiz-generator agent");
    });

    it("has input template referencing notes_path", () => {
      assert.ok(step.input, "should have input template");
      assert.ok(step.input.includes("{{notes_path}}"), "input should reference {{notes_path}} variable");
    });

    it("expects STATUS: done", () => {
      assert.ok(step.expects, "should have expects field");
      assert.ok(step.expects.includes("STATUS: done"), "should expect STATUS: done");
    });

    it("outputs quiz_path", () => {
      assert.ok(step.outputs, "should have outputs");
      assert.ok(step.outputs.quiz_path, "should output quiz_path");
    });

    it("input describes quiz generation", () => {
      assert.ok(step.input.toLowerCase().includes("quiz") || step.input.toLowerCase().includes("question"), 
        "input should mention quiz/questions");
      assert.ok(step.input.toLowerCase().includes("quick check") || step.input.toLowerCase().includes("concept check"), 
        "input should mention question types");
    });
  });

  describe("step chaining", () => {
    it("has steps 4-6 in correct order", () => {
      const expectedOrder = ["detect", "preprocess", "chunk", "jump-guide", "notes", "quiz"];
      const actualOrder = workflow.steps.slice(0, 6).map((s: any) => s.id);
      assert.deepStrictEqual(actualOrder, expectedOrder, "steps should be in correct order");
    });

    it("jump-guide step receives chunk outputs", () => {
      const chunkStep = workflow.steps.find((s: any) => s.id === "chunk");
      const jumpGuideStep = workflow.steps.find((s: any) => s.id === "jump-guide");
      
      assert.ok(chunkStep, "chunk step should exist");
      assert.ok(jumpGuideStep, "jump-guide step should exist");
      
      assert.ok(jumpGuideStep.input.includes("{{chunk_analysis_path}}"), 
        "jump-guide should reference chunk_analysis_path from chunk");
    });

    it("notes step receives preprocess and jump-guide outputs", () => {
      const preprocessStep = workflow.steps.find((s: any) => s.id === "preprocess");
      const jumpGuideStep = workflow.steps.find((s: any) => s.id === "jump-guide");
      const notesStep = workflow.steps.find((s: any) => s.id === "notes");
      
      assert.ok(preprocessStep, "preprocess step should exist");
      assert.ok(jumpGuideStep, "jump-guide step should exist");
      assert.ok(notesStep, "notes step should exist");
      
      assert.ok(notesStep.input.includes("{{cleaned_path}}"), 
        "notes should reference cleaned_path from preprocess");
      assert.ok(notesStep.input.includes("{{jump_guide_path}}"), 
        "notes should reference jump_guide_path from jump-guide");
    });

    it("quiz step receives notes outputs", () => {
      const notesStep = workflow.steps.find((s: any) => s.id === "notes");
      const quizStep = workflow.steps.find((s: any) => s.id === "quiz");
      
      assert.ok(notesStep, "notes step should exist");
      assert.ok(quizStep, "quiz step should exist");
      
      assert.ok(quizStep.input.includes("{{notes_path}}"), 
        "quiz should reference notes_path from notes");
    });
  });

  describe("Phase 2 step structure completeness", () => {
    it("all Phase 2 steps have required fields", () => {
      const phase2Ids = ["jump-guide", "notes", "quiz"];
      for (const stepId of phase2Ids) {
        const step = workflow.steps.find((s: any) => s.id === stepId);
        assert.ok(step, `step ${stepId} should exist`);
        assert.ok(step.id, "step should have id");
        assert.ok(step.agent, `step ${stepId} should have agent`);
        assert.ok(step.input, `step ${stepId} should have input`);
        assert.ok(step.expects, `step ${stepId} should have expects`);
        assert.ok(step.outputs, `step ${stepId} should have outputs`);
        
        const outputKeys = Object.keys(step.outputs);
        assert.ok(outputKeys.length > 0, `step ${stepId} should have at least one output`);
      }
    });

    it("all Phase 2 agents are defined in agents section", () => {
      const phase2Agents = ["jump-guide-generator", "notes-generator", "quiz-generator"];
      const definedAgents = new Set(workflow.agents.map((a: any) => a.id));
      
      for (const agentId of phase2Agents) {
        assert.ok(definedAgents.has(agentId), `agent ${agentId} should be defined in agents section`);
      }
    });
  });
});
