import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { execSync } from "node:child_process";
import { renameWorkflow } from "../dist/installer/workflow-rename.js";
import { installWorkflow } from "../dist/installer/install.js";
import { resolveWorkflowDir, resolveWorkflowWorkspaceDir, resolveAntfarmRoot } from "../dist/installer/paths.js";
import { loadWorkflowSpec } from "../dist/installer/workflow-spec.js";

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function cleanup() {
  // Clean up any test workflows and backups
  const workflowIds = ["bug-fix", "feature-dev", "renamed-workflow", "existing-workflow", "valid-name-123", "invalid-workflow", "missing-yml", "validated-workflow"];
  for (const id of workflowIds) {
    try {
      const workflowDir = resolveWorkflowDir(id);
      const workspaceDir = resolveWorkflowWorkspaceDir(id);
      if (await pathExists(workflowDir)) {
        await fs.rm(workflowDir, { recursive: true, force: true });
      }
      if (await pathExists(workspaceDir)) {
        await fs.rm(workspaceDir, { recursive: true, force: true });
      }
    } catch {
      // Ignore cleanup errors
    }
  }
  
  // Clean up backups
  try {
    const backupRoot = path.join(resolveAntfarmRoot(), "backups");
    if (await pathExists(backupRoot)) {
      await fs.rm(backupRoot, { recursive: true, force: true });
    }
  } catch {
    // Ignore cleanup errors
  }
}

