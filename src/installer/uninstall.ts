import fs from "node:fs/promises";
import path from "node:path";
import { execSync } from "node:child_process";
import { readOpenClawConfig, writeOpenClawConfig } from "./openclaw-config.js";
import { removeMainAgentGuidance } from "./main-agent-guidance.js";
import {
  resolveAntfarmRoot,
  resolveRunRoot,
  resolveWorkflowDir,
  resolveWorkflowWorkspaceDir,
  resolveWorkflowWorkspaceRoot,
  resolveWorkflowRoot,
} from "./paths.js";
import { removeSubagentAllowlist } from "./subagent-allowlist.js";
import { uninstallAntfarmSkill } from "./skill-install.js";
import { removeAgentCrons } from "./agent-cron.js";
import { deleteAgentCronJobs } from "./gateway-api.js";
import { getDb } from "../db.js";
import type { WorkflowInstallResult } from "./types.js";

function filterAgentList(
  list: Array<Record<string, unknown>>,
  workflowId: string,
): Array<Record<string, unknown>> {
  const prefix = `${workflowId}/`;
  return list.filter((entry) => {
    const id = typeof entry.id === "string" ? entry.id : "";
    return !id.startsWith(prefix);
  });
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function getActiveRuns(workflowId?: string): Array<{ id: string; workflow_id: string; task: string }> {
  try {
    const db = getDb();
    if (workflowId) {
      return db.prepare("SELECT id, workflow_id, task FROM runs WHERE workflow_id = ? AND status = 'running'").all(workflowId) as Array<{ id: string; workflow_id: string; task: string }>;
    }
    return db.prepare("SELECT id, workflow_id, task FROM runs WHERE status = 'running'").all() as Array<{ id: string; workflow_id: string; task: string }>;
  } catch {
    return [];
  }
}

export function checkActiveRuns(workflowId?: string): Array<{ id: string; workflow_id: string; task: string }> {
  return getActiveRuns(workflowId);
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

export async function uninstallWorkflow(params: {
  workflowId: string;
  removeGuidance?: boolean;
}): Promise<WorkflowInstallResult> {
  const workflowDir = resolveWorkflowDir(params.workflowId);
  const workflowWorkspaceDir = resolveWorkflowWorkspaceDir(params.workflowId);
  const { path: configPath, config } = await readOpenClawConfig();
  const list = Array.isArray(config.agents?.list) ? config.agents?.list : [];
  const nextList = filterAgentList(list, params.workflowId);
  const removedAgents = list.filter((entry) => !nextList.includes(entry));
  if (config.agents) {
    config.agents.list = nextList;
  }
  removeSubagentAllowlist(
    config,
    removedAgents
      .map((entry) => (typeof entry.id === "string" ? entry.id : ""))
      .filter(Boolean),
  );
  await writeOpenClawConfig(configPath, config);

  if (params.removeGuidance !== false) {
    await removeMainAgentGuidance();
  }

  if (await pathExists(workflowDir)) {
    await fs.rm(workflowDir, { recursive: true, force: true });
  }

  if (await pathExists(workflowWorkspaceDir)) {
    await fs.rm(workflowWorkspaceDir, { recursive: true, force: true });
  }

  removeRunRecords(params.workflowId);
  await removeAgentCrons(params.workflowId);

  for (const entry of removedAgents) {
    const agentDir = typeof entry.agentDir === "string" ? entry.agentDir : "";
    if (!agentDir) {
      continue;
    }
    if (await pathExists(agentDir)) {
      await fs.rm(agentDir, { recursive: true, force: true });
    }
    // Also remove the parent directory if it's now empty
    const parentDir = path.dirname(agentDir);
    if (await pathExists(parentDir)) {
      const remaining = await fs.readdir(parentDir).catch(() => ["placeholder"]);
      if (remaining.length === 0) {
        await fs.rm(parentDir, { recursive: true, force: true });
      }
    }
  }

  return { workflowId: params.workflowId, workflowDir };
}

export async function uninstallAllWorkflows(): Promise<void> {
  const { path: configPath, config } = await readOpenClawConfig();
  const list = Array.isArray(config.agents?.list) ? config.agents?.list : [];
  const removedAgents = list.filter((entry) => {
    const id = typeof entry.id === "string" ? entry.id : "";
    return id.includes("/");
  });
  if (config.agents) {
    config.agents.list = list.filter((entry) => !removedAgents.includes(entry));
  }
  removeSubagentAllowlist(
    config,
    removedAgents
      .map((entry) => (typeof entry.id === "string" ? entry.id : ""))
      .filter(Boolean),
  );
  await writeOpenClawConfig(configPath, config);

  await removeMainAgentGuidance();
  await uninstallAntfarmSkill();

  // Remove all antfarm cron jobs
  await deleteAgentCronJobs("antfarm/");

  const workflowRoot = resolveWorkflowRoot();
  if (await pathExists(workflowRoot)) {
    await fs.rm(workflowRoot, { recursive: true, force: true });
  }

  const workflowWorkspaceRoot = resolveWorkflowWorkspaceRoot();
  if (await pathExists(workflowWorkspaceRoot)) {
    await fs.rm(workflowWorkspaceRoot, { recursive: true, force: true });
  }

  // Remove the SQLite database file
  const { getDbPath } = await import("../db.js");
  const dbPath = getDbPath();
  if (await pathExists(dbPath)) {
    await fs.rm(dbPath, { force: true });
  }
  // WAL and SHM files
  for (const suffix of ["-wal", "-shm"]) {
    const p = dbPath + suffix;
    if (await pathExists(p)) {
      await fs.rm(p, { force: true });
    }
  }

  for (const entry of removedAgents) {
    const agentDir = typeof entry.agentDir === "string" ? entry.agentDir : "";
    if (!agentDir) {
      continue;
    }
    if (await pathExists(agentDir)) {
      await fs.rm(agentDir, { recursive: true, force: true });
    }
    // Also remove the parent directory if it's now empty
    const parentDir = path.dirname(agentDir);
    if (await pathExists(parentDir)) {
      const remaining = await fs.readdir(parentDir).catch(() => ["placeholder"]);
      if (remaining.length === 0) {
        await fs.rm(parentDir, { recursive: true, force: true });
      }
    }
  }

  const antfarmRoot = resolveAntfarmRoot();
  if (await pathExists(antfarmRoot)) {
    const entries = await fs.readdir(antfarmRoot).catch(() => [] as string[]);
    if (entries.length === 0) {
      await fs.rm(antfarmRoot, { recursive: true, force: true });
    }
  }

  // Remove CLI symlink from ~/.local/bin
  const { removeCliSymlink } = await import("./symlink.js");
  removeCliSymlink();

  // Remove npm link, build output, and node_modules.
  // Note: this deletes dist/ which contains the currently running code.
  // Safe because this is the final operation in the function.
  const projectRoot = path.resolve(import.meta.dirname, "..", "..");
  try {
    execSync("npm unlink -g", { cwd: projectRoot, stdio: "ignore" });
  } catch {
    // link may not exist
  }
  const distDir = path.join(projectRoot, "dist");
  if (await pathExists(distDir)) {
    await fs.rm(distDir, { recursive: true, force: true });
  }
  const nodeModulesDir = path.join(projectRoot, "node_modules");
  if (await pathExists(nodeModulesDir)) {
    await fs.rm(nodeModulesDir, { recursive: true, force: true });
  }
}
