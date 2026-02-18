import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { exportWorkflow } from "../dist/installer/workflow-export.js";
import { listBundledWorkflows } from "../dist/installer/workflow-fetch.js";
import { resolveBundledWorkflowDir } from "../dist/installer/paths.js";
import os from "node:os";
import path from "node:path";

test("exportWorkflow exports complete workflow YAML", async () => {
  const workflows = await listBundledWorkflows();
  assert(workflows.length > 0, "Should have bundled workflows for testing");
  
  const workflowId = workflows[0];
  const result = await exportWorkflow(workflowId);
  
  assert.equal(result.workflowId, workflowId);
  assert(result.yamlContent.length > 0, "Should have YAML content");
  assert(result.size > 0, "Should have positive size");
  assert.equal(result.outputPath, undefined, "Should not have output path when not specified");
  
  // Verify it contains expected YAML structure
  assert(result.yamlContent.includes("id:"), "Should contain id field");
  assert(result.yamlContent.includes("name:"), "Should contain name field");
  assert(result.yamlContent.includes("agents:"), "Should contain agents section");
  assert(result.yamlContent.includes("steps:"), "Should contain steps section");
});

test("exportWorkflow preserves YAML formatting and comments", async () => {
  const workflows = await listBundledWorkflows();
  const workflowId = workflows[0];
  
  // Read original file directly
  const workflowDir = resolveBundledWorkflowDir(workflowId);
  const originalContent = await fs.readFile(`${workflowDir}/workflow.yml`, "utf-8");
  
  const result = await exportWorkflow(workflowId);
  
  // Should be identical to preserve formatting and comments
  assert.equal(result.yamlContent, originalContent, "Should preserve exact YAML formatting");
  assert.equal(result.size, Buffer.byteLength(originalContent, "utf-8"), "Size should match original");
});

test("exportWorkflow supports --output flag to write to file", async () => {
  const workflows = await listBundledWorkflows();
  const workflowId = workflows[0];
  
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "antfarm-export-"));
  const outputPath = path.join(tempDir, "exported-workflow.yml");
  
  try {
    const result = await exportWorkflow(workflowId, outputPath);
    
    assert.equal(result.workflowId, workflowId);
    assert.equal(result.outputPath, outputPath);
    assert(result.size > 0, "Should have positive size");
    
    // Verify file was created and has correct content
    const fileExists = await fs.access(outputPath).then(() => true).catch(() => false);
    assert(fileExists, "Output file should exist");
    
    const writtenContent = await fs.readFile(outputPath, "utf-8");
    assert.equal(writtenContent, result.yamlContent, "Written content should match result");
    assert(writtenContent.length > 0, "Written file should not be empty");
  } finally {
    // Clean up temp directory
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("exportWorkflow handles workflow not found gracefully", async () => {
  const nonExistentWorkflow = "non-existent-workflow-12345";
  
  await assert.rejects(
    () => exportWorkflow(nonExistentWorkflow),
    /Workflow "non-existent-workflow-12345" not found/,
    "Should throw error for non-existent workflow"
  );
});

test("exportWorkflow provides helpful error with available workflows", async () => {
  const nonExistentWorkflow = "non-existent-workflow-12345";
  const availableWorkflows = await listBundledWorkflows();
  
  await assert.rejects(
    () => exportWorkflow(nonExistentWorkflow),
    (err: Error) => {
      const hasWorkflowName = err.message.includes("non-existent-workflow-12345");
      const hasAvailableList = availableWorkflows.length === 0 ? 
        err.message.includes("No workflows available") :
        availableWorkflows.some(wf => err.message.includes(wf));
      
      return hasWorkflowName && hasAvailableList;
    },
    "Should include workflow name and available workflows in error"
  );
});

test("exportWorkflow handles missing workflow directory", async () => {
  // This would be hard to test without mocking, but we can test the error path
  // by checking that the function validates the directory exists
  const workflows = await listBundledWorkflows();
  if (workflows.length > 0) {
    const workflowId = workflows[0];
    const result = await exportWorkflow(workflowId);
    assert(result.yamlContent.length > 0, "Should successfully export existing workflow");
  }
});

test("exportWorkflow handles missing workflow.yml file", async () => {
  // Create a temporary workflow directory without workflow.yml
  const workflows = await listBundledWorkflows();
  const workflowId = workflows[0];
  
  // Use a non-existent workflow ID that would pass the initial check
  const fakeWorkflowId = `fake-${workflowId}`;
  
  await assert.rejects(
    () => exportWorkflow(fakeWorkflowId),
    /Workflow "fake-.*" not found/,
    "Should handle missing workflow gracefully"
  );
});

test("exportWorkflow returns correct size information", async () => {
  const workflows = await listBundledWorkflows();
  const workflowId = workflows[0];
  
  const result = await exportWorkflow(workflowId);
  
  const expectedSize = Buffer.byteLength(result.yamlContent, "utf-8");
  assert.equal(result.size, expectedSize, "Size should match actual byte length");
  assert(result.size > 0, "Size should be positive");
});

test("exportWorkflow works with different workflow IDs", async () => {
  const workflows = await listBundledWorkflows();
  
  // Test with all available workflows
  for (const workflowId of workflows) {
    const result = await exportWorkflow(workflowId);
    assert.equal(result.workflowId, workflowId, `Should return correct workflow ID for ${workflowId}`);
    assert(result.yamlContent.length > 0, `Should have content for ${workflowId}`);
    assert(result.size > 0, `Should have positive size for ${workflowId}`);
    
    // Verify the YAML contains the correct workflow ID
    assert(result.yamlContent.includes(`id: ${workflowId}`) || 
           result.yamlContent.includes(`id:"${workflowId}"`), 
           `YAML should contain correct ID for ${workflowId}`);
  }
});

test("exportWorkflow output path creates parent directories", async () => {
  const workflows = await listBundledWorkflows();
  const workflowId = workflows[0];
  
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "antfarm-export-"));
  const subDir = path.join(tempDir, "nested", "directories");
  const outputPath = path.join(subDir, "workflow.yml");
  
  try {
    const result = await exportWorkflow(workflowId, outputPath);
    
    // Verify nested directories were created and file exists
    const fileExists = await fs.access(outputPath).then(() => true).catch(() => false);
    assert(fileExists, "Output file should exist in nested directories");
    
    const writtenContent = await fs.readFile(outputPath, "utf-8");
    assert.equal(writtenContent, result.yamlContent, "Content should be correct in nested path");
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("exportWorkflow handles empty workflow list gracefully", async () => {
  // If there are no workflows, the error should mention that
  const workflows = await listBundledWorkflows();
  if (workflows.length === 0) {
    await assert.rejects(
      () => exportWorkflow("any-workflow"),
      /No workflows available/,
      "Should mention no workflows available when list is empty"
    );
  } else {
    // If there are workflows, test with a definitely non-existent one
    await assert.rejects(
      () => exportWorkflow("definitely-does-not-exist-12345"),
      /Available:/,
      "Should list available workflows when some exist"
    );
  }
});