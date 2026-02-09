import fs from "node:fs/promises";
import path from "node:path";
import { resolveBundledWorkflowDir, resolveBundledWorkflowsDir, resolveWorkflowDir, resolveWorkflowRoot } from "./paths.js";

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

async function copyDirectory(sourceDir: string, destinationDir: string) {
  await fs.rm(destinationDir, { recursive: true, force: true });
  await ensureDir(path.dirname(destinationDir));
  await fs.cp(sourceDir, destinationDir, { recursive: true });
}

/**
 * List all available bundled workflows
 */
export async function listBundledWorkflows(): Promise<string[]> {
  const bundledDir = resolveBundledWorkflowsDir();
  try {
    const entries = await fs.readdir(bundledDir, { withFileTypes: true });
    const workflows: string[] = [];
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const workflowYml = path.join(bundledDir, entry.name, "workflow.yml");
        if (await pathExists(workflowYml)) {
          workflows.push(entry.name);
        }
      }
    }
    return workflows;
  } catch {
    return [];
  }
}

/**
 * Fetch a bundled workflow by name.
 * Copies from the antfarm package's workflows/ directory to the user's installed workflows.
 */
export async function fetchWorkflow(workflowId: string): Promise<{ workflowDir: string; bundledSourceDir: string }> {
  const bundledDir = resolveBundledWorkflowDir(workflowId);
  const workflowYml = path.join(bundledDir, "workflow.yml");
  
  if (!(await pathExists(workflowYml))) {
    const available = await listBundledWorkflows();
    const availableStr = available.length > 0 ? `Available: ${available.join(", ")}` : "No workflows bundled.";
    throw new Error(`Workflow "${workflowId}" not found. ${availableStr}`);
  }
  
  await ensureDir(resolveWorkflowRoot());
  const destination = resolveWorkflowDir(workflowId);
  await copyDirectory(bundledDir, destination);
  
  return { workflowDir: destination, bundledSourceDir: bundledDir };
}
