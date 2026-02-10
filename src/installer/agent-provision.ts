import fs from "node:fs/promises";
import path from "node:path";
import type { WorkflowAgent, WorkflowSpec } from "./types.js";
import { resolveOpenClawStateDir, resolveWorkflowWorkspaceRoot } from "./paths.js";
import { writeWorkflowFile } from "./workspace-files.js";

export type ProvisionedAgent = {
  id: string;
  name?: string;
  model?: string;
  workspaceDir: string;
  agentDir: string;
};

function resolveAgentWorkspaceRoot(): string {
  return resolveWorkflowWorkspaceRoot();
}

function resolveAgentDir(agentId: string): string {
  const safeId = agentId.replace(/[^a-zA-Z0-9_-]/g, "__");
  return path.join(resolveOpenClawStateDir(), "agents", safeId, "agent");
}

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

function resolveWorkspaceDir(params: {
  workflowId: string;
  agent: WorkflowAgent;
}): string {
  const baseDir = params.agent.workspace.baseDir?.trim() || params.agent.id;
  return path.join(resolveAgentWorkspaceRoot(), params.workflowId, baseDir);
}

export async function provisionAgents(params: {
  workflow: WorkflowSpec;
  workflowDir: string;
  bundledSourceDir?: string;
  overwriteFiles?: boolean;
  installSkill?: boolean;
}): Promise<ProvisionedAgent[]> {
  const overwrite = params.overwriteFiles ?? false;
  const workflowRoot = resolveAgentWorkspaceRoot();
  await ensureDir(workflowRoot);

  const results: ProvisionedAgent[] = [];
  for (const agent of params.workflow.agents) {
    const workspaceDir = resolveWorkspaceDir({
      workflowId: params.workflow.id,
      agent,
    });
    await ensureDir(workspaceDir);

    for (const [fileName, relativePath] of Object.entries(agent.workspace.files)) {
      // Try the installed workflow dir first, then fall back to the bundled source
      // (handles relative paths like ../../agents/shared/ that escape the workflow dir)
      let source = path.resolve(params.workflowDir, relativePath);
      try {
        await fs.access(source);
      } catch {
        if (params.bundledSourceDir) {
          source = path.resolve(params.bundledSourceDir, relativePath);
          try {
            await fs.access(source);
          } catch {
            throw new Error(`Missing bootstrap file for agent "${agent.id}": ${relativePath}`);
          }
        } else {
          throw new Error(`Missing bootstrap file for agent "${agent.id}": ${relativePath}`);
        }
      }
      const destination = path.join(workspaceDir, fileName);
      await writeWorkflowFile({ destination, source, overwrite });
    }

    if (agent.workspace.skills?.length) {
      const skillsDir = path.join(workspaceDir, "skills");
      await ensureDir(skillsDir);
    }

    const agentDir = resolveAgentDir(`${params.workflow.id}-${agent.id}`);
    await ensureDir(agentDir);

    results.push({
      id: `${params.workflow.id}/${agent.id}`,
      name: agent.name,
      model: agent.model,
      workspaceDir,
      agentDir,
    });
  }

  if (params.installSkill !== false) {
    await installWorkflowSkill(params.workflow, params.workflowDir);
  }

  return results;
}

async function installWorkflowSkill(workflow: WorkflowSpec, workflowDir: string) {
  const skillSource = path.join(workflowDir, "skills", "antfarm-workflows");
  try {
    await fs.access(skillSource);
  } catch {
    return;
  }
  for (const agent of workflow.agents) {
    if (!agent.workspace.skills?.includes("antfarm-workflows")) {
      continue;
    }
    const workspaceDir = resolveWorkspaceDir({ workflowId: workflow.id, agent });
    const targetDir = path.join(workspaceDir, "skills");
    await ensureDir(targetDir);
    const destination = path.join(targetDir, "antfarm-workflows");
    await fs.rm(destination, { recursive: true, force: true });
    await fs.cp(skillSource, destination, { recursive: true });
  }
}
