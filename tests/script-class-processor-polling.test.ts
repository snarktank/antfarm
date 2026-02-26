/**
 * SCP-013: Polling Configuration Tests
 * Tests for workflow.yml polling section
 */
import { test } from "node:test";
import * as assert from "node:assert/strict";
import * as fs from "node:fs";
import * as yaml from "yaml";
import * as path from "node:path";

const WORKFLOW_PATH = path.join(
  process.cwd(),
  "workflows/script-class-processor/workflow.yml"
);

let workflow: any;

test("setup: load workflow.yml", () => {
  const content = fs.readFileSync(WORKFLOW_PATH, "utf-8");
  workflow = yaml.parse(content);
  assert.ok(workflow, "Workflow should parse");
});

// ============================================================================
// Polling Configuration Tests
// ============================================================================

test("polling section exists", () => {
  assert.ok(workflow.polling, "polling section should exist");
});

test("polling.model is set to 'default'", () => {
  assert.strictEqual(workflow.polling.model, "default", "polling.model should be 'default'");
});

test("polling.timeoutSeconds exists", () => {
  assert.ok(workflow.polling.timeoutSeconds !== undefined, "polling.timeoutSeconds should exist");
});

test("polling.timeoutSeconds is a number", () => {
  assert.strictEqual(typeof workflow.polling.timeoutSeconds, "number", "polling.timeoutSeconds should be a number");
});

test("polling.timeoutSeconds is set to 1800 (30 minutes)", () => {
  assert.strictEqual(workflow.polling.timeoutSeconds, 1800, "polling.timeoutSeconds should be 1800 seconds (30 minutes) for long transcript processing");
});

test("polling.timeoutSeconds is greater than default (120)", () => {
  assert.ok(workflow.polling.timeoutSeconds > 120, "polling.timeoutSeconds should be greater than default 120 seconds");
});

test("polling.timeoutSeconds is appropriate for 2000-3000 line files", () => {
  // 1800 seconds = 30 minutes, which is appropriate for processing long transcripts
  assert.ok(workflow.polling.timeoutSeconds >= 1800, "timeout should be at least 1800s for long transcript processing");
});

// ============================================================================
// YAML Structure Validation
// ============================================================================

test("polling section has exactly 2 properties", () => {
  const keys = Object.keys(workflow.polling);
  assert.strictEqual(keys.length, 2, "polling section should have exactly 2 properties");
  assert.ok(keys.includes("model"), "polling should have 'model' property");
  assert.ok(keys.includes("timeoutSeconds"), "polling should have 'timeoutSeconds' property");
});

test("polling section follows antfarm conventions", () => {
  // Antfarm polling convention: model and timeoutSeconds
  const validModels = ["default", "fast", "slow"];
  assert.ok(
    validModels.includes(workflow.polling.model) || typeof workflow.polling.model === "string",
    "polling.model should be a valid model identifier"
  );
  assert.ok(workflow.polling.timeoutSeconds > 0, "polling.timeoutSeconds should be positive");
});

// ============================================================================
// Top-Level Workflow Structure
// ============================================================================

test("workflow has all required top-level sections", () => {
  const requiredSections = ["id", "name", "version", "description", "polling", "agents", "steps"];
  for (const section of requiredSections) {
    assert.ok(workflow[section] !== undefined, `workflow should have ${section} section`);
  }
});

test("polling section comes after description and before agents", () => {
  const content = fs.readFileSync(WORKFLOW_PATH, "utf-8");
  const descIndex = content.indexOf("description:");
  const pollingIndex = content.indexOf("polling:");
  const agentsIndex = content.indexOf("agents:");
  
  assert.ok(descIndex < pollingIndex, "description should come before polling");
  assert.ok(pollingIndex < agentsIndex, "polling should come before agents");
});
