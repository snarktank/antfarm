/**
 * Tests for script-class-processor chunk-analyzer agent (SCP-004)
 * Validates chunk-analyzer agent definition files and structure.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKFLOW_DIR = path.resolve(__dirname, "..", "workflows", "script-class-processor");
const CHUNK_ANALYZER_DIR = path.join(WORKFLOW_DIR, "agents", "chunk-analyzer");
const AGENTS_MD = path.join(CHUNK_ANALYZER_DIR, "AGENTS.md");
const SOUL_MD = path.join(CHUNK_ANALYZER_DIR, "SOUL.md");
const IDENTITY_MD = path.join(CHUNK_ANALYZER_DIR, "IDENTITY.md");

describe("chunk-analyzer agent (SCP-004)", () => {
  it("has chunk-analyzer agent directory", () => {
    const stats = fs.statSync(CHUNK_ANALYZER_DIR);
    assert.ok(stats.isDirectory(), "chunk-analyzer agent directory should exist");
  });

  it("has AGENTS.md with chunking strategy instructions", () => {
    const stats = fs.statSync(AGENTS_MD);
    assert.ok(stats.isFile(), "AGENTS.md should exist");
    
    const content = fs.readFileSync(AGENTS_MD, "utf-8");
    assert.ok(content.includes("chunk"), "should mention chunking");
    assert.ok(content.includes("time-based") || content.includes("Time-Based"), "should mention time-based chunking");
    assert.ok(content.includes("5-minute") || content.includes("5 minute"), "should mention 5-minute segments");
    assert.ok(content.includes("cleaned"), "should mention cleaned transcript input");
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
    assert.ok(content.includes("Name: Chunk Analyzer"), "should have Name: Chunk Analyzer");
    assert.ok(content.includes("Role: Segmentation"), "should have Role: Segmentation");
  });

  it("AGENTS.md defines 5-minute time-based chunking", () => {
    const content = fs.readFileSync(AGENTS_MD, "utf-8");
    
    // Check for time-based chunking
    assert.ok(
      content.includes("5-minute") || content.includes("5 minute") || content.includes("300 seconds"),
      "should define 5-minute segments"
    );
    assert.ok(content.includes("duration_seconds"), "should mention duration_seconds for calculation");
    assert.ok(
      content.includes("200") || content.includes("250") || content.includes("300"),
      "should mention lines per chunk (~200-300)"
    );
  });

  it("AGENTS.md defines sequential processing for cumulative topic index", () => {
    const content = fs.readFileSync(AGENTS_MD, "utf-8");
    
    // Check for sequential processing
    assert.ok(
      content.includes("sequential") || content.includes("sequentially"),
      "should mention sequential processing"
    );
    assert.ok(
      content.includes("cumulative") || content.includes("Cumulative"),
      "should mention cumulative topic index"
    );
    assert.ok(content.includes("cumulative_topics"), "should define cumulative_topics field");
  });

  it("AGENTS.md defines chunk_analysis.json output format", () => {
    const content = fs.readFileSync(AGENTS_MD, "utf-8");
    
    // Check for JSON output
    assert.ok(content.includes("chunk_analysis.json"), "should mention chunk_analysis.json output");
    assert.ok(content.includes("chunks"), "should define chunks array");
    assert.ok(content.includes("topics"), "should mention topics per chunk");
    assert.ok(content.includes("cumulative_topic_index"), "should define cumulative_topic_index");
  });

  it("AGENTS.md handles edge case of last chunk being smaller", () => {
    const content = fs.readFileSync(AGENTS_MD, "utf-8");
    
    // Check for edge case handling
    assert.ok(
      content.includes("last chunk") || content.includes("Last Chunk"),
      "should mention last chunk edge case"
    );
    assert.ok(
      content.includes("smaller") || content.includes("Edge Case"),
      "should document smaller last chunk handling"
    );
  });

  it("AGENTS.md defines proper output format", () => {
    const content = fs.readFileSync(AGENTS_MD, "utf-8");
    
    assert.ok(content.includes("STATUS:"), "should define STATUS output");
    assert.ok(content.includes("SESSION_ID:"), "should define SESSION_ID output");
    assert.ok(content.includes("OUTPUT_FILE:"), "should define OUTPUT_FILE output");
    assert.ok(content.includes("TOTAL_CHUNKS:"), "should define TOTAL_CHUNKS output");
  });

  it("AGENTS.md includes error handling instructions", () => {
    const content = fs.readFileSync(AGENTS_MD, "utf-8");
    
    assert.ok(content.includes("Error Handling"), "should have error handling section");
    assert.ok(content.includes("STATUS: error"), "should define error status format");
  });
});
