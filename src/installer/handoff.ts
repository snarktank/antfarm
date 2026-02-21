import fs from "node:fs/promises";
import type { WorkflowAgent, WorkflowSpec } from "./types.js";
import type { HandoffMode } from "./types.js";
import { loadWorkflowSpec } from "./workflow-spec.js";
import { resolveBundledWorkflowDir, resolveWorkflowDir } from "./paths.js";

export const DEFAULT_HANDOFF_MODE: HandoffMode = "polling";
export const DEFAULT_MAX_DISPATCH_RETRIES = 5;
export const DEFAULT_DISPATCH_RETRY_BASE_MS = 1000;

type ResolvedHandoffConfig = {
  mode: HandoffMode;
  maxDispatchRetries: number;
  retryBaseMs: number;
  workflow: WorkflowSpec;
};

const cache = new Map<string, ResolvedHandoffConfig>();

async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function loadWorkflowForId(workflowId: string): Promise<WorkflowSpec> {
  const installedDir = resolveWorkflowDir(workflowId);
  if (await pathExists(installedDir)) {
    return loadWorkflowSpec(installedDir);
  }
  const bundledDir = resolveBundledWorkflowDir(workflowId);
  return loadWorkflowSpec(bundledDir);
}

export async function getResolvedHandoffConfig(workflowId: string): Promise<ResolvedHandoffConfig> {
  const cached = cache.get(workflowId);
  if (cached) return cached;

  const workflow = await loadWorkflowForId(workflowId);
  const resolved: ResolvedHandoffConfig = {
    mode: workflow.handoff?.mode ?? DEFAULT_HANDOFF_MODE,
    maxDispatchRetries: workflow.handoff?.maxDispatchRetries ?? DEFAULT_MAX_DISPATCH_RETRIES,
    retryBaseMs: workflow.handoff?.retryBaseMs ?? DEFAULT_DISPATCH_RETRY_BASE_MS,
    workflow,
  };
  cache.set(workflowId, resolved);
  return resolved;
}

export async function getHandoffMode(workflowId: string): Promise<HandoffMode> {
  return (await getResolvedHandoffConfig(workflowId)).mode;
}

export function getWorkflowAgentModel(workflow: WorkflowSpec, fullAgentId: string): string | undefined {
  const prefix = `${workflow.id}_`;
  const localAgentId = fullAgentId.startsWith(prefix) ? fullAgentId.slice(prefix.length) : fullAgentId;
  const agent = workflow.agents.find((a: WorkflowAgent) => a.id === localAgentId);
  return agent?.model;
}

export function resetHandoffCache(): void {
  cache.clear();
}
