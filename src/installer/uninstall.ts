import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { execSync, execFileSync } from "node:child_process";
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

/**
 * Terminate active agent sessions for a workflow by deleting session files.
 * This prevents zombie agents from continuing work after uninstall.
 * 
 * Scans the filesystem for agent directories (workflow-id-agent-name pattern) rather than relying on 
 * config.agents.list, because the config may have been partially cleaned by a previous failed uninstall.
 * 
 * Related GitHub issue: Zombie agents from force-uninstalled workflows (#45, #40)
 */
async function terminateAgentSessions(workflowId: string): Promise<void> {
  const openclawHome = path.join(os.homedir(), ".openclaw");
  const agentsRoot = path.join(openclawHome, "agents");
  
  if (!(await pathExists(agentsRoot))) {
    return; // No agents directory at all
  }

  const entries = await fs.readdir(agentsRoot, { withFileTypes: true });
  const prefix = `${workflowId}-`;

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (!entry.name.startsWith(prefix)) continue;

    const agentDir = path.join(agentsRoot, entry.name);
    const sessionsDir = path.join(agentDir, "sessions");

    if (await pathExists(sessionsDir)) {
      try {
        await fs.rm(sessionsDir, { recursive: true, force: true });
        console.log(`✓ Terminated sessions for agent: ${entry.name}`);
      } catch (err) {
        console.warn(`⚠ Failed to terminate sessions for ${entry.name}:`, err);
      }
    }
  }
}

/**
 * Cancel all active runs for a workflow in the database.
 * This is the critical defense against zombie agents — even if processes survive,
 * claimStep() and completeStep() both check run status and reject work for failed runs.
 */
function cancelActiveRuns(workflowId: string): void {
  try {
    const db = getDb();
    const runs = db.prepare(
      "SELECT id FROM runs WHERE workflow_id = ? AND status = 'running'"
    ).all(workflowId) as Array<{ id: string }>;

    for (const run of runs) {
      db.prepare(
        "UPDATE steps SET status = 'failed', output = 'Workflow force-uninstalled', updated_at = datetime('now') WHERE run_id = ? AND status IN ('running', 'pending', 'waiting')"
      ).run(run.id);
      db.prepare(
        "UPDATE stories SET status = 'failed', updated_at = datetime('now') WHERE run_id = ? AND status IN ('running', 'pending')"
      ).run(run.id);
      db.prepare(
        "UPDATE runs SET status = 'failed', updated_at = datetime('now') WHERE id = ?"
      ).run(run.id);
      console.log(`✓ Cancelled active run: ${run.id}`);
    }
  } catch {
    // DB might not exist yet
  }
}

/**
 * Best-effort kill of running agent processes for a workflow.
 * Uses fuser to find processes with open file handles in agent session directories,
 * then sends SIGTERM. Falls back gracefully if fuser is unavailable.
 */
async function killAgentProcesses(workflowId: string): Promise<void> {
  const openclawHome = path.join(os.homedir(), ".openclaw");
  const agentsRoot = path.join(openclawHome, "agents");

  if (!(await pathExists(agentsRoot))) return;

  const entries = await fs.readdir(agentsRoot, { withFileTypes: true });
  const prefix = `${workflowId}-`;

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (!entry.name.startsWith(prefix)) continue;

    const sessionsDir = path.join(agentsRoot, entry.name, "sessions");
    if (!(await pathExists(sessionsDir))) continue;

    // Find PIDs with open files in the sessions directory via fuser (no shell)
    let pids: number[] = [];
    try {
      const stdout = execFileSync("fuser", [sessionsDir], {
        encoding: "utf-8",
        timeout: 5000,
        stdio: ["pipe", "pipe", "pipe"],
      });
      pids = stdout.trim().split(/\s+/).filter(Boolean).map((s) => parseInt(s, 10)).filter((n) => !isNaN(n));
    } catch (err: any) {
      // fuser returns exit code 1 when no processes found, but may still have stdout
      if (err?.stdout) {
        pids = String(err.stdout).trim().split(/\s+/).filter(Boolean).map((s) => parseInt(s, 10)).filter((n) => !isNaN(n));
      }
    }

    for (const pid of pids) {
      try {
        process.kill(pid, "SIGTERM");
        console.log(`✓ Sent SIGTERM to process ${pid} (agent: ${entry.name})`);
      } catch {
        // Process may have already exited
      }
    }
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
  // Step 1: Remove cron jobs FIRST to prevent new agent sessions from spawning
  await removeAgentCrons(params.workflowId);

  // Step 2: Cancel all active runs in DB — blocks zombie agents from claiming/completing work
  cancelActiveRuns(params.workflowId);

  // Step 3: Kill running agent processes (best-effort via fuser/SIGTERM)
  await killAgentProcesses(params.workflowId);

  // Step 4: Clean up session files
  await terminateAgentSessions(params.workflowId);

  // Step 5: Remove agents from config
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
  // Step 1: Remove all cron jobs FIRST to prevent new agent spawns
  await deleteAgentCronJobs("antfarm/");

  // Step 2: Cancel all active runs in DB and kill processes for each workflow
  const { path: configPath, config } = await readOpenClawConfig();
  const list = Array.isArray(config.agents?.list) ? config.agents?.list : [];

  // Collect unique workflow IDs from agent list
  const workflowIds = new Set<string>();
  for (const entry of list) {
    const id = typeof entry.id === "string" ? entry.id : "";
    const slashIdx = id.indexOf("/");
    if (slashIdx > 0) {
      workflowIds.add(id.slice(0, slashIdx));
    }
  }
  for (const wfId of workflowIds) {
    cancelActiveRuns(wfId);
    await killAgentProcesses(wfId);
  }

  // Step 3: Clean up session files for all workflows
  const openclawHome = path.join(os.homedir(), ".openclaw");
  const agentsRoot = path.join(openclawHome, "agents");
  if (await pathExists(agentsRoot)) {
    const agentEntries = await fs.readdir(agentsRoot, { withFileTypes: true });
    for (const ae of agentEntries) {
      if (!ae.isDirectory()) continue;
      const sessionsDir = path.join(agentsRoot, ae.name, "sessions");
      if (await pathExists(sessionsDir)) {
        try {
          await fs.rm(sessionsDir, { recursive: true, force: true });
        } catch { /* best-effort */ }
      }
    }
  }

  // Step 4: Remove agents from config
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
