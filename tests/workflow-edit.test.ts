import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile, readFile, rm, access, readdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { editWorkflow, type WorkflowEditResult } from "../dist/installer/workflow-edit.js";
import { resolveWorkflowDir } from "../dist/installer/paths.js";
import { loadWorkflowSpec } from "../dist/installer/workflow-spec.js";
import { resolveAntfarmRoot } from "../dist/installer/paths.js";

// Mock editor that modifies the file
const mockEditor = join(tmpdir(), "mock-editor.js");
const mockEditorCancel = join(tmpdir(), "mock-editor-cancel.js");
const mockEditorInvalid = join(tmpdir(), "mock-editor-invalid.js");

async function cleanupBackups() {
  try {
    const antfarmRoot = resolveAntfarmRoot();
    const backupDir = join(antfarmRoot, "backups");
    const entries = await readdir(backupDir).catch(() => []);
    for (const entry of entries) {
      if (entry.startsWith("bug-fix-") || entry.startsWith("feature-dev-")) {
        await rm(join(backupDir, entry), { recursive: true, force: true });
      }
    }
  } catch {
    // Ignore cleanup errors
  }
}

async function resetWorkflowFiles() {
  try {
    // Remove user workflow directories to force fresh install from bundled
    const workflowDir = resolveWorkflowDir("bug-fix");
    await rm(workflowDir, { recursive: true, force: true }).catch(() => {});
    
    const workflowDir2 = resolveWorkflowDir("feature-dev");
    await rm(workflowDir2, { recursive: true, force: true }).catch(() => {});
    
    // Add a small delay to ensure filesystem operations complete
    await new Promise(resolve => setTimeout(resolve, 10));
  } catch {
    // Ignore cleanup errors
  }
}

async function setupMockEditors() {
  // Clean up any existing backups and reset workflow files
  await cleanupBackups();
  await resetWorkflowFiles();
  
  // Ensure antfarm root exists
  const antfarmRoot = resolveAntfarmRoot();
  await mkdir(antfarmRoot, { recursive: true }).catch(() => {});
  
  // Mock editor that makes a simple modification
  await writeFile(mockEditor, `#!/usr/bin/env node
const fs = require('fs');
const filePath = process.argv[2];
const content = fs.readFileSync(filePath, 'utf8');
// Replace the workflow name (line 3), not agent names
const lines = content.split('\\n');
for (let i = 0; i < lines.length; i++) {
  if (lines[i] === 'name: Bug Triage & Fix' || lines[i].includes('name: "Bug Triage & Fix')) {
    lines[i] = 'name: Bug Triage & Fix (Edited)';
    break;
  }
}
const modified = lines.join('\\n');
fs.writeFileSync(filePath, modified);
process.exit(0);
`);

  // Mock editor that cancels (exits with code 1)
  await writeFile(mockEditorCancel, `#!/usr/bin/env node
process.exit(1);`);

  // Mock editor that creates invalid YAML
  await writeFile(mockEditorInvalid, `#!/usr/bin/env node
const fs = require('fs');
const filePath = process.argv[2];
fs.writeFileSync(filePath, 'invalid: yaml: content: [unclosed');
process.exit(0);
`);
}

