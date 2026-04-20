import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { emitEvent } from "./events.js";
import { resolveBundledWorkflowDir, resolveRunRoot, resolveWorkflowDir, resolveWorkflowWorkspaceDir } from "./paths.js";
import { loadWorkflowSpec } from "./workflow-spec.js";
import type { WorkflowAgent, WorkflowAgentExecutor, WorkflowSpec } from "./types.js";

export type ConfiguredExecutorResult = {
  ok: boolean;
  summary?: string;
  recordDir: string;
  repo?: string;
  branch?: string | null;
  sessionId?: string | null;
  error?: string;
  stderrExcerpt?: string;
};

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function loadWorkflowForExecution(workflowId: string): Promise<WorkflowSpec> {
  const installedDir = resolveWorkflowDir(workflowId);
  if (await pathExists(path.join(installedDir, "workflow.yml"))) {
    return loadWorkflowSpec(installedDir);
  }
  return loadWorkflowSpec(resolveBundledWorkflowDir(workflowId));
}

function requireExecutor(workflow: WorkflowSpec, agentId: string): WorkflowAgentExecutor {
  const agent = workflow.agents.find((candidate) => candidate.id === agentId) as WorkflowAgent | undefined;
  if (!agent) {
    throw new Error(`Agent not found in workflow ${workflow.id}: ${agentId}`);
  }
  if (!agent.executor) {
    throw new Error(`Agent ${workflow.id}/${agentId} has no configured executor`);
  }
  return agent.executor;
}

function requireAgent(workflow: WorkflowSpec, agentId: string): WorkflowAgent {
  const agent = workflow.agents.find((candidate) => candidate.id === agentId) as WorkflowAgent | undefined;
  if (!agent) {
    throw new Error(`Agent not found in workflow ${workflow.id}: ${agentId}`);
  }
  return agent;
}

function resolveAgentWorkspaceDir(workflow: WorkflowSpec, agentId: string): string {
  const agent = requireAgent(workflow, agentId);
  const baseDir = agent.workspace.baseDir?.trim() || agent.id;
  return path.join(resolveWorkflowWorkspaceDir(workflow.id), baseDir);
}

function getKeyValue(input: string, key: string): string | null {
  const match = input.match(new RegExp(`^${key}:\\s*(.+)$`, "m"));
  return match?.[1]?.trim() || null;
}

function runCommand(command: string, args: string[], input: string): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => { stdout += String(chunk); });
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ exitCode: code ?? 1, stdout, stderr });
    });

    child.stdin.write(input);
    child.stdin.end();
  });
}

export async function runConfiguredExecutor(params: {
  workflowId: string;
  agentId: string;
  runId: string;
  stepId: string;
  input: string;
  outputFile?: string;
}): Promise<ConfiguredExecutorResult> {
  const workflow = await loadWorkflowForExecution(params.workflowId);
  const executor = requireExecutor(workflow, params.agentId);
  const agentWorkspaceDir = resolveAgentWorkspaceDir(workflow, params.agentId);
  if (executor.kind !== "claude-code-wrapper") {
    throw new Error(`Unsupported executor kind: ${executor.kind}`);
  }

  const repo = getKeyValue(params.input, "REPO");
  const recordDir = path.join(resolveRunRoot(), params.runId, params.stepId, "executor");
  if (!repo) {
    return {
      ok: false,
      recordDir,
      error: "Claimed step input is missing required REPO: line for Claude Code execution.",
    };
  }

  const branch = getKeyValue(params.input, "BRANCH");
  await fs.mkdir(recordDir, { recursive: true });
  await fs.writeFile(path.join(recordDir, "claimed-input.txt"), params.input, "utf-8");

  if (!(await pathExists(agentWorkspaceDir))) {
    return {
      ok: false,
      recordDir,
      repo,
      branch,
      error: `Agent workspace not found: ${agentWorkspaceDir}`,
    };
  }

  emitEvent({
    ts: new Date().toISOString(),
    event: "executor.started",
    runId: params.runId,
    workflowId: params.workflowId,
    stepId: params.stepId,
    agentId: `${params.workflowId}_${params.agentId}`,
    detail: `Claude Code wrapper in ${repo}${branch ? ` on ${branch}` : ""}`,
  });

  const args = [
    "--agent-workspace", agentWorkspaceDir,
    "--cwd", repo,
    "--record-to", recordDir,
    "--model", executor.model ?? "claude-opus-4-7",
    "--effort", executor.effort ?? "high",
    "--max-turns", String(executor.maxTurns ?? 60),
  ];

  const { exitCode, stdout, stderr } = await runCommand(executor.command, args, params.input);
  let payload: any = null;
  try {
    payload = JSON.parse(stdout.trim());
  } catch {
    payload = null;
  }

  if (exitCode !== 0 || !payload?.ok || typeof payload?.summary !== "string" || !payload.summary.trim()) {
    const error = payload?.stderrExcerpt || payload?.summary || stderr.trim() || `Executor exited with code ${exitCode}`;
    emitEvent({
      ts: new Date().toISOString(),
      event: "executor.failed",
      runId: params.runId,
      workflowId: params.workflowId,
      stepId: params.stepId,
      agentId: `${params.workflowId}_${params.agentId}`,
      detail: error.slice(0, 300),
    });
    return {
      ok: false,
      recordDir,
      repo,
      branch,
      sessionId: payload?.sessionId ?? null,
      error,
      stderrExcerpt: payload?.stderrExcerpt || stderr.trim() || undefined,
    };
  }

  const summary = payload.summary.trim();
  if (params.outputFile) {
    await fs.writeFile(params.outputFile, summary + "\n", "utf-8");
  }

  emitEvent({
    ts: new Date().toISOString(),
    event: "executor.completed",
    runId: params.runId,
    workflowId: params.workflowId,
    stepId: params.stepId,
    agentId: `${params.workflowId}_${params.agentId}`,
    detail: `Claude Code session ${payload.sessionId ?? "unknown"}`,
  });

  return {
    ok: true,
    summary,
    recordDir,
    repo,
    branch,
    sessionId: payload.sessionId ?? null,
  };
}
