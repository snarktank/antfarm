/**
 * Tests for script-class-processor workflow.yml steps section Phase 1 (SCP-010)
 * Validates steps 1-3: detect, preprocess, chunk
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

describe("workflow.yml steps section Phase 1 (SCP-010)", () => {
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

  describe("step 1: detect", () => {
    let step: any;

    it("exists in steps array", () => {
      step = workflow.steps.find((s: any) => s.id === "detect");
      assert.ok(step, "detect step should exist");
    });

    it("has correct agent assignment", () => {
      assert.strictEqual(step.agent, "file-watcher", "should use file-watcher agent");
    });

    it("has input template with {{task}} variable", () => {
      assert.ok(step.input, "should have input template");
      assert.ok(step.input.includes("{{task}}"), "input should reference {{task}} variable");
    });

    it("expects STATUS: done", () => {
      assert.ok(step.expects, "should have expects field");
      assert.ok(step.expects.includes("STATUS: done"), "should expect STATUS: done");
    });

    it("outputs session_id", () => {
      assert.ok(step.outputs, "should have outputs");
      assert.ok(step.outputs.session_id, "should output session_id");
    });

    it("outputs file_path", () => {
      assert.ok(step.outputs, "should have outputs");
      assert.ok(step.outputs.file_path, "should output file_path");
    });

    it("input describes detection task", () => {
      assert.ok(step.input.toLowerCase().includes("detect"), "input should mention detection");
      assert.ok(step.input.includes(".vtt"), "input should mention .vtt files");
      assert.ok(step.input.includes("transcripts/raw/"), "input should mention transcripts/raw/ directory");
    });
  });

  describe("step 2: preprocess", () => {
    let step: any;

    it("exists in steps array", () => {
      step = workflow.steps.find((s: any) => s.id === "preprocess");
      assert.ok(step, "preprocess step should exist");
    });

    it("has correct agent assignment", () => {
      assert.strictEqual(step.agent, "transcript-cleaner", "should use transcript-cleaner agent");
    });

    it("has input template with {{session_id}} variable", () => {
      assert.ok(step.input, "should have input template");
      assert.ok(step.input.includes("{{session_id}}"), "input should reference {{session_id}} variable");
    });

    it("has input template with {{file_path}} variable", () => {
      assert.ok(step.input, "should have input template");
      assert.ok(step.input.includes("{{file_path}}"), "input should reference {{file_path}} variable");
    });

    it("expects STATUS: done", () => {
      assert.ok(step.expects, "should have expects field");
      assert.ok(step.expects.includes("STATUS: done"), "should expect STATUS: done");
    });

    it("outputs cleaned_path", () => {
      assert.ok(step.outputs, "should have outputs");
      assert.ok(step.outputs.cleaned_path, "should output cleaned_path");
    });

    it("outputs metadata_path", () => {
      assert.ok(step.outputs, "should have outputs");
      assert.ok(step.outputs.metadata_path, "should output metadata_path");
    });

    it("input describes cleaning task", () => {
      assert.ok(step.input.toLowerCase().includes("clean"), "input should mention cleaning");
      assert.ok(step.input.toLowerCase().includes("vtt"), "input should mention VTT");
      assert.ok(step.input.toLowerCase().includes("timestamp"), "input should mention timestamps");
    });
  });

  describe("step 3: chunk", () => {
    let step: any;

    it("exists in steps array", () => {
      step = workflow.steps.find((s: any) => s.id === "chunk");
      assert.ok(step, "chunk step should exist");
    });

    it("has correct agent assignment", () => {
      assert.strictEqual(step.agent, "chunk-analyzer", "should use chunk-analyzer agent");
    });

    it("has input template referencing cleaned transcript", () => {
      assert.ok(step.input, "should have input template");
      assert.ok(step.input.includes("{{cleaned_path}}"), "input should reference {{cleaned_path}} variable");
    });

    it("has input template referencing metadata", () => {
      assert.ok(step.input, "should have input template");
      assert.ok(step.input.includes("{{metadata_path}}"), "input should reference {{metadata_path}} variable");
    });

    it("expects STATUS: done", () => {
      assert.ok(step.expects, "should have expects field");
      assert.ok(step.expects.includes("STATUS: done"), "should expect STATUS: done");
    });

    it("outputs chunk_analysis_path", () => {
      assert.ok(step.outputs, "should have outputs");
      assert.ok(step.outputs.chunk_analysis_path, "should output chunk_analysis_path");
    });

    it("input describes chunking task", () => {
      assert.ok(step.input.toLowerCase().includes("chunk"), "input should mention chunking");
      assert.ok(step.input.includes("5 minutes") || step.input.includes("200-300"), 
        "input should mention chunk size criteria");
    });
  });

  describe("step chaining", () => {
    it("has steps in correct order", () => {
      const expectedOrder = ["detect", "preprocess", "chunk"];
      const actualOrder = workflow.steps.slice(0, 3).map((s: any) => s.id);
      assert.deepStrictEqual(actualOrder, expectedOrder, "steps should be in correct order");
    });

    it("preprocess step receives detect outputs", () => {
      const detectStep = workflow.steps.find((s: any) => s.id === "detect");
      const preprocessStep = workflow.steps.find((s: any) => s.id === "preprocess");
      
      assert.ok(detectStep, "detect step should exist");
      assert.ok(preprocessStep, "preprocess step should exist");
      
      // preprocess should use session_id from detect
      assert.ok(preprocessStep.input.includes("{{session_id}}"), 
        "preprocess should reference session_id from detect");
      
      // preprocess should use file_path from detect
      assert.ok(preprocessStep.input.includes("{{file_path}}"), 
        "preprocess should reference file_path from detect");
    });

    it("chunk step receives preprocess outputs", () => {
      const preprocessStep = workflow.steps.find((s: any) => s.id === "preprocess");
      const chunkStep = workflow.steps.find((s: any) => s.id === "chunk");
      
      assert.ok(preprocessStep, "preprocess step should exist");
      assert.ok(chunkStep, "chunk step should exist");
      
      // chunk should use cleaned_path from preprocess
      assert.ok(chunkStep.input.includes("{{cleaned_path}}"), 
        "chunk should reference cleaned_path from preprocess");
      
      // chunk should use metadata_path from preprocess
      assert.ok(chunkStep.input.includes("{{metadata_path}}"), 
        "chunk should reference metadata_path from preprocess");
    });
  });

  describe("step structure completeness", () => {
    it("all steps have required fields", () => {
      for (const step of workflow.steps) {
        assert.ok(step.id, "step should have id");
        assert.ok(step.agent, `step ${step.id} should have agent`);
        assert.ok(step.input, `step ${step.id} should have input`);
        assert.ok(step.expects, `step ${step.id} should have expects`);
        assert.ok(step.outputs, `step ${step.id} should have outputs`);
        
        // Verify outputs is an object with at least one key
        const outputKeys = Object.keys(step.outputs);
        assert.ok(outputKeys.length > 0, `step ${step.id} should have at least one output`);
      }
    });

    it("no duplicate step ids", () => {
      const ids = workflow.steps.map((s: any) => s.id);
      const uniqueIds = new Set(ids);
      assert.strictEqual(uniqueIds.size, ids.length, "should have no duplicate step ids");
    });
  });
});