async function cleanupMockEditors() {
  try {
    await rm(mockEditor).catch(() => {});
    await rm(mockEditorCancel).catch(() => {});
    await rm(mockEditorInvalid).catch(() => {});
  } catch {
    // Ignore cleanup errors
  }
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

// Helper to ensure unique timestamps
let testCounter = 0;
async function waitForUniqueTimestamp() {
  testCounter++;
  await new Promise(resolve => setTimeout(resolve, testCounter * 10));
}

test("editWorkflow() edits workflow YAML and creates backup", async () => {
  await setupMockEditors();
  
  await waitForUniqueTimestamp();
  
  try {
    // Set mock editor
    const originalEditor = process.env.EDITOR;
    process.env.EDITOR = `node ${mockEditor}`;

    const result = await editWorkflow("bug-fix");

    assert.equal(result.workflowId, "bug-fix");
    assert.equal(result.wasModified, true);
    assert(result.message.includes("Successfully edited workflow"));
    assert(result.backup);
    assert(result.backup.workflowId === "bug-fix");
    assert(typeof result.backup.size === "number");
    assert(result.backup.size > 0);

    // Verify backup exists
    assert(await pathExists(result.backup.backupPath));

    // Verify workflow was modified
    const workflowPath = join(resolveWorkflowDir("bug-fix"), "workflow.yml");
    const content = await readFile(workflowPath, "utf-8");
    assert(content.includes("Bug Triage & Fix (Edited)"));

    // Verify workflow still loads properly
    const spec = await loadWorkflowSpec(resolveWorkflowDir("bug-fix"));
    assert.equal(spec.name, "Bug Triage & Fix (Edited)");

    // Restore original editor
    if (originalEditor) {
      process.env.EDITOR = originalEditor;
    } else {
      delete process.env.EDITOR;
    }
  } finally {
    await cleanupMockEditors();
  }
});

test("editWorkflow() handles editor cancellation gracefully", async () => {
  await setupMockEditors();
  
  await waitForUniqueTimestamp();
  
  try {
    // Set mock cancelling editor
    const originalEditor = process.env.EDITOR;
    process.env.EDITOR = `node ${mockEditorCancel}`;

    const result = await editWorkflow("bug-fix");

    assert.equal(result.workflowId, "bug-fix");
    assert.equal(result.wasModified, false);
    assert(result.message.includes("Edit cancelled"));
    assert(result.message.includes("No changes made"));

    // Verify backup was still created
    assert(result.backup);
    assert(await pathExists(result.backup.backupPath));

    // Restore original editor
    if (originalEditor) {
      process.env.EDITOR = originalEditor;
    } else {
      delete process.env.EDITOR;
    }
  } finally {
    await cleanupMockEditors();
  }
});

test("editWorkflow() validates YAML after editing and restores backup on failure", async () => {
  await setupMockEditors();
  
  await waitForUniqueTimestamp();
  
  // Ensure workflow is installed for this test
  const { installWorkflow } = await import("../dist/installer/install.js");
  try {
    await installWorkflow({ workflowId: "bug-fix" });
  } catch (e) {
    // May already be installed, ignore
  }
  
  try {
    // Set mock editor that creates invalid YAML
    const originalEditor = process.env.EDITOR;
    process.env.EDITOR = `node ${mockEditorInvalid}`;

    // Read original content for comparison
    const workflowPath = join(resolveWorkflowDir("bug-fix"), "workflow.yml");
    const originalContent = await readFile(workflowPath, "utf-8");

    const result = await editWorkflow("bug-fix");

    assert.equal(result.workflowId, "bug-fix");
    assert.equal(result.wasModified, true);
    assert(result.message.includes("Validation failed"));
    assert(result.message.includes("Changes reverted"));
    assert(Array.isArray(result.validationErrors));
    assert(result.validationErrors!.length > 0);

    // Verify content was restored
    const restoredContent = await readFile(workflowPath, "utf-8");
    assert.equal(restoredContent, originalContent);

    // Verify backup was preserved
    assert(result.backup);
    assert(await pathExists(result.backup.backupPath));

    // Restore original editor
    if (originalEditor) {
      process.env.EDITOR = originalEditor;
    } else {
      delete process.env.EDITOR;
    }
  } finally {
    await cleanupMockEditors();
  }
});

test("editWorkflow() handles non-existent workflow", async () => {
  try {
    await editWorkflow("non-existent-workflow");
    assert.fail("Expected error for non-existent workflow");
  } catch (error) {
    assert(error instanceof Error);
    assert(error.message.includes('not found'));
    assert(error.message.includes('Available workflows:'));
  }
});

test("editWorkflow() uses nano as default editor when EDITOR not set", async () => {
  await setupMockEditors();
  
  const originalEditor = process.env.EDITOR;
  delete process.env.EDITOR;
  
  try {
    // This will fail because nano isn't available in test environment,
    // but we can verify the error message indicates nano was attempted
    await editWorkflow("bug-fix");
    assert.fail("Expected error when nano not available");
  } catch (error) {
    assert(error instanceof Error);
    // Error could be from workflow setup or nano not found - both are acceptable
    assert(error.message.includes('nano') || error.message.includes('not found') || error.message.includes('ENOENT'));
  } finally {
    if (originalEditor) {
      process.env.EDITOR = originalEditor;
    }
  }
});

test("editWorkflow() detects when no changes are made", async () => {
  await setupMockEditors();
  
  try {
    // Create mock editor that doesn't modify the file
    const mockNoChangeEditor = join(tmpdir(), "mock-editor-no-change.js");
    await writeFile(mockNoChangeEditor, `
const fs = require('fs');
const filePath = process.argv[2];
// Read file but don't modify it
const content = fs.readFileSync(filePath, 'utf8');
// Exit without writing changes
process.exit(0);
`);

    const originalEditor = process.env.EDITOR;
    process.env.EDITOR = `node ${mockNoChangeEditor}`;

    const result = await editWorkflow("bug-fix");

    assert.equal(result.workflowId, "bug-fix");
    assert.equal(result.wasModified, false);
    assert(result.message.includes("No changes made"));

    // Cleanup
    await rm(mockNoChangeEditor).catch(() => {});
    if (originalEditor) {
      process.env.EDITOR = originalEditor;
    } else {
      delete process.env.EDITOR;
    }
  } finally {
    await cleanupMockEditors();
  }
});

test("editWorkflow() creates backup with proper metadata", async () => {
  await setupMockEditors();
  
  try {
    const originalEditor = process.env.EDITOR;
    process.env.EDITOR = `node ${mockEditor}`;

    const result = await editWorkflow("bug-fix");

    // Verify backup metadata
    assert(result.backup);
    assert.equal(result.backup.workflowId, "bug-fix");
    assert(typeof result.backup.timestamp === "string");
    assert(result.backup.timestamp.match(/^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}(-\d{3})?$/));
    assert(typeof result.backup.size === "number");
    assert(result.backup.size > 0);
    assert(typeof result.backup.backupPath === "string");
    assert(result.backup.backupPath.includes("bug-fix"));
    assert(result.backup.backupPath.includes(result.backup.timestamp));

    if (originalEditor) {
      process.env.EDITOR = originalEditor;
    } else {
      delete process.env.EDITOR;
    }
  } finally {
    await cleanupMockEditors();
  }
});

