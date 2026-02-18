import { test, describe } from "node:test";
import { strict as assert } from "node:assert";
import { copyWorkflow } from "../dist/installer/workflow-copy.js";
import { listBundledWorkflows } from "../dist/installer/workflow-fetch.js";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolveAntfarmRoot } from "../dist/installer/paths.js";

async function pathExists(filePath: string): Promise<boolean> {
  try {
    const { access } = await import("node:fs/promises");
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}
import { join } from "node:path";
import { execSync } from "node:child_process";
import YAML from "yaml";

describe("workflow copy functionality", () => {
  test("copyWorkflow() creates workflow copy with new ID and name", async () => {
    // Get first available workflow to copy
    const workflows = await listBundledWorkflows();
    assert(workflows.length > 0, "Should have at least one bundled workflow for testing");
    
    const sourceId = workflows[0];
    const newId = "test-copy-" + Date.now();
    
    try {
      const result = await copyWorkflow(sourceId, newId);
      
      assert.strictEqual(result.sourceId, sourceId);
      assert.strictEqual(result.targetId, newId);
      assert(result.message.includes(`copied workflow "${sourceId}" to "${newId}"`));
      assert(result.size > 0);
      assert(await pathExists(result.targetPath));
      
      // Verify workflow.yml was updated with new ID and name
      const workflowYml = await readFile(join(result.targetPath, "workflow.yml"), "utf-8");
      const parsed = YAML.parse(workflowYml);
      assert.strictEqual(parsed.id, newId);
      assert(parsed.name.includes("(Copy)"));
      
      // Cleanup
      await rm(result.targetPath, { recursive: true, force: true });
    } catch (err) {
      // Cleanup on error
      const antfarmRoot = resolveAntfarmRoot();
      const cleanupPath = join(antfarmRoot, "workflows", newId);
      await rm(cleanupPath, { recursive: true, force: true }).catch(() => {});
      throw err;
    }
  });

  test("copyWorkflow() copies all agent directories and configurations", async () => {
    const workflows = await listBundledWorkflows();
    const sourceId = workflows[0];
    const newId = "test-copy-agents-" + Date.now();
    
    try {
      const result = await copyWorkflow(sourceId, newId);
      
      // Verify the workflow structure is copied completely
      const workflowYml = await readFile(join(result.targetPath, "workflow.yml"), "utf-8");
      const parsed = YAML.parse(workflowYml);
      
      // Check basic workflow structure
      assert(parsed.agents, "Agents should be copied");
      assert(parsed.steps, "Steps should be copied");
      
      // Verify that if agents directory exists in source, it exists in target
      const sourceAgentsDir = join(result.sourcePath, "agents");
      const targetAgentsDir = join(result.targetPath, "agents");
      
      if (await pathExists(sourceAgentsDir)) {
        assert(await pathExists(targetAgentsDir), "Agents directory should be copied if it exists in source");
        
        // Check that all agent subdirectories are copied
        const { readdir } = await import("node:fs/promises");
        const sourceAgents = await readdir(sourceAgentsDir, { withFileTypes: true });
        const targetAgents = await readdir(targetAgentsDir, { withFileTypes: true });
        
        assert.strictEqual(targetAgents.length, sourceAgents.length, "Same number of agent directories should be copied");
        
        for (const sourceAgent of sourceAgents) {
          if (sourceAgent.isDirectory()) {
            const targetAgentDir = join(targetAgentsDir, sourceAgent.name);
            assert(await pathExists(targetAgentDir), `Agent directory should be copied: ${sourceAgent.name}`);
          }
        }
      }
      
      // Cleanup
      await rm(result.targetPath, { recursive: true, force: true });
    } catch (err) {
      const antfarmRoot = resolveAntfarmRoot();
      const cleanupPath = join(antfarmRoot, "workflows", newId);
      await rm(cleanupPath, { recursive: true, force: true }).catch(() => {});
      throw err;
    }
  });

  test("copyWorkflow() validates new workflow ID format", async () => {
    const workflows = await listBundledWorkflows();
    const sourceId = workflows[0];
    
    // Test various invalid ID formats
    const invalidIds = [
      "", // empty
      "Test-ID", // uppercase
      "test_id", // underscore
      "test.id", // dot
      "test id", // space
      "test@id", // special char
    ];
    
    for (const invalidId of invalidIds) {
      await assert.rejects(
        copyWorkflow(sourceId, invalidId),
        /must contain only lowercase letters, numbers, and hyphens/,
        `Should reject invalid ID: ${invalidId}`
      );
    }
  });

  test("copyWorkflow() prevents copying to existing workflow IDs", async () => {
    const workflows = await listBundledWorkflows();
    assert(workflows.length >= 2, "Need at least 2 workflows for this test");
    
    const sourceId = workflows[0];
    const existingId = workflows[1];
    
    await assert.rejects(
      copyWorkflow(sourceId, existingId),
      /already exists/,
      "Should reject copying to existing workflow ID"
    );
  });

  test("copyWorkflow() prevents copying non-existent workflows", async () => {
    const nonExistentId = "workflow-that-does-not-exist";
    const newId = "test-copy-" + Date.now();
    
    await assert.rejects(
      copyWorkflow(nonExistentId, newId),
      /not found/,
      "Should reject copying non-existent workflow"
    );
  });

  test("copyWorkflow() prevents copying to existing user workspace workflow", async () => {
    const workflows = await listBundledWorkflows();
    const sourceId = workflows[0];
    const conflictId = "test-workspace-conflict-" + Date.now();
    
    // Create a workflow in user workspace to cause conflict
    const antfarmRoot = resolveAntfarmRoot();
    const userWorkflowsDir = join(antfarmRoot, "workflows");
    const conflictPath = join(userWorkflowsDir, conflictId);
    
    await mkdir(conflictPath, { recursive: true });
    await writeFile(join(conflictPath, "workflow.yml"), "id: " + conflictId);
    
    try {
      await assert.rejects(
        copyWorkflow(sourceId, conflictId),
        /already exists in user workspace/,
        "Should reject copying to existing user workspace ID"
      );
    } finally {
      // Cleanup
      await rm(conflictPath, { recursive: true, force: true });
    }
  });

  test("copyWorkflow() creates valid workflow that passes validation", async () => {
    const workflows = await listBundledWorkflows();
    const sourceId = workflows[0];
    const newId = "test-validation-" + Date.now();
    
    try {
      const result = await copyWorkflow(sourceId, newId);
      
      // Read and validate the copied workflow
      const workflowYml = await readFile(join(result.targetPath, "workflow.yml"), "utf-8");
      const { validateWorkflowYaml } = await import("../dist/installer/workflow-validation.js");
      const validation = validateWorkflowYaml(workflowYml);
      
      assert(validation.valid, `Copied workflow should be valid. Errors: ${JSON.stringify(validation.errors)}`);
      assert.strictEqual(validation.parsedWorkflow?.id, newId);
      
      // Cleanup
      await rm(result.targetPath, { recursive: true, force: true });
    } catch (err) {
      const antfarmRoot = resolveAntfarmRoot();
      const cleanupPath = join(antfarmRoot, "workflows", newId);
      await rm(cleanupPath, { recursive: true, force: true }).catch(() => {});
      throw err;
    }
  });

  test("copyWorkflow() preserves directory structure and file contents", async () => {
    const workflows = await listBundledWorkflows();
    const sourceId = workflows[0];
    const newId = "test-structure-" + Date.now();
    
    try {
      const result = await copyWorkflow(sourceId, newId);
      
      // Compare directory structure (basic check)
      const originalWorkflowYml = await readFile(join(result.sourcePath, "workflow.yml"), "utf-8");
      const copiedWorkflowYml = await readFile(join(result.targetPath, "workflow.yml"), "utf-8");
      
      const originalParsed = YAML.parse(originalWorkflowYml);
      const copiedParsed = YAML.parse(copiedWorkflowYml);
      
      // ID and name should be different, but everything else should be same structure
      assert.notStrictEqual(copiedParsed.id, originalParsed.id);
      assert.notStrictEqual(copiedParsed.name, originalParsed.name);
      assert.deepStrictEqual(copiedParsed.agents, originalParsed.agents);
      assert.deepStrictEqual(copiedParsed.steps, originalParsed.steps);
      
      // Cleanup
      await rm(result.targetPath, { recursive: true, force: true });
    } catch (err) {
      const antfarmRoot = resolveAntfarmRoot();
      const cleanupPath = join(antfarmRoot, "workflows", newId);
      await rm(cleanupPath, { recursive: true, force: true }).catch(() => {});
      throw err;
    }
  });

  test("CLI: antfarm workflow copy <source> <new-id> creates workflow copy", async () => {
    const workflows = await listBundledWorkflows();
    const sourceId = workflows[0];
    const newId = "test-cli-copy-" + Date.now();
    
    try {
      // Build first to ensure CLI is available
      execSync("npm run build", { cwd: process.cwd(), stdio: "pipe" });
      
      const result = execSync(`node dist/cli/cli.js workflow copy ${sourceId} ${newId}`, {
        cwd: process.cwd(),
        encoding: "utf-8"
      });
      
      assert(result.includes(`copied workflow "${sourceId}" to "${newId}"`));
      assert(result.includes("Source:"));
      assert(result.includes("Target:"));
      assert(result.includes("Size:"));
      
      // Verify the workflow was actually created
      const antfarmRoot = resolveAntfarmRoot();
      const targetPath = join(antfarmRoot, "workflows", newId);
      assert(await pathExists(targetPath));
      
      // Cleanup
      await rm(targetPath, { recursive: true, force: true });
    } catch (err) {
      const antfarmRoot = resolveAntfarmRoot();
      const cleanupPath = join(antfarmRoot, "workflows", newId);
      await rm(cleanupPath, { recursive: true, force: true }).catch(() => {});
      throw err;
    }
  });

  test("CLI: antfarm workflow copy handles missing arguments", async () => {
    execSync("npm run build", { cwd: process.cwd(), stdio: "pipe" });
    
    // Missing source workflow
    try {
      execSync("node dist/cli/cli.js workflow copy", {
        cwd: process.cwd(),
        encoding: "utf-8",
        stdio: "pipe"
      });
      assert.fail("Should have exited with error");
    } catch (error: any) {
      assert(error.status === 1, "Should exit with code 1");
      assert(error.stderr.includes("Missing source workflow name"), "Should show missing source error");
    }
    
    // Missing new ID
    try {
      execSync("node dist/cli/cli.js workflow copy some-workflow", {
        cwd: process.cwd(),
        encoding: "utf-8",
        stdio: "pipe"
      });
      assert.fail("Should have exited with error");
    } catch (error: any) {
      assert(error.status === 1, "Should exit with code 1");
      assert(error.stderr.includes("Missing new workflow ID"), "Should show missing ID error");
    }
  });

  test("CLI: antfarm workflow copy handles invalid workflows", async () => {
    execSync("npm run build", { cwd: process.cwd(), stdio: "pipe" });
    
    const nonExistentId = "workflow-that-does-not-exist";
    const newId = "test-invalid-" + Date.now();
    
    try {
      execSync(`node dist/cli/cli.js workflow copy ${nonExistentId} ${newId}`, {
        cwd: process.cwd(),
        encoding: "utf-8",
        stdio: "pipe"
      });
      assert.fail("Should have exited with error");
    } catch (error: any) {
      assert(error.status === 1, "Should exit with code 1");
      assert(error.stderr.includes("not found"), "Should show not found error");
    }
  });

  test("CLI: copy command appears in usage help", async () => {
    execSync("npm run build", { cwd: process.cwd(), stdio: "pipe" });
    
    try {
      execSync("node dist/cli/cli.js", {
        cwd: process.cwd(),
        encoding: "utf-8",
        stdio: "pipe"
      });
    } catch (error: any) {
      // CLI exits with code 1 when showing usage - this is expected
      const helpOutput = error.stdout;
      assert(helpOutput.includes("antfarm workflow copy <source> <new-id>"), "Copy command should be in help");
      assert(helpOutput.includes("Copy existing workflow with new ID"), "Copy description should be in help");
    }
  });

  test("copyWorkflow() returns correct metadata", async () => {
    const workflows = await listBundledWorkflows();
    const sourceId = workflows[0];
    const newId = "test-metadata-" + Date.now();
    
    try {
      const result = await copyWorkflow(sourceId, newId);
      
      assert.strictEqual(typeof result.sourceId, "string");
      assert.strictEqual(typeof result.targetId, "string");
      assert.strictEqual(typeof result.message, "string");
      assert.strictEqual(typeof result.sourcePath, "string");
      assert.strictEqual(typeof result.targetPath, "string");
      assert.strictEqual(typeof result.size, "number");
      assert(result.size > 0);
      
      // Cleanup
      await rm(result.targetPath, { recursive: true, force: true });
    } catch (err) {
      const antfarmRoot = resolveAntfarmRoot();
      const cleanupPath = join(antfarmRoot, "workflows", newId);
      await rm(cleanupPath, { recursive: true, force: true }).catch(() => {});
      throw err;
    }
  });
});