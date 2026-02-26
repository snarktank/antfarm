/**
 * Tests for script-class-processor jump-guide-generator agent (SCP-005)
 * Validates jump-guide-generator agent definition files and structure.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKFLOW_DIR = path.resolve(__dirname, "..", "workflows", "script-class-processor");
const JUMP_GUIDE_GENERATOR_DIR = path.join(WORKFLOW_DIR, "agents", "jump-guide-generator");
const AGENTS_MD = path.join(JUMP_GUIDE_GENERATOR_DIR, "AGENTS.md");
const SOUL_MD = path.join(JUMP_GUIDE_GENERATOR_DIR, "SOUL.md");
const IDENTITY_MD = path.join(JUMP_GUIDE_GENERATOR_DIR, "IDENTITY.md");

describe("jump-guide-generator agent (SCP-005)", () => {
  it("has jump-guide-generator agent directory", () => {
    const stats = fs.statSync(JUMP_GUIDE_GENERATOR_DIR);
    assert.ok(stats.isDirectory(), "jump-guide-generator agent directory should exist");
  });

  it("has AGENTS.md with jump guide creation instructions", () => {
    const stats = fs.statSync(AGENTS_MD);
    assert.ok(stats.isFile(), "AGENTS.md should exist");
    
    const content = fs.readFileSync(AGENTS_MD, "utf-8");
    assert.ok(content.includes("jump"), "should mention jump navigation");
    assert.ok(content.includes("timestamp"), "should mention timestamps");
    assert.ok(content.includes("chunk_analysis.json"), "should mention chunk_analysis.json input");
  });

  it("has SOUL.md with agent persona", () => {
    const stats = fs.statSync(SOUL_MD);
    assert.ok(stats.isFile(), "SOUL.md should exist");
    
    const content = fs.readFileSync(SOUL_MD, "utf-8");
    assert.ok(content.includes("Who You Are"), "should have 'Who You Are' section");
    assert.ok(content.includes("Core Truths"), "should have 'Core Truths' section");
  });

  it("has IDENTITY.md with correct identity", () => {
    const stats = fs.statSync(IDENTITY_MD);
    assert.ok(stats.isFile(), "IDENTITY.md should exist");
    
    const content = fs.readFileSync(IDENTITY_MD, "utf-8");
    assert.ok(content.includes("Name: Jump Guide Generator"), "should have Name: Jump Guide Generator");
    assert.ok(content.includes("Role: Navigation"), "should have Role: Navigation");
  });

  it("AGENTS.md defines HH:MM:SS timestamp format", () => {
    const content = fs.readFileSync(AGENTS_MD, "utf-8");
    
    // Check for timestamp format
    assert.ok(
      content.includes("HH:MM:SS"),
      "should define HH:MM:SS timestamp format"
    );
    assert.ok(
      content.includes("00:00:00") || content.includes("00:05:30"),
      "should include timestamp examples"
    );
  });

  it("AGENTS.md defines reading chunk_analysis.json", () => {
    const content = fs.readFileSync(AGENTS_MD, "utf-8");
    
    // Check for chunk analysis input
    assert.ok(
      content.includes("chunk_analysis.json"),
      "should mention chunk_analysis.json as input"
    );
    assert.ok(
      content.includes("chunks") || content.includes("estimated_start_time"),
      "should reference chunk data fields"
    );
  });

  it("AGENTS.md defines topic transition identification", () => {
    const content = fs.readFileSync(AGENTS_MD, "utf-8");
    
    // Check for topic transition handling
    assert.ok(
      content.includes("transition") || content.includes("Transition"),
      "should mention topic transitions"
    );
    assert.ok(
      content.includes("new_topics_introduced"),
      "should reference new_topics_introduced flag"
    );
  });

  it("AGENTS.md defines demo section marking", () => {
    const content = fs.readFileSync(AGENTS_MD, "utf-8");
    
    // Check for demo detection
    assert.ok(
      content.includes("demo") || content.includes("Demo"),
      "should mention demos"
    );
    assert.ok(
      content.includes("demonstration") || content.includes("example"),
      "should mention demonstration or example detection"
    );
  });

  it("AGENTS.md defines exam tips marking", () => {
    const content = fs.readFileSync(AGENTS_MD, "utf-8");
    
    // Check for exam tip detection
    assert.ok(
      content.includes("exam") || content.includes("Exam"),
      "should mention exam tips"
    );
    assert.ok(
      content.includes("certification") || content.includes("tip"),
      "should mention certification or tips"
    );
  });

  it("AGENTS.md defines video_jump_guide.md output", () => {
    const content = fs.readFileSync(AGENTS_MD, "utf-8");
    
    // Check for output file
    assert.ok(
      content.includes("video_jump_guide.md"),
      "should mention video_jump_guide.md output"
    );
    assert.ok(
      content.includes("transcripts/guides/"),
      "should define transcripts/guides/ output directory"
    );
  });

  it("AGENTS.md includes structured navigation tables", () => {
    const content = fs.readFileSync(AGENTS_MD, "utf-8");
    
    // Check for table structures
    assert.ok(content.includes("Quick Navigation"), "should have Quick Navigation section");
    assert.ok(content.includes("Main Topics"), "should have Main Topics table");
    assert.ok(
      content.includes("|") || content.includes("table"),
      "should use markdown tables"
    );
  });

  it("AGENTS.md defines proper output format", () => {
    const content = fs.readFileSync(AGENTS_MD, "utf-8");
    
    assert.ok(content.includes("STATUS:"), "should define STATUS output");
    assert.ok(content.includes("SESSION_ID:"), "should define SESSION_ID output");
    assert.ok(content.includes("OUTPUT_FILE:"), "should define OUTPUT_FILE output");
    assert.ok(content.includes("DEMO_COUNT:"), "should define DEMO_COUNT output");
    assert.ok(content.includes("EXAM_TIP_COUNT:"), "should define EXAM_TIP_COUNT output");
  });

  it("AGENTS.md includes error handling instructions", () => {
    const content = fs.readFileSync(AGENTS_MD, "utf-8");
    
    assert.ok(content.includes("Error Handling"), "should have error handling section");
    assert.ok(content.includes("STATUS: error"), "should define error status format");
  });
});
