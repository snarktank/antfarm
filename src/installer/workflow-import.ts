import fs from "node:fs/promises";
import path from "node:path";
import { resolveWorkflowDir, resolveWorkflowRoot } from "./paths.js";
import { validateWorkflowYaml } from "./workflow-validation.js";
import { createWorkflowBackup, type BackupResult } from "./workflow-backup.js";
import { listBundledWorkflows } from "./workflow-fetch.js";

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

export interface WorkflowImportResult {
  workflowId: string;
  message: string;
  isOverwrite: boolean;
  backup?: BackupResult;
  importedFrom: string;
  size: number;
}

/**
 * Import a workflow from a YAML file with validation and conflict handling.
 * Creates the workflow directory structure needed for Antfarm workflows.
 * 
 * @param filePath - Path to the YAML file to import
 * @param overwrite - Whether to overwrite existing workflows
 * @returns Promise<WorkflowImportResult> - Contains import results and metadata
 */
export async function importWorkflow(filePath: string, overwrite = false): Promise<WorkflowImportResult> {
  // Validate input file exists
  if (!(await pathExists(filePath))) {
    throw new Error(`Import file not found: ${filePath}`);
  }

  // Read and validate YAML content
  const yamlContent = await fs.readFile(filePath, "utf-8");
  const validation = validateWorkflowYaml(yamlContent);
  
  if (!validation.valid) {
    const errorMessages = validation.errors.map(e => 
      e.field ? `${e.field}: ${e.message}` : e.message
    ).join(", ");
    throw new Error(`Workflow validation failed: ${errorMessages}`);
  }

  const workflow = validation.parsedWorkflow!;
  const workflowId = workflow.id;

  // Check for existing workflow conflicts
  const existingWorkflowDir = resolveWorkflowDir(workflowId);
  const workflowExists = await pathExists(existingWorkflowDir);
  
  // Also check if it's a bundled workflow (read-only)
  const bundledWorkflows = await listBundledWorkflows();
  const isBundledWorkflow = bundledWorkflows.includes(workflowId);
  
  if (isBundledWorkflow) {
    throw new Error(`Cannot import over bundled workflow "${workflowId}". Bundled workflows are read-only.`);
  }

  if (workflowExists && !overwrite) {
    throw new Error(`Workflow "${workflowId}" already exists. Use --overwrite to replace it.`);
  }

  let backup: BackupResult | undefined;
  const isOverwrite = workflowExists;

  // Create backup before overwrite
  if (isOverwrite) {
    try {
      backup = await createWorkflowBackup(workflowId);
    } catch (error) {
      throw new Error(`Failed to create backup before overwrite: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Ensure workflow root directory exists
  await ensureDir(resolveWorkflowRoot());

  // Create the workflow directory
  const workflowDir = resolveWorkflowDir(workflowId);
  await ensureDir(workflowDir);

  // Write the workflow.yml file
  const workflowYamlPath = path.join(workflowDir, "workflow.yml");
  await fs.writeFile(workflowYamlPath, yamlContent, "utf-8");

  // Create agents directory structure if agents are defined
  if (workflow.agents && workflow.agents.length > 0) {
    const agentsDir = path.join(workflowDir, "agents");
    await ensureDir(agentsDir);

    // Create directory for each agent
    for (const agent of workflow.agents) {
      const agentDir = path.join(agentsDir, agent.id);
      await ensureDir(agentDir);
      
      // Create empty workspace files if specified in agent configuration
      if (agent.workspace && typeof agent.workspace === "object" && agent.workspace.files) {
        for (const [fileName] of Object.entries(agent.workspace.files)) {
          const filePath = path.join(agentDir, fileName);
          const fileDir = path.dirname(filePath);
          await ensureDir(fileDir);
          
          // Create empty file if it doesn't exist
          if (!(await pathExists(filePath))) {
            await fs.writeFile(filePath, "", "utf-8");
          }
        }
      }
    }
  }

  const size = Buffer.byteLength(yamlContent, "utf-8");
  const message = isOverwrite 
    ? `Workflow "${workflowId}" imported and replaced existing version (backup created)`
    : `Workflow "${workflowId}" imported successfully`;

  return {
    workflowId,
    message,
    isOverwrite,
    backup,
    importedFrom: path.resolve(filePath),
    size,
  };
}