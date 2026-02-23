/**
 * Tests for script-class-processor workflow structure (SCP-001)
 * Validates directory structure and workflow.yml configuration.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKFLOW_DIR = path.resolve(__dirname, "..", "workflows", "script-class-processor");
const WORKFLOW_YML = path.join(WORKFLOW_DIR, "workflow.yml");

describe("script-class-processor workflow structure (SCP-001)", () => {
  it("has workflow directory", () => {
    const stats = fs.statSync(WORKFLOW_DIR);
    assert.ok(stats.isDirectory(), "workflow directory should exist");
  });

  it("has agents subdirectory", () => {
    const agentsDir = path.join(WORKFLOW_DIR, "agents");
    const stats = fs.statSync(agentsDir);
    assert.ok(stats.isDirectory(), "agents subdirectory should exist");
  });

  it("has workflow.yml file", () => {
    const stats = fs.statSync(WORKFLOW_YML);
    assert.ok(stats.isFile(), "workflow.yml should exist");
  });

  it("workflow.yml has valid YAML structure with required fields", () => {
    const content = fs.readFileSync(WORKFLOW_YML, "utf-8");
    
    // Check for required fields (YAML format)
    assert.ok(content.includes("id: script-class-processor"), "should have id: script-class-processor");
    assert.ok(content.includes("name:"), "should have name field");
    assert.ok(content.includes("version:"), "should have version field");
    assert.ok(content.includes("description:"), "should have description field");
  });

  it("workflow.yml id field has correct value", () => {
    const content = fs.readFileSync(WORKFLOW_YML, "utf-8");
    
    // Parse the id field more strictly
    const idMatch = content.match(/^id:\s*(.+)$/m);
    assert.ok(idMatch, "should have id field in YAML");
    assert.strictEqual(idMatch[1].trim(), "script-class-processor", "id should be 'script-class-processor'");
  });
});
