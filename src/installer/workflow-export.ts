import { resolveBundledWorkflowDir } from "./paths.js";
import { listBundledWorkflows } from "./workflow-fetch.js";
import fs from "node:fs/promises";

export interface WorkflowExportResult {
  workflowId: string;
  yamlContent: string;
  size: number;
  outputPath?: string;
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function exportWorkflow(workflowId: string, outputPath?: string): Promise<WorkflowExportResult> {
  // Check if workflow exists in bundled workflows
  const bundledWorkflows = await listBundledWorkflows();
  if (!bundledWorkflows.includes(workflowId)) {
    const availableStr = bundledWorkflows.length > 0 ? `Available: ${bundledWorkflows.join(", ")}` : "No workflows available.";
    throw new Error(`Workflow "${workflowId}" not found. ${availableStr}`);
  }

  const workflowDir = resolveBundledWorkflowDir(workflowId);
  if (!(await pathExists(workflowDir))) {
    throw new Error(`Workflow directory "${workflowDir}" not found.`);
  }

  const workflowYamlPath = `${workflowDir}/workflow.yml`;
  if (!(await pathExists(workflowYamlPath))) {
    throw new Error(`Workflow YAML file "${workflowYamlPath}" not found.`);
  }

  // Read the raw YAML content to preserve formatting and comments
  const yamlContent = await fs.readFile(workflowYamlPath, "utf-8");

  // If output path is provided, write to file
  if (outputPath) {
    // Create parent directories if they don't exist
    const path = await import("node:path");
    const parentDir = path.dirname(outputPath);
    await fs.mkdir(parentDir, { recursive: true });
    await fs.writeFile(outputPath, yamlContent, "utf-8");
  }

  return {
    workflowId,
    yamlContent,
    size: Buffer.byteLength(yamlContent, "utf-8"),
    outputPath,
  };
}