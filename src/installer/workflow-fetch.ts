import fs from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
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
 * List all available bundled workflows (recursive, one level deep)
 * Dedupes by workflow ID, preferring nested paths over root.
 */
export async function listBundledWorkflows(): Promise<string[]> {
  const bundledDir = resolveBundledWorkflowsDir();
  const workflows: string[] = [];
  const seenIds = new Set<string>();

  async function scanDir(dir: string, prefix = ""): Promise<void> {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const subDir = path.join(dir, entry.name);
        const workflowYml = path.join(subDir, "workflow.yml");

        if (await pathExists(workflowYml)) {
          // Found a workflow — read its ID for deduping
          try {
            const content = await fs.readFile(workflowYml, "utf-8");
            const parsed = YAML.parse(content);
            const workflowId = parsed.id ?? entry.name;

            // Skip if already seen (dedupe, prefer nested = scanned first)
            if (seenIds.has(workflowId)) continue;
            seenIds.add(workflowId);

            const fullId = prefix ? `${prefix}/${entry.name}` : entry.name;
            workflows.push(fullId);
          } catch {
            // Skip malformed workflow files
          }
        } else if (!prefix) {
          // No workflow.yml — recurse one level (e.g., programming/, family/)
          await scanDir(subDir, entry.name);
        }
      }
    } catch {
      // Ignore errors
    }
  }

  await scanDir(bundledDir);
  return workflows;
}

/**
 * Fetch a bundled workflow by name.
 * Copies from the antfarm package's workflows/ directory to the user's installed workflows.
 * Supports nested paths like "programming/feature-dev".
 */
export async function fetchWorkflow(workflowId: string): Promise<{ workflowDir: string; bundledSourceDir: string }> {
  // Handle nested paths (e.g., "programming/feature-dev")
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