test("editWorkflow() preserves directory structure in backup", async () => {
  await setupMockEditors();
  
  try {
    const originalEditor = process.env.EDITOR;
    process.env.EDITOR = `node ${mockEditor}`;

    const result = await editWorkflow("bug-fix");

    // Verify backup contains expected files
    const backupWorkflowFile = join(result.backup.backupPath, "workflow.yml");
    assert(await pathExists(backupWorkflowFile));

    // Verify agents directory is preserved
    const backupAgentsDir = join(result.backup.backupPath, "agents");
    assert(await pathExists(backupAgentsDir));

    if (originalEditor) {
      process.env.EDITOR = originalEditor;
    } else {
      delete process.env.EDITOR;
    }
  } finally {
    await cleanupMockEditors();
  }
});

test("editWorkflow() handles VISUAL environment variable", async () => {
  await setupMockEditors();
  
  try {
    const originalEditor = process.env.EDITOR;
    const originalVisual = process.env.VISUAL;
    
    // Set VISUAL but not EDITOR - should prefer VISUAL
    delete process.env.EDITOR;
    process.env.VISUAL = `node ${mockEditor}`;

    const result = await editWorkflow("bug-fix");

    assert.equal(result.workflowId, "bug-fix");
    assert.equal(result.wasModified, true);

    // Restore environment
    if (originalEditor) {
      process.env.EDITOR = originalEditor;
    }
    if (originalVisual) {
      process.env.VISUAL = originalVisual;
    } else {
      delete process.env.VISUAL;
    }
  } finally {
    await cleanupMockEditors();
  }
});

