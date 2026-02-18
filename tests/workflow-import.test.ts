import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { importWorkflow } from "../dist/installer/workflow-import.js";
import { resolveWorkflowDir, resolveWorkflowRoot } from "../dist/installer/paths.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const testDir = path.join(__dirname, "test-dist", "workflow-import-tests");

async function ensureTestDir() {
  await fs.mkdir(testDir, { recursive: true });
}

async function cleanupTestDir() {
  try {
    await fs.rm(testDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

async function createTestYaml(filename: string, content: string): Promise<string> {
  const filePath = path.join(testDir, filename);
  await fs.writeFile(filePath, content, "utf-8");
  return filePath;
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function cleanupWorkflow(workflowId: string) {
  try {
    const workflowDir = resolveWorkflowDir(workflowId);
    await fs.rm(workflowDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

test("workflow import - setup test directory", async () => {
  await ensureTestDir();
  assert.ok(await pathExists(testDir));
});

test("importWorkflow() imports valid workflow YAML file", async () => {
  const validYaml = `
id: test-import-basic
name: Test Import Basic
version: 1
description: Test workflow for import functionality

agents:
  - id: test-agent
    role: Test agent for basic import
    description: Handles basic testing tasks
    workspace:
      baseDir: agents/test-agent
      files:
        README.md: agents/test-agent/README.md
        test-file.txt: agents/test-agent/test-file.txt
    skills:
      - skill-name

steps:
  - id: test-step
    agent: test-agent
    input: "Test input"
    expects: "Test expects"
`;

  const yamlFile = await createTestYaml("valid-basic.yml", validYaml);
  const result = await importWorkflow(yamlFile);

  assert.strictEqual(result.workflowId, "test-import-basic");
  assert.strictEqual(result.isOverwrite, false);
  assert.strictEqual(result.message, 'Workflow "test-import-basic" imported successfully');
  assert.ok(result.size > 0);
  assert.strictEqual(result.importedFrom, path.resolve(yamlFile));

  // Verify workflow directory was created
  const workflowDir = resolveWorkflowDir("test-import-basic");
  assert.ok(await pathExists(workflowDir));

  // Verify workflow.yml was created
  const workflowYamlPath = path.join(workflowDir, "workflow.yml");
  assert.ok(await pathExists(workflowYamlPath));

  // Verify agents directory structure was created
  const agentsDir = path.join(workflowDir, "agents", "test-agent");
  assert.ok(await pathExists(agentsDir));

  // Verify workspace files were created
  const readmePath = path.join(agentsDir, "README.md");
  const testFilePath = path.join(agentsDir, "test-file.txt");
  assert.ok(await pathExists(readmePath));
  assert.ok(await pathExists(testFilePath));

  await cleanupWorkflow("test-import-basic");
});

test("importWorkflow() validates YAML structure before import", async () => {
  const invalidYaml = `
id: test-invalid
# Missing required fields: name, agents, steps
version: 1
`;

  const yamlFile = await createTestYaml("invalid.yml", invalidYaml);

  await assert.rejects(
    async () => await importWorkflow(yamlFile),
    (err: Error) => {
      assert.ok(err.message.includes("Workflow validation failed"));
      return true;
    }
  );
});

test("importWorkflow() validates YAML syntax", async () => {
  const malformedYaml = `
id: test-malformed
name: Test
agents:
  - id: agent1
    role: Test
  - invalid yaml structure here [
steps:
`;

  const yamlFile = await createTestYaml("malformed.yml", malformedYaml);

  await assert.rejects(
    async () => await importWorkflow(yamlFile),
    (err: Error) => {
      assert.ok(err.message.includes("Workflow validation failed"));
      return true;
    }
  );
});

test("importWorkflow() checks for workflow ID conflicts and prevents overwrites", async () => {
  const yamlContent = `
id: test-conflict-check
name: Test Conflict Check
version: 1
description: Test workflow for conflict checking

agents:
  - id: test-agent
    role: Test agent
    description: Test agent for conflict checking
    workspace:
      baseDir: agents/test-agent
      files:
        README.md: agents/test-agent/README.md

steps:
  - id: test-step
    agent: test-agent
    input: "Test input"
    expects: "Test expects"
`;

  const yamlFile = await createTestYaml("conflict-check.yml", yamlContent);

  // First import should succeed
  const result1 = await importWorkflow(yamlFile);
  assert.strictEqual(result1.workflowId, "test-conflict-check");
  assert.strictEqual(result1.isOverwrite, false);

  // Second import without overwrite should fail
  await assert.rejects(
    async () => await importWorkflow(yamlFile),
    (err: Error) => {
      assert.ok(err.message.includes('Workflow "test-conflict-check" already exists'));
      assert.ok(err.message.includes("Use --overwrite to replace it"));
      return true;
    }
  );

  await cleanupWorkflow("test-conflict-check");
});

test("importWorkflow() supports --overwrite flag to replace existing workflows", async () => {
  const originalYaml = `
id: test-overwrite
name: Original Test Workflow
version: 1
description: Original workflow

agents:
  - id: original-agent
    role: Original agent
    description: Original test agent
    workspace:
      baseDir: agents/original-agent
      files:
        README.md: agents/original-agent/README.md

steps:
  - id: original-step
    agent: original-agent
    input: "Original input"
    expects: "Original expects"
`;

  const updatedYaml = `
id: test-overwrite
name: Updated Test Workflow
version: 2
description: Updated workflow

agents:
  - id: updated-agent
    role: Updated agent
    description: Updated test agent
    workspace:
      baseDir: agents/updated-agent
      files:
        README.md: agents/updated-agent/README.md

steps:
  - id: updated-step
    agent: updated-agent
    input: "Updated input"
    expects: "Updated expects"
`;

  const originalFile = await createTestYaml("original.yml", originalYaml);
  const updatedFile = await createTestYaml("updated.yml", updatedYaml);

  // First import
  const result1 = await importWorkflow(originalFile);
  assert.strictEqual(result1.isOverwrite, false);

  // Second import with overwrite
  const result2 = await importWorkflow(updatedFile, true);
  assert.strictEqual(result2.workflowId, "test-overwrite");
  assert.strictEqual(result2.isOverwrite, true);
  assert.ok(result2.message.includes("replaced existing version"));
  assert.ok(result2.backup, "Backup should be created for overwrite");

  // Verify the workflow was actually updated
  const workflowYamlPath = path.join(resolveWorkflowDir("test-overwrite"), "workflow.yml");
  const content = await fs.readFile(workflowYamlPath, "utf-8");
  assert.ok(content.includes("Updated Test Workflow"));
  assert.ok(content.includes("version: 2"));

  await cleanupWorkflow("test-overwrite");
});

test("importWorkflow() creates backup before overwrite operations", async () => {
  const originalYaml = `
id: test-backup-creation
name: Original Backup Test
version: 1
description: Test backup creation during overwrite

agents:
  - id: backup-agent
    role: Backup agent
    description: Agent for backup testing
    workspace:
      baseDir: agents/backup-agent
      files:
        README.md: agents/backup-agent/README.md

steps:
  - id: backup-step
    agent: backup-agent
    input: "Backup test input"
    expects: "Backup test expects"
`;

  const updatedYaml = `
id: test-backup-creation
name: Updated Backup Test
version: 2
description: Updated workflow for backup testing

agents:
  - id: updated-backup-agent
    role: Updated backup agent
    description: Updated agent for backup testing
    workspace:
      baseDir: agents/updated-backup-agent
      files:
        README.md: agents/updated-backup-agent/README.md

steps:
  - id: updated-backup-step
    agent: updated-backup-agent
    input: "Updated backup test input"
    expects: "Updated backup test expects"
`;

  const originalFile = await createTestYaml("backup-original.yml", originalYaml);
  const updatedFile = await createTestYaml("backup-updated.yml", updatedYaml);

  // First import
  await importWorkflow(originalFile);

  // Second import with overwrite (should create backup)
  const result = await importWorkflow(updatedFile, true);

  assert.ok(result.backup, "Backup should be created");
  assert.strictEqual(result.backup.workflowId, "test-backup-creation");
  assert.ok(result.backup.size > 0);
  assert.ok(await pathExists(result.backup.backupPath), "Backup directory should exist");

  // Verify backup contains the original workflow
  const backupWorkflowYml = path.join(result.backup.backupPath, "workflow.yml");
  assert.ok(await pathExists(backupWorkflowYml), "Backup workflow.yml should exist");
  const backupContent = await fs.readFile(backupWorkflowYml, "utf-8");
  assert.ok(backupContent.includes("Original Backup Test"));

  await cleanupWorkflow("test-backup-creation");
});

test("importWorkflow() handles missing import file", async () => {
  const nonExistentFile = path.join(testDir, "does-not-exist.yml");

  await assert.rejects(
    async () => await importWorkflow(nonExistentFile),
    (err: Error) => {
      assert.ok(err.message.includes("Import file not found"));
      return true;
    }
  );
});

test("importWorkflow() prevents overwriting bundled workflows", async () => {
  // Create a YAML file with the same ID as a bundled workflow
  const bundledWorkflowYaml = `
id: bug-fix
name: Fake Bug Fix Workflow
version: 1
description: Attempt to overwrite bundled workflow

agents:
  - id: fake-agent
    role: Fake agent
    description: Should not be allowed to import
    workspace:
      baseDir: agents/fake-agent
      files:
        README.md: agents/fake-agent/README.md

steps:
  - id: fake-step
    agent: fake-agent
    input: "Fake input"
    expects: "Fake expects"
`;

  const yamlFile = await createTestYaml("bundled-conflict.yml", bundledWorkflowYaml);

  await assert.rejects(
    async () => await importWorkflow(yamlFile),
    (err: Error) => {
      assert.ok(err.message.includes('Cannot import over bundled workflow "bug-fix"'));
      assert.ok(err.message.includes("read-only"));
      return true;
    }
  );
});

test("importWorkflow() creates proper directory structure for complex workflows", async () => {
  const complexYaml = `
id: test-complex-structure
name: Complex Structure Test
version: 1
description: Test complex workflow structure creation

agents:
  - id: agent-one
    role: First agent
    description: First agent with workspace
    workspace:
      baseDir: agents/agent-one
      files:
        config/settings.json: agents/agent-one/config/settings.json
        data/input.txt: agents/agent-one/data/input.txt
        logs/debug.log: agents/agent-one/logs/debug.log
    skills:
      - skill-one
      - skill-two

  - id: agent-two  
    role: Second agent
    description: Second agent with different workspace
    workspace:
      baseDir: agents/agent-two
      files:
        scripts/run.sh: agents/agent-two/scripts/run.sh
        templates/template.html: agents/agent-two/templates/template.html
    skills:
      - skill-three

steps:
  - id: step-one
    agent: agent-one
    input: "First step input"
    expects: "First step expects"

  - id: step-two
    agent: agent-two
    input: "Second step input"
    expects: "Second step expects"
    dependencies:
      - step-one
`;

  const yamlFile = await createTestYaml("complex-structure.yml", complexYaml);
  const result = await importWorkflow(yamlFile);

  assert.strictEqual(result.workflowId, "test-complex-structure");

  const workflowDir = resolveWorkflowDir("test-complex-structure");
  
  // Verify main structure
  assert.ok(await pathExists(path.join(workflowDir, "workflow.yml")));
  assert.ok(await pathExists(path.join(workflowDir, "agents")));

  // Verify agent directories
  const agentOneDir = path.join(workflowDir, "agents", "agent-one");
  const agentTwoDir = path.join(workflowDir, "agents", "agent-two");
  assert.ok(await pathExists(agentOneDir));
  assert.ok(await pathExists(agentTwoDir));

  // Verify workspace files for agent-one (with subdirectories)
  assert.ok(await pathExists(path.join(agentOneDir, "config", "settings.json")));
  assert.ok(await pathExists(path.join(agentOneDir, "data", "input.txt")));
  assert.ok(await pathExists(path.join(agentOneDir, "logs", "debug.log")));

  // Verify workspace files for agent-two
  assert.ok(await pathExists(path.join(agentTwoDir, "scripts", "run.sh")));
  assert.ok(await pathExists(path.join(agentTwoDir, "templates", "template.html")));

  await cleanupWorkflow("test-complex-structure");
});

test("importWorkflow() handles workflows with minimal structure", async () => {
  const minimalYaml = `
id: test-minimal-structure
name: Minimal Structure Test
version: 1
description: Test workflow with minimal structure

agents:
  - id: minimal-agent
    role: Minimal agent
    description: Minimal agent for testing
    workspace:
      baseDir: agents/minimal-agent
      files:
        README.md: agents/minimal-agent/README.md

steps:
  - id: minimal-step
    agent: minimal-agent
    input: "Minimal input"
    expects: "Minimal expects"
`;

  const yamlFile = await createTestYaml("minimal.yml", minimalYaml);
  const result = await importWorkflow(yamlFile);

  assert.strictEqual(result.workflowId, "test-minimal-structure");

  const workflowDir = resolveWorkflowDir("test-minimal-structure");
  assert.ok(await pathExists(path.join(workflowDir, "workflow.yml")));
  
  // Agents directory should be created with minimal-agent
  const agentsDir = path.join(workflowDir, "agents", "minimal-agent");
  assert.ok(await pathExists(agentsDir));

  await cleanupWorkflow("test-minimal-structure");
});

test("importWorkflow() preserves YAML formatting and comments", async () => {
  const yamlWithComments = `# This is a test workflow with comments
id: test-preserve-formatting
name: Preserve Formatting Test
version: 1
description: |
  This workflow tests that formatting 
  and comments are preserved during import

# Agent configuration
agents:
  - id: formatting-agent
    role: Formatting agent
    description: Tests formatting preservation
    workspace:
      baseDir: agents/formatting-agent
      files:
        test.txt: agents/formatting-agent/test.txt  # Simple test file

# Step definitions  
steps:
  - id: format-step
    agent: formatting-agent
    input: "Test input with formatting"
    expects: "Expected formatted output"
`;

  const yamlFile = await createTestYaml("preserve-formatting.yml", yamlWithComments);
  await importWorkflow(yamlFile);

  // Read the imported workflow.yml and verify comments are preserved
  const workflowYmlPath = path.join(resolveWorkflowDir("test-preserve-formatting"), "workflow.yml");
  const importedContent = await fs.readFile(workflowYmlPath, "utf-8");

  assert.ok(importedContent.includes("# This is a test workflow with comments"));
  assert.ok(importedContent.includes("# Agent configuration"));
  assert.ok(importedContent.includes("# Step definitions"));
  assert.ok(importedContent.includes("# Simple test file"));
  assert.ok(importedContent.includes("description: |"));

  await cleanupWorkflow("test-preserve-formatting");
});

test("workflow import - cleanup test directory", async () => {
  await cleanupTestDir();
});