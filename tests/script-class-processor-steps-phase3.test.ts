/**
 * Tests for script-class-processor workflow.yml steps section Phase 3 (SCP-012)
 * Validates step 7: verify (Verification and Completion)
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

describe("workflow.yml steps section Phase 3 (SCP-012)", () => {
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

  describe("step 7: verify", () => {
    let step: any;

    it("exists in steps array", () => {
      step = workflow.steps.find((s: any) => s.id === "verify");
      assert.ok(step, "verify step should exist");
    });

    it("has correct agent assignment", () => {
      assert.strictEqual(step.agent, "verification-agent", "should use verification-agent agent");
    });

    it("has input template referencing chunk_analysis_path", () => {
      assert.ok(step.input, "should have input template");
      assert.ok(step.input.includes("{{chunk_analysis_path}}"), "input should reference {{chunk_analysis_path}} variable");
    });

    it("has input template referencing jump_guide_path", () => {
      assert.ok(step.input, "should have input template");
      assert.ok(step.input.includes("{{jump_guide_path}}"), "input should reference {{jump_guide_path}} variable");
    });

    it("has input template referencing notes_path", () => {
      assert.ok(step.input, "should have input template");
      assert.ok(step.input.includes("{{notes_path}}"), "input should reference {{notes_path}} variable");
    });

    it("has input template referencing quiz_path", () => {
      assert.ok(step.input, "should have input template");
      assert.ok(step.input.includes("{{quiz_path}}"), "input should reference {{quiz_path}} variable");
    });

    it("expects STATUS: done", () => {
      assert.ok(step.expects, "should have expects field");
      assert.ok(step.expects.includes("STATUS: done"), "should expect STATUS: done");
    });

    it("outputs completion_report_path", () => {
      assert.ok(step.outputs, "should have outputs");
      assert.ok(step.outputs.completion_report_path, "should output completion_report_path");
    });

    it("has on_fail configured", () => {
      assert.ok(step.on_fail, "should have on_fail configuration");
    });

    it("has on_fail with escalate_to: human", () => {
      assert.ok(step.on_fail.escalate_to, "should have escalate_to in on_fail");
      assert.strictEqual(step.on_fail.escalate_to, "human", "should escalate to human on failure");
    });

    it("input describes verification tasks", () => {
      assert.ok(step.input.toLowerCase().includes("verif") || step.input.toLowerCase().includes("valid"), 
        "input should mention verification/validation");
    });

    it("input mentions all artifacts to validate", () => {
      const input = step.input.toLowerCase();
      assert.ok(input.includes("chunk") || input.includes("analysis"), "input should mention chunk analysis");
      assert.ok(input.includes("jump") || input.includes("guide"), "input should mention jump guide");
      assert.ok(input.includes("notes"), "input should mention notes");
      assert.ok(input.includes("quiz"), "input should mention quiz");
    });

    it("input mentions timestamp validation", () => {
      assert.ok(step.input.includes("HH:MM:SS") || step.input.toLowerCase().includes("timestamp"), 
        "input should mention timestamp validation");
    });

    it("input mentions completion report", () => {
      assert.ok(step.input.toLowerCase().includes("completion") || step.input.toLowerCase().includes("report"), 
        "input should mention completion report");
    });
  });

  describe("step ordering and chaining", () => {
    it("has all 7 steps in correct order", () => {
      const expectedOrder = ["detect", "preprocess", "chunk", "jump-guide", "notes", "quiz", "verify"];
      const actualOrder = workflow.steps.map((s: any) => s.id);
      assert.deepStrictEqual(actualOrder, expectedOrder, "steps should be in correct order");
    });

    it("verify step receives all Phase 2 outputs", () => {
      const chunkStep = workflow.steps.find((s: any) => s.id === "chunk");
      const jumpGuideStep = workflow.steps.find((s: any) => s.id === "jump-guide");
      const notesStep = workflow.steps.find((s: any) => s.id === "notes");
      const quizStep = workflow.steps.find((s: any) => s.id === "quiz");
      const verifyStep = workflow.steps.find((s: any) => s.id === "verify");
      
      assert.ok(chunkStep, "chunk step should exist");
      assert.ok(jumpGuideStep, "jump-guide step should exist");
      assert.ok(notesStep, "notes step should exist");
      assert.ok(quizStep, "quiz step should exist");
      assert.ok(verifyStep, "verify step should exist");
      
      assert.ok(verifyStep.input.includes("{{chunk_analysis_path}}"), 
        "verify should reference chunk_analysis_path from chunk");
      assert.ok(verifyStep.input.includes("{{jump_guide_path}}"), 
        "verify should reference jump_guide_path from jump-guide");
      assert.ok(verifyStep.input.includes("{{notes_path}}"), 
        "verify should reference notes_path from notes");
      assert.ok(verifyStep.input.includes("{{quiz_path}}"), 
        "verify should reference quiz_path from quiz");
    });
  });

  describe("Phase 3 step structure completeness", () => {
    it("verify step has all required fields", () => {
      const verifyStep = workflow.steps.find((s: any) => s.id === "verify");
      assert.ok(verifyStep, "verify step should exist");
      assert.ok(verifyStep.id, "step should have id");
      assert.ok(verifyStep.agent, "verify step should have agent");
      assert.ok(verifyStep.input, "verify step should have input");
      assert.ok(verifyStep.expects, "verify step should have expects");
      assert.ok(verifyStep.outputs, "verify step should have outputs");
      assert.ok(verifyStep.on_fail, "verify step should have on_fail");
      
      const outputKeys = Object.keys(verifyStep.outputs);
      assert.ok(outputKeys.length > 0, "verify step should have at least one output");
    });

    it("verification-agent is defined in agents section", () => {
      const definedAgents = new Set(workflow.agents.map((a: any) => a.id));
      assert.ok(definedAgents.has("verification-agent"), "verification-agent should be defined in agents section");
    });

    it("verify step is the last step in the workflow", () => {
      const lastStep = workflow.steps[workflow.steps.length - 1];
      assert.strictEqual(lastStep.id, "verify", "verify should be the last step");
    });
  });

  describe("on_fail configuration", () => {
    it("on_fail is properly structured", () => {
      const verifyStep = workflow.steps.find((s: any) => s.id === "verify");
      assert.ok(verifyStep.on_fail, "should have on_fail");
      assert.strictEqual(typeof verifyStep.on_fail, "object", "on_fail should be an object");
    });

    it("escalate_to value is human", () => {
      const verifyStep = workflow.steps.find((s: any) => s.id === "verify");
      assert.strictEqual(verifyStep.on_fail.escalate_to, "human", "should escalate to human");
    });
  });
});
