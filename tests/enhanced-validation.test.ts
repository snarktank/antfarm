import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runWorkflow } from "../dist/installer/run.js";
import { resolveWorkflowDir, resolveBundledWorkflowsDir, resolveBundledWorkflowDir } from "../dist/installer/paths.js";

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const testDir = path.join(__dirname, "test-dist");

describe("Enhanced Validation - WF011", () => {
  const testDir = path.join(__dirname, "test-dist");

  before(async () => {
    // Clean up and create test directory
    if (await pathExists(testDir)) {
      await fs.rm(testDir, { recursive: true, force: true });
    }
    await fs.mkdir(testDir, { recursive: true });
  });

  after(async () => {
    // Cleanup
    if (await pathExists(testDir)) {
      await fs.rm(testDir, { recursive: true, force: true });
    }
  });

  describe("Install Command Validation Integration", () => {
    it("should call validation before installation (test with temporarily corrupted bundled workflow)", async () => {
      // We'll test this by temporarily corrupting an existing bundled workflow,
      // attempting installation, and then restoring it
      const bundledWorkflowsDir = resolveBundledWorkflowsDir();
      const existingWorkflows = ["bug-fix", "feature-dev", "security-audit"];
      let testWorkflowId: string | undefined;
      
      // Find an existing bundled workflow to temporarily corrupt
      for (const workflowId of existingWorkflows) {
        const bundledDir = resolveBundledWorkflowDir(workflowId);
        if (await pathExists(path.join(bundledDir, "workflow.yml"))) {
          testWorkflowId = workflowId;
          break;
        }
      }
      
      if (!testWorkflowId) {
        // Skip test if no bundled workflows are available
        console.log("Skipping validation integration test - no bundled workflows found");
        return;
      }

      const workflowYmlPath = path.join(resolveBundledWorkflowDir(testWorkflowId), "workflow.yml");
      const originalContent = await fs.readFile(workflowYmlPath, "utf-8");
      
      try {
        // Temporarily corrupt the workflow.yml by making it invalid YAML
        await fs.writeFile(workflowYmlPath, "invalid: yaml: [unclosed");
        
        // Import installWorkflow here to avoid module loading issues
        const { installWorkflow } = await import("../dist/installer/install.js");
        
        // Attempt installation - should fail with validation error
        try {
          await installWorkflow({ workflowId: testWorkflowId });
          assert.fail("Expected installWorkflow to throw validation error");
        } catch (error) {
          assert.match(error.message, /Invalid workflow configuration/);
          assert.match(error.message, /Invalid YAML syntax/);
        }
      } finally {
        // Restore the original workflow.yml
        await fs.writeFile(workflowYmlPath, originalContent);
      }
    });
    
    it("should show that validation passes for valid bundled workflows", async () => {
      // Test that existing bundled workflows pass validation
      const bundledWorkflowsDir = resolveBundledWorkflowsDir();
      const existingWorkflows = ["bug-fix", "feature-dev", "security-audit"];
      let testWorkflowId: string | undefined;
      
      // Find an existing bundled workflow
      for (const workflowId of existingWorkflows) {
        const bundledDir = resolveBundledWorkflowDir(workflowId);
        if (await pathExists(path.join(bundledDir, "workflow.yml"))) {
          testWorkflowId = workflowId;
          break;
        }
      }
      
      if (!testWorkflowId) {
        console.log("Skipping validation test - no bundled workflows found");
        return;
      }

      // Import validation function and test the workflow directly
      const { validateWorkflowYaml } = await import("../dist/installer/workflow-validation.js");
      const workflowYmlPath = path.join(resolveBundledWorkflowDir(testWorkflowId), "workflow.yml");
      const yamlContent = await fs.readFile(workflowYmlPath, "utf-8");
      
      const result = validateWorkflowYaml(yamlContent);
      assert.equal(result.valid, true, `Bundled workflow ${testWorkflowId} should pass validation: ${JSON.stringify(result.errors, null, 2)}`);
    });
  });

  describe("Run Command Validation Integration", () => {
    it("should validate workflow before starting execution and reject invalid workflows", async () => {
      // Create a test workflow directory with invalid YAML
      const testWorkflowId = "test-invalid-run";
      const workflowDir = resolveWorkflowDir(testWorkflowId);
      await fs.mkdir(workflowDir, { recursive: true });

      // Create invalid workflow.yml (missing steps)
      const invalidWorkflowYaml = `
id: ${testWorkflowId}
name: "Test Invalid Run Workflow"
agents:
  - id: developer
    workspace:
      baseDir: "."
      files:
        "test.md": "# Test"
`;
      await fs.writeFile(path.join(workflowDir, "workflow.yml"), invalidWorkflowYaml);

      // Attempt to run workflow - should fail with validation error
      try {
        await runWorkflow({ workflowId: testWorkflowId, taskTitle: "Test task" });
        assert.fail("Expected runWorkflow to throw validation error");
      } catch (error) {
        assert.match(error.message, /Cannot start workflow - invalid configuration/);
        assert.match(error.message, /Missing required field: steps/);
      }

      // Cleanup
      if (await pathExists(workflowDir)) {
        await fs.rm(workflowDir, { recursive: true, force: true });
      }
    });

    it("should validate workflow before starting execution with detailed error messages", async () => {
      // Create a test workflow directory with syntax error
      const testWorkflowId = "test-syntax-error-run";
      const workflowDir = resolveWorkflowDir(testWorkflowId);
      await fs.mkdir(workflowDir, { recursive: true });

      // Create workflow.yml with YAML syntax error
      const syntaxErrorWorkflowYaml = `
id: ${testWorkflowId}
name: "Test Syntax Error"
agents:
  - id: developer
    workspace:
      baseDir: "."
      files:
        "test.md": "# Test"
steps:
  - id: test
    agent: developer
    input: "Test input
    expects: "Test output"  # Missing quote causes syntax error
`;
      await fs.writeFile(path.join(workflowDir, "workflow.yml"), syntaxErrorWorkflowYaml);

      // Attempt to run workflow - should fail with YAML syntax error
      try {
        await runWorkflow({ workflowId: testWorkflowId, taskTitle: "Test task" });
        assert.fail("Expected runWorkflow to throw YAML syntax error");
      } catch (error) {
        assert.match(error.message, /Cannot start workflow - invalid configuration/);
        assert.match(error.message, /Invalid YAML syntax/);
      }

      // Cleanup
      if (await pathExists(workflowDir)) {
        await fs.rm(workflowDir, { recursive: true, force: true });
      }
    });
  });

  describe("Existing Functionality Preservation", () => {
    it("should validate existing bundled workflows without breaking them", async () => {
      // Test that all existing bundled workflows pass validation
      const { validateWorkflowYaml } = await import("../dist/installer/workflow-validation.js");
      const bundledWorkflowsDir = resolveBundledWorkflowsDir();
      const existingWorkflows = ["bug-fix", "feature-dev", "security-audit"];
      
      let testedCount = 0;
      for (const workflowId of existingWorkflows) {
        const bundledDir = resolveBundledWorkflowDir(workflowId);
        const workflowYmlPath = path.join(bundledDir, "workflow.yml");
        
        if (await pathExists(workflowYmlPath)) {
          const yamlContent = await fs.readFile(workflowYmlPath, "utf-8");
          const result = validateWorkflowYaml(yamlContent);
          
          assert.equal(result.valid, true, 
            `Bundled workflow ${workflowId} should pass validation. Errors: ${JSON.stringify(result.errors, null, 2)}`);
          testedCount++;
        }
      }
      
      // Ensure we tested at least one workflow
      assert.ok(testedCount > 0, "Should test at least one bundled workflow");
    });

    it("should handle complex workflow configurations correctly", async () => {
      // Test validation with complex YAML that represents real workflow patterns
      const { validateWorkflowYaml } = await import("../dist/installer/workflow-validation.js");
      
      const complexWorkflowYaml = `
id: complex-test
name: "Complex Test Workflow"  
version: 1
description: "Tests complex workflow patterns"
agents:
  - id: planner
    workspace:
      baseDir: "."
      files:
        "CONTEXT.md": "# Context"
  - id: developer
    role: coding
    workspace:
      baseDir: "."
      files:
        "src/": ""
        "tests/": ""
        "README.md": "# Readme"
  - id: verifier
    role: verification
    timeoutSeconds: 1800
    workspace:
      baseDir: "."
      files:
        "src/": ""
        "tests/": ""
steps:
  - id: plan
    agent: planner
    input: "Create plan for: {{task}}"
    expects: "Detailed plan with steps"
  - id: develop
    type: loop
    agent: developer
    input: "Implement story: {{story.title}}"
    expects: "Implementation complete"
    loop:
      over: stories
      completion: all_done
      verifyEach: true
      verifyStep: verify
  - id: verify
    agent: verifier
    input: "Verify the implementation"
    expects: "Verification complete"
`;

      const result = validateWorkflowYaml(complexWorkflowYaml);
      assert.equal(result.valid, true, `Complex workflow should pass validation. Errors: ${JSON.stringify(result.errors, null, 2)}`);
    });
  });
});