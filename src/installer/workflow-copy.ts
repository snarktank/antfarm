import { mkdir, readFile, writeFile, cp, access } from "node:fs/promises";
import { resolveAntfarmRoot, resolveWorkflowDir, resolveBundledWorkflowDir } from "./paths.js";
import { loadWorkflowSpec } from "./workflow-spec.js";
import { listBundledWorkflows } from "./workflow-fetch.js";
import { validateWorkflowYaml } from "./workflow-validation.js";
import { join } from "node:path";
import YAML from "yaml";

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export interface WorkflowCopyResult {
  sourceId: string;
  targetId: string;
  message: string;
  sourcePath: string;
  targetPath: string;
  size: number;
}

/**
 * Copy an existing workflow with a new ID
 */
export async function copyWorkflow(sourceId: string, newId: string): Promise<WorkflowCopyResult> {
  // Validate new workflow ID format (follows same pattern as other commands)
  if (!newId || !/^[a-z0-9-]+$/.test(newId)) {
    throw new Error("New workflow ID must contain only lowercase letters, numbers, and hyphens");
  }

  // Check if source workflow exists
  const bundledWorkflows = await listBundledWorkflows();
  if (!bundledWorkflows.includes(sourceId)) {
    const available = bundledWorkflows.length > 0 ? bundledWorkflows.join(", ") : "none";
    throw new Error(`Source workflow "${sourceId}" not found. Available workflows: ${available}`);
  }

  // Check if target workflow ID already exists
  if (bundledWorkflows.includes(newId)) {
    throw new Error(`Workflow ID "${newId}" already exists. Choose a different ID.`);
  }

  // Also check if target exists in user workspace
  const antfarmRoot = resolveAntfarmRoot();
  const userWorkflowsDir = join(antfarmRoot, "workflows");
  const targetPath = join(userWorkflowsDir, newId);
  
  if (await pathExists(targetPath)) {
    throw new Error(`Workflow ID "${newId}" already exists in user workspace. Choose a different ID.`);
  }

  // Resolve source path - bundled workflows are in a different location
  const sourceDir = resolveBundledWorkflowDir(sourceId);
  
  // Validate source workflow by loading it
  await loadWorkflowSpec(sourceDir);
  
  // Create user workflows directory if it doesn't exist
  await mkdir(userWorkflowsDir, { recursive: true });
  
  // Copy entire workflow directory
  await cp(sourceDir, targetPath, { recursive: true });
  
  // Update workflow.yml with new ID and name
  const workflowYmlPath = join(targetPath, "workflow.yml");
  const originalContent = await readFile(workflowYmlPath, "utf-8");
  
  // Parse, modify, and write back YAML
  const parsedWorkflow = YAML.parse(originalContent);
  parsedWorkflow.id = newId;
  parsedWorkflow.name = `${parsedWorkflow.name} (Copy)`;
  
  const updatedContent = YAML.stringify(parsedWorkflow, { 
    // Preserve formatting as much as possible
    lineWidth: 0,
    minContentWidth: 0,
    nullStr: "null"
  });
  
  await writeFile(workflowYmlPath, updatedContent, "utf-8");
  
  // Validate the copied workflow
  const validation = validateWorkflowYaml(updatedContent);
  if (!validation.valid) {
    throw new Error(`Copied workflow validation failed: ${validation.errors.map(e => e.message).join(", ")}`);
  }
  
  // Calculate size of copied directory
  const { stat } = await import("node:fs/promises");
  const stats = await stat(targetPath);
  
  return {
    sourceId,
    targetId: newId,
    message: `Successfully copied workflow "${sourceId}" to "${newId}"`,
    sourcePath: sourceDir,
    targetPath,
    size: await calculateDirectorySize(targetPath)
  };
}

/**
 * Calculate total size of directory recursively
 */
async function calculateDirectorySize(dirPath: string): Promise<number> {
  const { readdir, stat } = await import("node:fs/promises");
  let totalSize = 0;
  
  try {
    const entries = await readdir(dirPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const entryPath = join(dirPath, entry.name);
      
      if (entry.isDirectory()) {
        totalSize += await calculateDirectorySize(entryPath);
      } else if (entry.isFile()) {
        const stats = await stat(entryPath);
        totalSize += stats.size;
      }
    }
  } catch {
    // Ignore errors calculating size
  }
  
  return totalSize;
}