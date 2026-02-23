/**
 * Tests for script-class-processor verification-agent (SCP-008)
 * Validates verification-agent agent definition files and structure.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKFLOW_DIR = path.resolve(__dirname, "..", "workflows", "script-class-processor");
const VERIFICATION_AGENT_DIR = path.join(WORKFLOW_DIR, "agents", "verification-agent");
const AGENTS_MD = path.join(VERIFICATION_AGENT_DIR, "AGENTS.md");
const SOUL_MD = path.join(VERIFICATION_AGENT_DIR, "SOUL.md");
const IDENTITY_MD = path.join(VERIFICATION_AGENT_DIR, "IDENTITY.md");

describe("verification-agent (SCP-008)", () => {
  it("has verification-agent directory", () => {
    const stats = fs.statSync(VERIFICATION_AGENT_DIR);
    assert.ok(stats.isDirectory(), "verification-agent directory should exist");
  });

  it("has AGENTS.md with verification instructions", () => {
    const stats = fs.statSync(AGENTS_MD);
    assert.ok(stats.isFile(), "AGENTS.md should exist");
    
    const content = fs.readFileSync(AGENTS_MD, "utf-8");
    assert.ok(content.includes("verify") || content.includes("validation") || content.includes("Verification"), "should mention verification");
    assert.ok(content.includes("check") || content.includes("Check"), "should mention check");
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
    assert.ok(content.includes("Name: Verification Agent"), "should have Name: Verification Agent");
    assert.ok(content.includes("Role: Quality Assurance"), "should have Role: Quality Assurance");
  });

  it("AGENTS.md defines file existence check", () => {
    const content = fs.readFileSync(AGENTS_MD, "utf-8");
    
    assert.ok(content.includes("File Existence"), "should have file existence check");
    assert.ok(content.includes("exists") || content.includes("exist"), "should check file existence");
  });

  it("AGENTS.md defines format compliance check", () => {
    const content = fs.readFileSync(AGENTS_MD, "utf-8");
    
    assert.ok(content.includes("Format Compliance"), "should have format compliance check");
    assert.ok(content.includes("JSON"), "should mention JSON validation");
  });

  it("AGENTS.md defines timestamp validation (HH:MM:SS)", () => {
    const content = fs.readFileSync(AGENTS_MD, "utf-8");
    
    assert.ok(content.includes("HH:MM:SS"), "should mention HH:MM:SS timestamp format");
    assert.ok(content.includes("timestamp") || content.includes("Timestamp"), "should have timestamp validation");
  });

  it("AGENTS.md defines quiz question type validation", () => {
    const content = fs.readFileSync(AGENTS_MD, "utf-8");
    
    assert.ok(content.includes("quiz") || content.includes("Quiz"), "should mention quiz validation");
    assert.ok(
      content.includes("Quick Check") && 
      content.includes("Concept Check") &&
      content.includes("Scenario Practice") &&
      content.includes("Flashcards"),
      "should validate all 4 quiz question types"
    );
  });

  it("AGENTS.md defines completion_report.json output", () => {
    const content = fs.readFileSync(AGENTS_MD, "utf-8");
    
    assert.ok(content.includes("completion_report.json"), "should mention completion_report.json output");
    assert.ok(content.includes("transcripts/metadata/"), "should output to transcripts/metadata/ directory");
  });

  it("AGENTS.md defines overall status (passed/failed/partial)", () => {
    const content = fs.readFileSync(AGENTS_MD, "utf-8");
    
    assert.ok(content.includes('"passed"') || content.includes("passed"), "should define passed status");
    assert.ok(content.includes('"failed"') || content.includes("failed"), "should define failed status");
    assert.ok(content.includes('"partial"') || content.includes("partial"), "should define partial status");
  });

  it("AGENTS.md includes verification checklist", () => {
    const content = fs.readFileSync(AGENTS_MD, "utf-8");
    
    assert.ok(content.includes("Checklist") || content.includes("checklist"), "should have verification checklist");
    assert.ok(content.includes("transcripts/cleaned/"), "should check cleaned transcript");
    assert.ok(content.includes("transcripts/metadata/"), "should check metadata");
    assert.ok(content.includes("transcripts/notes/"), "should check notes");
    assert.ok(content.includes("transcripts/quizzes/"), "should check quizzes");
  });

  it("AGENTS.md includes error handling instructions", () => {
    const content = fs.readFileSync(AGENTS_MD, "utf-8");
    
    assert.ok(content.includes("Error Handling"), "should have error handling section");
    assert.ok(content.includes("STATUS: error"), "should define error status format");
  });

  it("AGENTS.md defines step reply format", () => {
    const content = fs.readFileSync(AGENTS_MD, "utf-8");
    
    assert.ok(content.includes("Step Reply Format"), "should have step reply format section");
    assert.ok(content.includes("OVERALL_STATUS:"), "should define OVERALL_STATUS output");
    assert.ok(content.includes("FILES_CHECKED:"), "should define FILES_CHECKED output");
    assert.ok(content.includes("ERRORS_FOUND:"), "should define ERRORS_FOUND output");
  });
});
