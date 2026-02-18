import fs from "node:fs/promises";
import path from "node:path";
import { resolveAntfarmRoot, resolveWorkflowDir } from "./paths.js";
import { loadWorkflowSpec } from "./workflow-spec.js";

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

async function copyDirectory(sourceDir: string, destinationDir: string): Promise<void> {
  await fs.cp(sourceDir, destinationDir, { recursive: true });
}

function resolveBackupRoot(): string {
  return path.join(resolveAntfarmRoot(), "backups");
}

function generateTimestamp(): string {
  const now = new Date();
  return now.toISOString().replace(/[:.]/g, "-").replace("T", "_").slice(0, 19);
}

export interface BackupResult {
  backupPath: string;
  workflowId: string;
  timestamp: string;
  size: number;
}

/**
 * Create a backup of a workflow before edit/delete operations.
 * Backs up the entire workflow directory including workflow.yml and agent directories.
 * 
 * @param workflowId - The ID of the workflow to backup
 * @returns Promise<BackupResult> - Contains backup path and metadata
 */
export async function createWorkflowBackup(workflowId: string): Promise<BackupResult> {
  // Validate workflow exists
  const workflowDir = resolveWorkflowDir(workflowId);
  
  if (!(await pathExists(workflowDir))) {
    throw new Error(`Workflow directory not found: ${workflowDir}`);
  }

  // Validate workflow.yml exists and is valid
  const workflowYmlPath = path.join(workflowDir, "workflow.yml");
  if (!(await pathExists(workflowYmlPath))) {
    throw new Error(`workflow.yml not found in: ${workflowDir}`);
  }

  // Load and validate the workflow spec
  try {
    await loadWorkflowSpec(workflowDir);
  } catch (err) {
    throw new Error(`Invalid workflow spec: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Generate backup path with timestamp
  const timestamp = generateTimestamp();
  const backupRoot = resolveBackupRoot();
  const backupDirName = `${workflowId}-${timestamp}`;
  const backupPath = path.join(backupRoot, backupDirName);

  // Ensure backup directory exists
  await ensureDir(backupRoot);

  // Check if backup already exists (should be rare due to timestamp precision)
  if (await pathExists(backupPath)) {
    throw new Error(`Backup already exists: ${backupPath}`);
  }

  // Create the backup by copying the entire workflow directory
  try {
    await copyDirectory(workflowDir, backupPath);
  } catch (err) {
    throw new Error(`Failed to create backup: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Calculate backup size for confirmation
  let totalSize = 0;
  async function calculateSize(dir: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isFile()) {
        const stats = await fs.stat(fullPath);
        totalSize += stats.size;
      } else if (entry.isDirectory()) {
        await calculateSize(fullPath);
      }
    }
  }

  await calculateSize(backupPath);

  return {
    backupPath,
    workflowId,
    timestamp,
    size: totalSize
  };
}

/**
 * List all backups for a workflow or all workflows.
 * 
 * @param workflowId - Optional workflow ID to filter backups
 * @returns Promise<BackupResult[]> - List of available backups
 */
export async function listWorkflowBackups(workflowId?: string): Promise<BackupResult[]> {
  const backupRoot = resolveBackupRoot();
  
  if (!(await pathExists(backupRoot))) {
    return [];
  }

  const backups: BackupResult[] = [];
  const entries = await fs.readdir(backupRoot, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    // Parse backup directory name: <workflow-id>-<timestamp>
    const match = entry.name.match(/^(.+)-(\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2})$/);
    if (!match) continue;

    const [, backupWorkflowId, timestamp] = match;
    
    // Filter by workflow ID if specified
    if (workflowId && backupWorkflowId !== workflowId) continue;

    const backupPath = path.join(backupRoot, entry.name);
    
    // Calculate backup size
    let totalSize = 0;
    try {
      async function calculateSize(dir: string): Promise<void> {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isFile()) {
            const stats = await fs.stat(fullPath);
            totalSize += stats.size;
          } else if (entry.isDirectory()) {
            await calculateSize(fullPath);
          }
        }
      }
      await calculateSize(backupPath);
    } catch {
      // Skip backups that can't be accessed
      continue;
    }

    backups.push({
      backupPath,
      workflowId: backupWorkflowId,
      timestamp,
      size: totalSize
    });
  }

  // Sort by timestamp (newest first)
  return backups.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

/**
 * Check if a backup exists for a specific workflow and timestamp.
 * 
 * @param workflowId - The workflow ID
 * @param timestamp - The backup timestamp
 * @returns Promise<boolean> - Whether the backup exists
 */
export async function backupExists(workflowId: string, timestamp: string): Promise<boolean> {
  const backupRoot = resolveBackupRoot();
  const backupDirName = `${workflowId}-${timestamp}`;
  const backupPath = path.join(backupRoot, backupDirName);
  return pathExists(backupPath);
}