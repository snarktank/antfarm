/**
 * Tests for script-class-processor file-watcher agent (SCP-002)
 * Validates file-watcher agent definition files and structure.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKFLOW_DIR = path.resolve(__dirname, "..", "workflows", "script-class-processor");
const FILE_WATCHER_DIR = path.join(WORKFLOW_DIR, "agents", "file-watcher");
const AGENTS_MD = path.join(FILE_WATCHER_DIR, "AGENTS.md");
const SOUL_MD = path.join(FILE_WATCHER_DIR, "SOUL.md");
const IDENTITY_MD = path.join(FILE_WATCHER_DIR, "IDENTITY.md");

describe("file-watcher agent (SCP-002)", () => {
  it("has file-watcher agent directory", () => {
    const stats = fs.statSync(FILE_WATCHER_DIR);
    assert.ok(stats.isDirectory(), "file-watcher agent directory should exist");
  });

  it("has AGENTS.md with detection instructions", () => {
    const stats = fs.statSync(AGENTS_MD);
    assert.ok(stats.isFile(), "AGENTS.md should exist");
    
    const content = fs.readFileSync(AGENTS_MD, "utf-8");
    assert.ok(content.includes("detect"), "should mention detection");
    assert.ok(content.includes(".vtt"), "should mention .vtt files");
    assert.ok(content.includes("transcripts"), "should mention transcripts directory");
    assert.ok(content.includes("session_id"), "should mention session_id extraction");
    assert.ok(content.includes("file_path"), "should mention file_path output");
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
    assert.ok(content.includes("Name: File Watcher"), "should have Name: File Watcher");
    assert.ok(content.includes("Role: Detection"), "should have Role: Detection");
  });

  it("AGENTS.md extracts session_id from filename correctly", () => {
    const content = fs.readFileSync(AGENTS_MD, "utf-8");
    
    // Check for filename pattern documentation
    assert.ok(content.includes("Session_XX"), "should document Session_XX pattern");
    assert.ok(content.includes("session_id"), "should document session_id output");
    
    // Verify extraction examples are present
    assert.ok(
      content.includes("Session_01.vtt") || content.includes("Session_05.vtt"),
      "should have filename examples"
    );
  });

  it("AGENTS.md defines proper output format", () => {
    const content = fs.readFileSync(AGENTS_MD, "utf-8");
    
    assert.ok(content.includes("STATUS:"), "should define STATUS output");
    assert.ok(content.includes("SESSION_ID:"), "should define SESSION_ID output");
    assert.ok(content.includes("FILE_PATH:"), "should define FILE_PATH output");
  });
});