describe("workflow rename functionality", () => {
  test("renameWorkflow() renames workflow directory and updates workflow.yml ID", async () => {
    await cleanup();
    
    try {
      // Install a bundled workflow first
      await installWorkflow({ workflowId: "bug-fix" });
      
      const result = await renameWorkflow("bug-fix", "renamed-workflow");
      
      // Check return values
      assert.strictEqual(result.oldWorkflowId, "bug-fix");
      assert.strictEqual(result.newWorkflowId, "renamed-workflow");
      assert.strictEqual(result.message, 'Successfully renamed workflow "bug-fix" to "renamed-workflow"');
      
      // Check that old directory was renamed
      const oldPath = resolveWorkflowDir("bug-fix");
      const newPath = resolveWorkflowDir("renamed-workflow");
      
      // Verify old directory no longer exists
      assert.strictEqual(await pathExists(oldPath), false, "Old workflow directory should not exist");
      
      // Verify new directory exists and has updated workflow.yml
      const newWorkflowYml = path.join(newPath, "workflow.yml");
      assert.strictEqual(await pathExists(newWorkflowYml), true, "New workflow.yml should exist");
      
      const spec = await loadWorkflowSpec(newPath);
      assert.strictEqual(spec.id, "renamed-workflow");
      assert.strictEqual(spec.name, "Bug Triage & Fix");
      
    } finally {
      await cleanup();
    }
  });

  test("renameWorkflow() validates new workflow ID format", async () => {
    await cleanup();
    
    try {
      // Install a bundled workflow first
      await installWorkflow({ workflowId: "bug-fix" });
      
      // Test invalid characters
      await assert.rejects(
        () => renameWorkflow("bug-fix", "Invalid_Name"),
        { message: "New workflow ID must contain only lowercase letters, numbers, and hyphens" }
      );
      
      // Test uppercase
      await assert.rejects(
        () => renameWorkflow("bug-fix", "InvalidName"),
        { message: "New workflow ID must contain only lowercase letters, numbers, and hyphens" }
      );
      
      // Test spaces
      await assert.rejects(
        () => renameWorkflow("bug-fix", "invalid name"),
        { message: "New workflow ID must contain only lowercase letters, numbers, and hyphens" }
      );
      
      // Test empty string
      await assert.rejects(
        () => renameWorkflow("bug-fix", ""),
        { message: "New workflow ID must contain only lowercase letters, numbers, and hyphens" }
      );
      
    } finally {
      await cleanup();
    }
  });

  test("renameWorkflow() handles workflow not found error", async () => {
    await cleanup();
    
    try {
      await assert.rejects(
        () => renameWorkflow("non-existent", "new-name"),
        { message: "Workflow not found: non-existent" }
      );
      
    } finally {
      await cleanup();
    }
  });

  test("renameWorkflow() prevents rename to existing workflow ID", async () => {
    await cleanup();
    
    try {
      // Install two bundled workflows
      await installWorkflow({ workflowId: "bug-fix" });
      await installWorkflow({ workflowId: "feature-dev" });
      
      await assert.rejects(
        () => renameWorkflow("bug-fix", "feature-dev"),
        { message: 'Workflow ID "feature-dev" already exists as a bundled workflow. Choose a different ID.' }
      );
      
    } finally {
      await cleanup();
    }
  });

  test("renameWorkflow() renames workspace directory if it exists", async () => {
    await cleanup();
    
    try {
      // Install a bundled workflow first
      await installWorkflow({ workflowId: "bug-fix" });
      
      const result = await renameWorkflow("bug-fix", "renamed-workflow");
      
      // Check that workspace directory was renamed (if it existed)
      const oldWorkspacePath = resolveWorkflowWorkspaceDir("bug-fix");
      const newWorkspacePath = resolveWorkflowWorkspaceDir("renamed-workflow");
      
      // Verify old workspace directory no longer exists
      assert.strictEqual(await pathExists(oldWorkspacePath), false, "Old workspace directory should not exist");
      
      // For this test, we just verify the rename completed successfully
      // The workspace directory may or may not exist depending on the bundled workflow
      assert.strictEqual(result.newWorkflowId, "renamed-workflow");
      
    } finally {
      await cleanup();
    }
  });

  test("renameWorkflow() validates YAML syntax after update", async () => {
    await cleanup();
    
    try {
      // This test is harder to create with bundled workflows since they're all valid
      // We'll just test that a normal workflow renames successfully and passes validation
      await installWorkflow({ workflowId: "bug-fix" });
      
      const result = await renameWorkflow("bug-fix", "validated-workflow");
      assert.strictEqual(result.newWorkflowId, "validated-workflow");
      
      // Verify the renamed workflow is valid by loading its spec
      const spec = await loadWorkflowSpec(resolveWorkflowDir("validated-workflow"));
      assert.strictEqual(spec.id, "validated-workflow");
      
    } finally {
      await cleanup();
    }
  });

  test("CLI integration: antfarm workflow rename <old> <new> renames workflow with proper output", async () => {
    await cleanup();
    
    try {
      // Build the project to ensure CLI is available
      execSync("npm run build", { stdio: "inherit" });
      
      // Install a workflow first
      execSync("node dist/cli/cli.js workflow install bug-fix", { stdio: "inherit" });
      
      // Test successful rename
      const output = execSync(
        "node dist/cli/cli.js workflow rename bug-fix renamed-workflow",
        { encoding: "utf-8", cwd: process.cwd() }
      );
      
      assert(output.includes('Successfully renamed workflow "bug-fix" to "renamed-workflow"'));
      assert(output.includes("Renamed from:"));
      assert(output.includes("Renamed to:"));
      
    } finally {
      await cleanup();
    }
  });

  test("CLI integration: handles missing arguments with proper error messages", async () => {
    await cleanup();
    
    try {
      execSync("npm run build", { stdio: "inherit" });
      
      // Test missing old workflow name
      try {
        execSync("node dist/cli/cli.js workflow rename", { encoding: "utf-8" });
        assert.fail("Expected command to fail");
      } catch (err: any) {
        assert(err.stderr?.includes("Missing old workflow name"));
      }
      
      // Test missing new workflow name  
      try {
        execSync("node dist/cli/cli.js workflow rename bug-fix", { encoding: "utf-8" });
        assert.fail("Expected command to fail");
      } catch (err: any) {
        assert(err.stderr?.includes("Missing new workflow ID"));
      }
      
    } finally {
      await cleanup();
    }
  });

  test("CLI shows rename command in usage help", async () => {
    try {
      execSync("npm run build", { stdio: "inherit" });
      
      const output = execSync("node dist/cli/cli.js", { encoding: "utf-8" });
      assert(output.includes("antfarm workflow rename <old> <new>"));
      assert(output.includes("Rename workflow ID and update internal references"));
      
    } catch (err: any) {
      // CLI help exits with code 1, but we still want to check the output
      assert(err.stdout?.includes("antfarm workflow rename <old> <new>"));
      assert(err.stdout?.includes("Rename workflow ID and update internal references"));
    }
  });

  test("renameWorkflow() handles missing workflow.yml error", async () => {
    await cleanup();
    
    try {
      // Install a workflow and then corrupt it by removing workflow.yml
      await installWorkflow({ workflowId: "bug-fix" });
      const workflowDir = resolveWorkflowDir("bug-fix");
      await fs.rm(path.join(workflowDir, "workflow.yml"));
      
      await assert.rejects(
        () => renameWorkflow("bug-fix", "renamed-missing"),
        { message: /Invalid workflow: workflow.yml not found/ }
      );
      
    } finally {
      await cleanup();
    }
  });

  test("renameWorkflow() works with valid lowercase-hyphen-number format", async () => {
    await cleanup();
    
    try {
      // Install a workflow and test valid formats
      await installWorkflow({ workflowId: "bug-fix" });
      await renameWorkflow("bug-fix", "valid-name-123");
      const spec = await loadWorkflowSpec(resolveWorkflowDir("valid-name-123"));
      assert.strictEqual(spec.id, "valid-name-123");
      
    } finally {
      await cleanup();
    }
  });

  test("renameWorkflow() preserves workflow structure and agents", async () => {
    await cleanup();
    
    try {
      await installWorkflow({ workflowId: "bug-fix" });
      const result = await renameWorkflow("bug-fix", "renamed-workflow");
      
      // Load renamed workflow and verify structure is preserved
      const spec = await loadWorkflowSpec(resolveWorkflowDir("renamed-workflow"));
      assert.strictEqual(spec.id, "renamed-workflow");
      assert.strictEqual(spec.name, "Bug Triage & Fix");
      assert.strictEqual(spec.version, 1);
      assert(Array.isArray(spec.agents));
      assert(spec.agents.length > 0);
      assert(Array.isArray(spec.steps));
      assert(spec.steps.length > 0);
      
    } finally {
      await cleanup();
    }
  });

  test("renameWorkflow() handles workflow without workspace directory", async () => {
    await cleanup();
    
    try {
      await installWorkflow({ workflowId: "bug-fix" });
      
      // Remove workspace directory if it exists
      const workspaceDir = resolveWorkflowWorkspaceDir("bug-fix");
      if (await pathExists(workspaceDir)) {
        await fs.rm(workspaceDir, { recursive: true, force: true });
      }
      
      // Rename should still work
      const result = await renameWorkflow("bug-fix", "renamed-workflow");
      assert.strictEqual(result.newWorkflowId, "renamed-workflow");
      
    } finally {
      await cleanup();
    }
  });
});