/**
 * Tests for script-class-processor transcript-cleaner agent (SCP-003)
 * Validates transcript-cleaner agent definition files and structure.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKFLOW_DIR = path.resolve(__dirname, "..", "workflows", "script-class-processor");
const TRANSCRIPT_CLEANER_DIR = path.join(WORKFLOW_DIR, "agents", "transcript-cleaner");
const AGENTS_MD = path.join(TRANSCRIPT_CLEANER_DIR, "AGENTS.md");
const SOUL_MD = path.join(TRANSCRIPT_CLEANER_DIR, "SOUL.md");
const IDENTITY_MD = path.join(TRANSCRIPT_CLEANER_DIR, "IDENTITY.md");

describe("transcript-cleaner agent (SCP-003)", () => {
  it("has transcript-cleaner agent directory", () => {
    const stats = fs.statSync(TRANSCRIPT_CLEANER_DIR);
    assert.ok(stats.isDirectory(), "transcript-cleaner agent directory should exist");
  });

  it("has AGENTS.md with VTT cleaning instructions", () => {
    const stats = fs.statSync(AGENTS_MD);
    assert.ok(stats.isFile(), "AGENTS.md should exist");
    
    const content = fs.readFileSync(AGENTS_MD, "utf-8");
    assert.ok(content.includes("VTT") || content.includes("WebVTT"), "should mention VTT format");
    assert.ok(content.includes("timestamp"), "should mention timestamp removal");
    assert.ok(content.includes("WEBVTT"), "should mention WEBVTT header");
    assert.ok(content.includes("cleaned"), "should mention cleaned output");
    assert.ok(content.includes("metadata"), "should mention metadata extraction");
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
    assert.ok(content.includes("Name: Transcript Cleaner"), "should have Name: Transcript Cleaner");
    assert.ok(content.includes("Role: Preprocessing"), "should have Role: Preprocessing");
  });

  it("AGENTS.md defines VTT parsing rules correctly", () => {
    const content = fs.readFileSync(AGENTS_MD, "utf-8");
    
    // Check for removal instructions
    assert.ok(content.includes("Remove These"), "should have 'Remove These Elements' section");
    assert.ok(content.includes("Timestamps"), "should mention timestamp removal");
    assert.ok(content.includes("WEBVTT header"), "should mention WEBVTT header removal");
    
    // Check for output paths
    assert.ok(content.includes("transcripts/cleaned/"), "should define cleaned output path");
    assert.ok(content.includes("Session_XX.txt"), "should define cleaned file naming pattern");
  });

  it("AGENTS.md defines metadata extraction requirements", () => {
    const content = fs.readFileSync(AGENTS_MD, "utf-8");
    
    // Check for metadata fields
    assert.ok(content.includes("duration"), "should mention duration extraction");
    assert.ok(content.includes("speaker_count"), "should mention speaker count extraction");
    assert.ok(content.includes("line_count"), "should mention line count extraction");
    
    // Check for metadata output
    assert.ok(content.includes("metadata"), "should mention metadata output");
    assert.ok(content.includes(".json"), "should mention JSON metadata format");
  });

  it("AGENTS.md defines proper output format", () => {
    const content = fs.readFileSync(AGENTS_MD, "utf-8");
    
    assert.ok(content.includes("STATUS:"), "should define STATUS output");
    assert.ok(content.includes("SESSION_ID:"), "should define SESSION_ID output");
    assert.ok(content.includes("CLEANED_FILE:"), "should define CLEANED_FILE output");
    assert.ok(content.includes("METADATA_FILE:"), "should define METADATA_FILE output");
  });

  it("AGENTS.md includes error handling instructions", () => {
    const content = fs.readFileSync(AGENTS_MD, "utf-8");
    
    assert.ok(content.includes("Error Handling"), "should have error handling section");
    assert.ok(content.includes("STATUS: error"), "should define error status format");
  });
});
