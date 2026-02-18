import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createWorkflowBackup, listWorkflowBackups, backupExists } from "../dist/installer/workflow-backup.js";
import type { BackupResult } from "../src/installer/workflow-backup.js";

// Test workspace setup
let tempDir: string;
let originalEnv: string | undefined;

async function setupTestWorkspace() {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "antfarm-backup-test-"));
  originalEnv = process.env.OPENCLAW_STATE_DIR;
  process.env.OPENCLAW_STATE_DIR = tempDir;
}

async function cleanupTestWorkspace() {
  if (originalEnv !== undefined) {
    process.env.OPENCLAW_STATE_DIR = originalEnv;
  } else {
    delete process.env.OPENCLAW_STATE_DIR;
  }
  if (tempDir) {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

async function createTestWorkflow(workflowId: string, includeAgentDir = true): Promise<string> {
  const workflowDir = path.join(tempDir, "antfarm", "workflows", workflowId);
  await fs.mkdir(workflowDir, { recursive: true });

  // Create workflow.yml
  const workflowYml = `
id: ${workflowId}
name: Test Workflow
version: 1
agents:
  - id: test-agent
    workspace:
      baseDir: test-workspace
      files:
        "test.md": "Test content"
steps:
  - id: step1
    agent: test-agent
    input: Test input
    expects: Test output
`;
  await fs.writeFile(path.join(workflowDir, "workflow.yml"), workflowYml.trim());

  // Create agent directory if requested
  if (includeAgentDir) {
    const agentDir = path.join(workflowDir, "agents");
    await fs.mkdir(agentDir, { recursive: true });
    await fs.writeFile(path.join(agentDir, "test-agent.md"), "Agent instructions");
  }

  return workflowDir;
}

test("createWorkflowBackup - successfully backs up workflow", async () => {
  await setupTestWorkspace();
  try {
    const workflowId = "test-workflow";
    await createTestWorkflow(workflowId);

    const result = await createWorkflowBackup(workflowId);

    assert(result.backupPath.includes(workflowId));
    assert(result.workflowId === workflowId);
    assert(typeof result.timestamp === "string");
    assert(result.timestamp.match(/\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}/));
    assert(typeof result.size === "number");
    assert(result.size > 0);

    // Verify backup directory exists
    const backupExists = await fs.access(result.backupPath).then(() => true, () => false);
    assert(backupExists);

    // Verify workflow.yml exists in backup
    const workflowYmlBackup = path.join(result.backupPath, "workflow.yml");
    const workflowYmlExists = await fs.access(workflowYmlBackup).then(() => true, () => false);
    assert(workflowYmlExists);

    // Verify agents directory exists in backup
    const agentsDirBackup = path.join(result.backupPath, "agents");
    const agentsDirExists = await fs.access(agentsDirBackup).then(() => true, () => false);
    assert(agentsDirExists);

    // Verify agent file exists in backup
    const agentFileBackup = path.join(agentsDirBackup, "test-agent.md");
    const agentFileExists = await fs.access(agentFileBackup).then(() => true, () => false);
    assert(agentFileExists);

  } finally {
    await cleanupTestWorkspace();
  }
});

test("createWorkflowBackup - fails for non-existent workflow", async () => {
  await setupTestWorkspace();
  try {
    await assert.rejects(
      createWorkflowBackup("non-existent-workflow"),
      /Workflow directory not found/
    );
  } finally {
    await cleanupTestWorkspace();
  }
});

test("createWorkflowBackup - fails when workflow.yml missing", async () => {
  await setupTestWorkspace();
  try {
    const workflowId = "invalid-workflow";
    const workflowDir = path.join(tempDir, "antfarm", "workflows", workflowId);
    await fs.mkdir(workflowDir, { recursive: true });
    // Don't create workflow.yml

    await assert.rejects(
      createWorkflowBackup(workflowId),
      /workflow.yml not found/
    );
  } finally {
    await cleanupTestWorkspace();
  }
});

test("createWorkflowBackup - fails for invalid workflow spec", async () => {
  await setupTestWorkspace();
  try {
    const workflowId = "invalid-spec-workflow";
    const workflowDir = path.join(tempDir, "antfarm", "workflows", workflowId);
    await fs.mkdir(workflowDir, { recursive: true });

    // Create invalid workflow.yml (missing required fields)
    const invalidYml = `
id: ${workflowId}
name: Invalid Workflow
# Missing agents and steps
`;
    await fs.writeFile(path.join(workflowDir, "workflow.yml"), invalidYml.trim());

    await assert.rejects(
      createWorkflowBackup(workflowId),
      /Invalid workflow spec/
    );
  } finally {
    await cleanupTestWorkspace();
  }
});

test("createWorkflowBackup - backs up workflow without agent directory", async () => {
  await setupTestWorkspace();
  try {
    const workflowId = "minimal-workflow";
    await createTestWorkflow(workflowId, false); // No agent directory

    const result = await createWorkflowBackup(workflowId);

    assert(result.workflowId === workflowId);
    assert(result.size > 0);

    // Verify backup exists and has workflow.yml
    const workflowYmlBackup = path.join(result.backupPath, "workflow.yml");
    const workflowYmlExists = await fs.access(workflowYmlBackup).then(() => true, () => false);
    assert(workflowYmlExists);

  } finally {
    await cleanupTestWorkspace();
  }
});

test("createWorkflowBackup - generates unique backup paths", async () => {
  await setupTestWorkspace();
  try {
    const workflowId = "unique-test-workflow";
    await createTestWorkflow(workflowId);

    const result1 = await createWorkflowBackup(workflowId);
    
    // Small delay to ensure different timestamp
    await new Promise(resolve => setTimeout(resolve, 1100));
    
    const result2 = await createWorkflowBackup(workflowId);

    assert(result1.backupPath !== result2.backupPath);
    assert(result1.timestamp !== result2.timestamp);

    // Both backups should exist
    const backup1Exists = await fs.access(result1.backupPath).then(() => true, () => false);
    const backup2Exists = await fs.access(result2.backupPath).then(() => true, () => false);
    assert(backup1Exists);
    assert(backup2Exists);

  } finally {
    await cleanupTestWorkspace();
  }
});

test("listWorkflowBackups - returns empty array when no backups exist", async () => {
  await setupTestWorkspace();
  try {
    const backups = await listWorkflowBackups();
    assert.deepEqual(backups, []);
  } finally {
    await cleanupTestWorkspace();
  }
});

test("listWorkflowBackups - lists all backups", async () => {
  await setupTestWorkspace();
  try {
    const workflowId1 = "workflow1";
    const workflowId2 = "workflow2";
    
    await createTestWorkflow(workflowId1);
    await createTestWorkflow(workflowId2);

    const backup1 = await createWorkflowBackup(workflowId1);
    
    // Small delay to ensure different timestamp
    await new Promise(resolve => setTimeout(resolve, 1100));
    
    const backup2 = await createWorkflowBackup(workflowId2);

    const backups = await listWorkflowBackups();

    assert(backups.length === 2);
    assert(backups.some(b => b.workflowId === workflowId1));
    assert(backups.some(b => b.workflowId === workflowId2));
    
    // Should be sorted by timestamp (newest first)
    assert(backups[0].timestamp >= backups[1].timestamp);

  } finally {
    await cleanupTestWorkspace();
  }
});

test("listWorkflowBackups - filters by workflow ID", async () => {
  await setupTestWorkspace();
  try {
    const workflowId1 = "workflow1";
    const workflowId2 = "workflow2";
    
    await createTestWorkflow(workflowId1);
    await createTestWorkflow(workflowId2);

    await createWorkflowBackup(workflowId1);
    await createWorkflowBackup(workflowId2);

    const backups1 = await listWorkflowBackups(workflowId1);
    const backups2 = await listWorkflowBackups(workflowId2);

    assert(backups1.length === 1);
    assert(backups1[0].workflowId === workflowId1);
    
    assert(backups2.length === 1);
    assert(backups2[0].workflowId === workflowId2);

  } finally {
    await cleanupTestWorkspace();
  }
});

test("listWorkflowBackups - handles multiple backups for same workflow", async () => {
  await setupTestWorkspace();
  try {
    const workflowId = "multi-backup-workflow";
    await createTestWorkflow(workflowId);

    const backup1 = await createWorkflowBackup(workflowId);
    
    // Small delay to ensure different timestamp
    await new Promise(resolve => setTimeout(resolve, 1100));
    
    const backup2 = await createWorkflowBackup(workflowId);

    const backups = await listWorkflowBackups(workflowId);

    assert(backups.length === 2);
    assert(backups.every(b => b.workflowId === workflowId));
    
    // Should be sorted by timestamp (newest first)
    assert(backups[0].timestamp >= backups[1].timestamp);

  } finally {
    await cleanupTestWorkspace();
  }
});

test("backupExists - returns true for existing backup", async () => {
  await setupTestWorkspace();
  try {
    const workflowId = "exists-test-workflow";
    await createTestWorkflow(workflowId);

    const result = await createWorkflowBackup(workflowId);
    const exists = await backupExists(workflowId, result.timestamp);

    assert(exists === true);

  } finally {
    await cleanupTestWorkspace();
  }
});

test("backupExists - returns false for non-existent backup", async () => {
  await setupTestWorkspace();
  try {
    const exists = await backupExists("non-existent", "2024-01-01_12-00-00");
    assert(exists === false);
  } finally {
    await cleanupTestWorkspace();
  }
});

test("createWorkflowBackup - backup path format is correct", async () => {
  await setupTestWorkspace();
  try {
    const workflowId = "format-test-workflow";
    await createTestWorkflow(workflowId);

    const result = await createWorkflowBackup(workflowId);

    // Should be in format: ~/.openclaw/antfarm/backups/<workflow-id>-<timestamp>
    assert(result.backupPath.includes("/antfarm/backups/"));
    assert(result.backupPath.includes(`${workflowId}-`));
    assert(result.backupPath.endsWith(result.timestamp));

    // Extract and validate timestamp format
    const timestampMatch = result.timestamp.match(/^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}-\d{3}$/);
    assert(timestampMatch, "Timestamp should match YYYY-MM-DD_HH-MM-SS-sss format");

  } finally {
    await cleanupTestWorkspace();
  }
});

test("createWorkflowBackup - preserves file content", async () => {
  await setupTestWorkspace();
  try {
    const workflowId = "content-test-workflow";
    const workflowDir = await createTestWorkflow(workflowId);

    // Add additional test content
    const testContent = "This is test content that should be preserved";
    await fs.writeFile(path.join(workflowDir, "test-file.txt"), testContent);

    const result = await createWorkflowBackup(workflowId);

    // Verify original content is preserved in backup
    const backedUpContent = await fs.readFile(path.join(result.backupPath, "test-file.txt"), "utf-8");
    assert(backedUpContent === testContent);

    // Verify workflow.yml content is preserved
    const originalWorkflowYml = await fs.readFile(path.join(workflowDir, "workflow.yml"), "utf-8");
    const backedUpWorkflowYml = await fs.readFile(path.join(result.backupPath, "workflow.yml"), "utf-8");
    assert(originalWorkflowYml === backedUpWorkflowYml);

  } finally {
    await cleanupTestWorkspace();
  }
});