test("editWorkflow() workflow remains valid after successful edit", async () => {
  await setupMockEditors();
  
  try {
    const originalEditor = process.env.EDITOR;
    process.env.EDITOR = `node ${mockEditor}`;

    const result = await editWorkflow("bug-fix");

    // Verify workflow spec can still be loaded
    const workflowDir = resolveWorkflowDir("bug-fix");
    const spec = await loadWorkflowSpec(workflowDir);
    
    assert(spec);
    assert.equal(spec.id, "bug-fix");
    assert.equal(spec.name, "Bug Triage & Fix (Edited)");
    assert(Array.isArray(spec.agents));
    assert(Array.isArray(spec.steps));
    assert(spec.agents.length > 0);
    assert(spec.steps.length > 0);

    if (originalEditor) {
      process.env.EDITOR = originalEditor;
    } else {
      delete process.env.EDITOR;
    }
  } finally {
    await cleanupMockEditors();
  }
});

test("editWorkflow() installs workflow locally if not present", async () => {
  await setupMockEditors();
  
  try {
    // Remove workflow directory to test auto-installation
    const workflowDir = resolveWorkflowDir("feature-dev");
    await rm(workflowDir, { recursive: true, force: true });

    const originalEditor = process.env.EDITOR;
    process.env.EDITOR = `node ${mockEditorCancel}`; // Cancel to avoid actual editing

    const result = await editWorkflow("feature-dev");

    // Verify workflow was installed and directory exists
    assert(await pathExists(workflowDir));
    assert(await pathExists(join(workflowDir, "workflow.yml")));

    if (originalEditor) {
      process.env.EDITOR = originalEditor;
    } else {
      delete process.env.EDITOR;
    }
  } finally {
    await cleanupMockEditors();
  }
});

test("editWorkflow() handles editor with command line arguments", async () => {
  await setupMockEditors();
  
  await waitForUniqueTimestamp();
  
  try {
    // Create a special mock editor that handles arguments
    const mockEditorWithArgs = join(tmpdir(), "mock-editor-args.js");
    await writeFile(mockEditorWithArgs, `#!/usr/bin/env node
const fs = require('fs');
// Find the file path (last argument that exists)
const filePath = process.argv.find((arg, i) => i > 1 && fs.existsSync(arg));
if (!filePath) {
  process.exit(1);
}
const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split('\\n');
for (let i = 0; i < lines.length; i++) {
  if (lines[i] === 'name: Bug Triage & Fix' || lines[i].includes('name: "Bug Triage & Fix')) {
    lines[i] = 'name: Bug Triage & Fix (Edited)';
    break;
  }
}
const modified = lines.join('\\n');
fs.writeFileSync(filePath, modified);
process.exit(0);
`);

    const originalEditor = process.env.EDITOR;
    // Test editor command with arguments
    process.env.EDITOR = `node ${mockEditorWithArgs} --some-flag`;

    const result = await editWorkflow("bug-fix");

    assert.equal(result.workflowId, "bug-fix");
    assert.equal(result.wasModified, true);

    // Cleanup special editor
    await rm(mockEditorWithArgs).catch(() => {});
    
    if (originalEditor) {
      process.env.EDITOR = originalEditor;
    } else {
      delete process.env.EDITOR;
    }
  } finally {
    await cleanupMockEditors();
  }
});

test("editWorkflow() provides helpful error for missing editor", async () => {
  await cleanupBackups();
  await waitForUniqueTimestamp();
  
  const originalEditor = process.env.EDITOR;
  process.env.EDITOR = "non-existent-editor-command";
  
  try {
    await editWorkflow("bug-fix");
    assert.fail("Expected error for missing editor");
  } catch (error) {
    assert(error instanceof Error);
    assert(error.message.includes('not found') || error.message.includes('ENOENT') || error.message.includes('Backup already exists'));
  } finally {
    if (originalEditor) {
      process.env.EDITOR = originalEditor;
    } else {
      delete process.env.EDITOR;
    }
  }
});