/**
 * Tests for script-class-processor notes-generator agent (SCP-006)
 * Validates notes-generator agent definition files and structure.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKFLOW_DIR = path.resolve(__dirname, "..", "workflows", "script-class-processor");
const NOTES_GENERATOR_DIR = path.join(WORKFLOW_DIR, "agents", "notes-generator");
const AGENTS_MD = path.join(NOTES_GENERATOR_DIR, "AGENTS.md");
const SOUL_MD = path.join(NOTES_GENERATOR_DIR, "SOUL.md");
const IDENTITY_MD = path.join(NOTES_GENERATOR_DIR, "IDENTITY.md");

describe("notes-generator agent (SCP-006)", () => {
  it("has notes-generator agent directory", () => {
    const stats = fs.statSync(NOTES_GENERATOR_DIR);
    assert.ok(stats.isDirectory(), "notes-generator agent directory should exist");
  });

  it("has AGENTS.md with notes generation instructions", () => {
    const stats = fs.statSync(AGENTS_MD);
    assert.ok(stats.isFile(), "AGENTS.md should exist");
    
    const content = fs.readFileSync(AGENTS_MD, "utf-8");
    assert.ok(content.includes("notes"), "should mention notes");
    assert.ok(content.includes("transcript"), "should mention transcripts");
    assert.ok(content.includes("cleaned"), "should mention cleaned transcript");
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
    assert.ok(content.includes("Name: Notes Generator"), "should have Name: Notes Generator");
    assert.ok(content.includes("Role: Documentation"), "should have Role: Documentation");
  });

  it("AGENTS.md defines cleaned transcript input", () => {
    const content = fs.readFileSync(AGENTS_MD, "utf-8");
    
    // Check for cleaned transcript input
    assert.ok(
      content.includes("cleaned/Session"),
      "should define cleaned transcript input path"
    );
    assert.ok(
      content.includes(".txt"),
      "should reference .txt file extension"
    );
  });

  it("AGENTS.md defines jump guide input", () => {
    const content = fs.readFileSync(AGENTS_MD, "utf-8");
    
    // Check for jump guide input
    assert.ok(
      content.includes("video_jump_guide.md"),
      "should mention video_jump_guide.md as input"
    );
    assert.ok(
      content.includes("guides/"),
      "should reference guides directory"
    );
  });

  it("AGENTS.md defines using jump guide as structure", () => {
    const content = fs.readFileSync(AGENTS_MD, "utf-8");
    
    // Check for structure guidance
    assert.ok(
      content.includes("jump guide"),
      "should mention using jump guide as structure"
    );
    assert.ok(
      content.includes("structure"),
      "should mention structure"
    );
  });

  it("AGENTS.md defines standard sections", () => {
    const content = fs.readFileSync(AGENTS_MD, "utf-8");
    
    // Check for standard sections
    assert.ok(content.includes("Executive Summary"), "should have Executive Summary section");
    assert.ok(content.includes("Key Concepts"), "should have Key Concepts section");
    assert.ok(content.includes("Code Examples"), "should have Code Examples section");
  });

  it("AGENTS.md defines cross-references from cross_links.json", () => {
    const content = fs.readFileSync(AGENTS_MD, "utf-8");
    
    // Check for cross-links handling
    assert.ok(
      content.includes("cross_links.json"),
      "should mention cross_links.json"
    );
    assert.ok(
      content.includes("Related Sessions") || content.includes("cross-reference"),
      "should mention related sessions or cross-references"
    );
  });

  it("AGENTS.md defines notes.md output", () => {
    const content = fs.readFileSync(AGENTS_MD, "utf-8");
    
    // Check for output file
    assert.ok(
      content.includes("notes.md"),
      "should mention notes.md output"
    );
    assert.ok(
      content.includes("transcripts/notes/"),
      "should define transcripts/notes/ output directory"
    );
  });

  it("AGENTS.md includes timestamps from jump guide", () => {
    const content = fs.readFileSync(AGENTS_MD, "utf-8");
    
    // Check for timestamp usage
    assert.ok(content.includes("Timestamp"), "should mention Timestamps");
    assert.ok(
      content.includes("HH:MM:SS") || content.includes("00:"),
      "should include timestamp format"
    );
  });

  it("AGENTS.md defines summary section content", () => {
    const content = fs.readFileSync(AGENTS_MD, "utf-8");
    
    assert.ok(content.includes("summary"), "should mention summary");
    assert.ok(content.includes("Session Overview"), "should have Session Overview");
  });

  it("AGENTS.md defines proper output format", () => {
    const content = fs.readFileSync(AGENTS_MD, "utf-8");
    
    assert.ok(content.includes("STATUS:"), "should define STATUS output");
    assert.ok(content.includes("SESSION_ID:"), "should define SESSION_ID output");
    assert.ok(content.includes("OUTPUT_FILE:"), "should define OUTPUT_FILE output");
    assert.ok(content.includes("SECTIONS_CREATED:"), "should define SECTIONS_CREATED output");
    assert.ok(content.includes("CODE_EXAMPLES:"), "should define CODE_EXAMPLES output");
  });

  it("AGENTS.md includes error handling instructions", () => {
    const content = fs.readFileSync(AGENTS_MD, "utf-8");
    
    assert.ok(content.includes("Error Handling"), "should have error handling section");
    assert.ok(content.includes("STATUS: error"), "should define error status format");
  });
});
