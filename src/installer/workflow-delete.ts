import fs from "node:fs/promises";
import { resolveWorkflowDir, resolveWorkflowWorkspaceDir } from "./paths.js";
import { loadWorkflowSpec } from "./workflow-spec.js";
import { createWorkflowBackup, type BackupResult } from "./workflow-backup.js";
import { removeAgentCrons } from "./agent-cron.js";
import { checkActiveRuns } from "./uninstall.js";
import { readOpenClawConfig, writeOpenClawConfig } from "./openclaw-config.js";
import { removeSubagentAllowlist } from "./subagent-allowlist.js";
import { getDb } from "../db.js";
import path from "node:path";

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
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

function removeRunRecords(workflowId: string): void {
  try {
    const db = getDb();
    const runs = db.prepare("SELECT id FROM runs WHERE workflow_id = ?").all(workflowId) as Array<{ id: string }>;
    for (const run of runs) {
      db.prepare("DELETE FROM stories WHERE run_id = ?").run(run.id);
      db.prepare("DELETE FROM steps WHERE run_id = ?").run(run.id);
    }
    db.prepare("DELETE FROM runs WHERE workflow_id = ?").run(workflowId);
  } catch {
    // DB might not exist yet
  }
}

export interface WorkflowDeleteResult {
  workflowId: string;
  backup: BackupResult;
  removedAgents: string[];
  message: string;
}

/**
 * Delete a workflow after validating no active runs exist.
 * Creates a backup before deletion and removes associated agent crons.
 * 
 * @param workflowId - The ID of the workflow to delete
 * @param force - Override active run check if true
 * @returns Promise<WorkflowDeleteResult> - Contains deletion metadata and backup info
 */
export async function deleteWorkflow(workflowId: string, force: boolean = false): Promise<WorkflowDeleteResult> {
  // Check if workflow exists
  const workflowDir = resolveWorkflowDir(workflowId);
  if (!(await pathExists(workflowDir))) {
    throw new Error(`Workflow not found: ${workflowId}`);
  }

  // Validate workflow.yml exists and is valid before deletion
  const workflowYmlPath = path.join(workflowDir, "workflow.yml");
  if (!(await pathExists(workflowYmlPath))) {
    throw new Error(`Invalid workflow: workflow.yml not found in ${workflowDir}`);
  }

  // Load and validate the workflow spec
  let workflow;
  try {
    workflow = await loadWorkflowSpec(workflowDir);
  } catch (err) {
    throw new Error(`Invalid workflow spec: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Check for active runs (unless force flag is used)
  if (!force) {
    const activeRuns = checkActiveRuns(workflowId);
    if (activeRuns.length > 0) {
      throw new Error(
        `Cannot delete workflow "${workflowId}": ${activeRuns.length} active run(s) found. ` +
        `Use --force flag to override this check and delete anyway.`
      );
    }
  }

  // Create backup before deletion
  const backup = await createWorkflowBackup(workflowId);

  // Remove from OpenClaw config (agent registrations)
  const { path: configPath, config } = await readOpenClawConfig();
  const list = Array.isArray(config.agents?.list) ? config.agents?.list : [];
  const nextList = filterAgentList(list, workflowId);
  const removedAgents = list.filter((entry) => !nextList.includes(entry));
  const removedAgentIds = removedAgents
    .map((entry) => (typeof entry.id === "string" ? entry.id : ""))
    .filter(Boolean);

  if (config.agents) {
    config.agents.list = nextList;
  }
  removeSubagentAllowlist(config, removedAgentIds);
  await writeOpenClawConfig(configPath, config);

  // Remove agent crons for this workflow
  await removeAgentCrons(workflowId);

  // Remove workflow directory
  if (await pathExists(workflowDir)) {
    await fs.rm(workflowDir, { recursive: true, force: true });
  }

  // Remove workflow workspace directory
  const workflowWorkspaceDir = resolveWorkflowWorkspaceDir(workflowId);
  if (await pathExists(workflowWorkspaceDir)) {
    await fs.rm(workflowWorkspaceDir, { recursive: true, force: true });
  }

  // Remove database records for this workflow
  removeRunRecords(workflowId);

  // Remove agent directories
  for (const entry of removedAgents) {
    const agentDir = typeof entry.agentDir === "string" ? entry.agentDir : "";
    if (!agentDir) {
      continue;
    }
    // Remove the entire parent directory (e.g. ~/.openclaw/agents/workflow_agent/)
    // since both agent/ and sessions/ inside it are antfarm-managed
    const parentDir = path.dirname(agentDir);
    if (await pathExists(parentDir)) {
      await fs.rm(parentDir, { recursive: true, force: true });
    }
  }

  const message = `Workflow "${workflowId}" deleted successfully. Backup created at: ${backup.backupPath}`;

  return {
    workflowId,
    backup,
    removedAgents: removedAgentIds,
    message
  };
}