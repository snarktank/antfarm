import fs from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { resolveWorkflowDir, resolveWorkflowRoot, resolveWorkflowWorkspaceDir, resolveWorkflowWorkspaceRoot } from "./paths.js";
import { loadWorkflowSpec } from "./workflow-spec.js";
import { listBundledWorkflows } from "./workflow-fetch.js";
import { validateWorkflowYaml } from "./workflow-validation.js";
import { checkActiveRuns } from "./uninstall.js";
import { readOpenClawConfig, writeOpenClawConfig } from "./openclaw-config.js";
import { removeAgentCrons, setupAgentCrons } from "./agent-cron.js";
import { removeSubagentAllowlist, addSubagentAllowlist } from "./subagent-allowlist.js";
import { getDb } from "../db.js";

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function updateDatabaseRecords(oldWorkflowId: string, newWorkflowId: string): void {
  try {
    const db = getDb();
    db.prepare("UPDATE runs SET workflow_id = ? WHERE workflow_id = ?").run(newWorkflowId, oldWorkflowId);
  } catch {
    // DB might not exist yet
  }
}

function filterAgentList(
  list: Array<Record<string, unknown>>,
  workflowId: string,
): Array<Record<string, unknown>> {
  const prefix = `${workflowId}_`;
  return list.filter((entry) => {
    const id = typeof entry.id === "string" ? entry.id : "";
    return !id.startsWith(prefix);
  });
}

export interface WorkflowRenameResult {
  oldWorkflowId: string;
  newWorkflowId: string;
  message: string;
  oldPath: string;
  newPath: string;
  updatedAgents: string[];
}

/**
 * Rename a workflow by changing its directory name, updating the workflow ID in workflow.yml,
 * and updating all internal references including agent registrations and database records.
 * Blocks rename if active runs exist.
 * 
 * @param oldWorkflowId - Current workflow ID to rename
 * @param newWorkflowId - New workflow ID  
 * @returns Promise<WorkflowRenameResult> - Contains rename metadata and updated agents list
 */
export async function renameWorkflow(oldWorkflowId: string, newWorkflowId: string): Promise<WorkflowRenameResult> {
  // Validate new workflow ID format (follows same pattern as copy command)
  if (!newWorkflowId || !/^[a-z0-9-]+$/.test(newWorkflowId)) {
    throw new Error("New workflow ID must contain only lowercase letters, numbers, and hyphens");
  }

  // Check if old workflow exists
  const oldWorkflowDir = resolveWorkflowDir(oldWorkflowId);
  if (!(await pathExists(oldWorkflowDir))) {
    throw new Error(`Workflow not found: ${oldWorkflowId}`);
  }

  // Validate workflow.yml exists and is valid
  const workflowYmlPath = path.join(oldWorkflowDir, "workflow.yml");
  if (!(await pathExists(workflowYmlPath))) {
    throw new Error(`Invalid workflow: workflow.yml not found in ${oldWorkflowDir}`);
  }

  // Load and validate the workflow spec
  let workflow;
  try {
    workflow = await loadWorkflowSpec(oldWorkflowDir);
  } catch (err) {
    throw new Error(`Invalid workflow spec: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Check if new workflow ID already exists
  const bundledWorkflows = await listBundledWorkflows();
  if (bundledWorkflows.includes(newWorkflowId)) {
    throw new Error(`Workflow ID "${newWorkflowId}" already exists as a bundled workflow. Choose a different ID.`);
  }

  const newWorkflowDir = resolveWorkflowDir(newWorkflowId);
  if (await pathExists(newWorkflowDir)) {
    throw new Error(`Workflow ID "${newWorkflowId}" already exists. Choose a different ID.`);
  }

  // Check for active runs - block rename if found
  const activeRuns = checkActiveRuns(oldWorkflowId);
  if (activeRuns.length > 0) {
    throw new Error(
      `Cannot rename workflow "${oldWorkflowId}": ${activeRuns.length} active run(s) found. ` +
      `Stop all active runs before renaming.`
    );
  }

  // Read and update workflow.yml content
  const originalYamlContent = await fs.readFile(workflowYmlPath, "utf-8");
  const parsedWorkflow = YAML.parse(originalYamlContent);
  parsedWorkflow.id = newWorkflowId;

  const updatedYamlContent = YAML.stringify(parsedWorkflow, {
    // Preserve formatting as much as possible
    lineWidth: 0,
    minContentWidth: 0,
    nullStr: "null"
  });

  // Validate the updated workflow
  const validation = validateWorkflowYaml(updatedYamlContent);
  if (!validation.valid) {
    throw new Error(`Updated workflow validation failed: ${validation.errors.map(e => e.message).join(", ")}`);
  }

  // Update OpenClaw config (agent registrations and subagent allowlist)
  const { path: configPath, config } = await readOpenClawConfig();
  const list = Array.isArray(config.agents?.list) ? config.agents?.list : [];
  const oldAgents = list.filter((entry) => {
    const id = typeof entry.id === "string" ? entry.id : "";
    return id.startsWith(`${oldWorkflowId}_`);
  });

  // Update agent IDs and paths in config
  const updatedAgents: string[] = [];
  for (const entry of oldAgents) {
    if (typeof entry.id === "string" && entry.id.startsWith(`${oldWorkflowId}_`)) {
      const newId = entry.id.replace(`${oldWorkflowId}_`, `${newWorkflowId}_`);
      entry.id = newId;
      updatedAgents.push(newId);

      // Update agentDir path if it exists
      if (typeof entry.agentDir === "string") {
        entry.agentDir = entry.agentDir.replace(`/${oldWorkflowId}_`, `/${newWorkflowId}_`);
      }
    }
  }

  // Update subagent allowlist - remove old agents and add new ones
  const oldAgentIds = updatedAgents.map(id => id.replace(`${newWorkflowId}_`, `${oldWorkflowId}_`));
  removeSubagentAllowlist(config, oldAgentIds);
  addSubagentAllowlist(config, updatedAgents);

  await writeOpenClawConfig(configPath, config);

  // Remove old agent crons and create new ones
  await removeAgentCrons(oldWorkflowId);
  
  // Rename workflow directory
  await fs.rename(oldWorkflowDir, newWorkflowDir);
  
  // Write updated workflow.yml
  const newWorkflowYmlPath = path.join(newWorkflowDir, "workflow.yml");
  await fs.writeFile(newWorkflowYmlPath, updatedYamlContent, "utf-8");

  // Rename workspace directory if it exists
  const oldWorkspaceDir = resolveWorkflowWorkspaceDir(oldWorkflowId);
  const newWorkspaceDir = resolveWorkflowWorkspaceDir(newWorkflowId);
  if (await pathExists(oldWorkspaceDir)) {
    await fs.rename(oldWorkspaceDir, newWorkspaceDir);
  }

  // Update database records
  updateDatabaseRecords(oldWorkflowId, newWorkflowId);

  // Create agent crons with new workflow ID
  const updatedWorkflow = await loadWorkflowSpec(newWorkflowDir);
  await setupAgentCrons(updatedWorkflow);

  const message = `Successfully renamed workflow "${oldWorkflowId}" to "${newWorkflowId}"`;

  return {
    oldWorkflowId,
    newWorkflowId,
    message,
    oldPath: oldWorkflowDir,
    newPath: newWorkflowDir,
    updatedAgents
  };
}