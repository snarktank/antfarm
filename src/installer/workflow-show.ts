import { loadWorkflowSpec } from "./workflow-spec.js";
import { resolveBundledWorkflowDir } from "./paths.js";
import { checkActiveRuns } from "./uninstall.js";
import { listBundledWorkflows } from "./workflow-fetch.js";
import fs from "node:fs/promises";

export interface WorkflowDetails {
  id: string;
  name: string;
  version: number;
  description?: string;
  activeRuns: number;
  status: "ACTIVE" | "IDLE";
  agents: Array<{
    id: string;
    name?: string;
    description?: string;
    role?: string;
    model?: string;
    timeoutSeconds?: number;
    workspace: {
      baseDir: string;
      fileCount: number;
      skills?: string[];
    };
  }>;
  steps: Array<{
    id: string;
    agent: string;
    type?: "single" | "loop";
    input: string;
    expects: string;
    dependencies?: string[];
    maxRetries?: number;
    loopConfig?: {
      over: string;
      completion: string;
      freshSession?: boolean;
      verifyEach?: boolean;
      verifyStep?: string;
    };
  }>;
  context?: Record<string, string>;
  notifications?: {
    url?: string;
  };
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function getWorkflowDetails(workflowId: string): Promise<WorkflowDetails> {
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

  const spec = await loadWorkflowSpec(workflowDir);
  const activeRuns = checkActiveRuns(spec.id);

  // Process agents with workspace file counts
  const agents = await Promise.all(spec.agents.map(async (agent) => {
    const agentDir = `${workflowDir}/${agent.workspace.baseDir}`;
    let fileCount = 0;
    try {
      if (await pathExists(agentDir)) {
        const files = await fs.readdir(agentDir, { recursive: true });
        fileCount = files.length;
      } else {
        fileCount = Object.keys(agent.workspace.files).length;
      }
    } catch {
      fileCount = Object.keys(agent.workspace.files).length;
    }

    return {
      id: agent.id,
      name: agent.name,
      description: agent.description,
      role: agent.role,
      model: agent.model,
      timeoutSeconds: agent.timeoutSeconds,
      workspace: {
        baseDir: agent.workspace.baseDir,
        fileCount,
        skills: agent.workspace.skills,
      },
    };
  }));

  // Process steps with dependencies and loop info
  const steps = spec.steps.map((step) => ({
    id: step.id,
    agent: step.agent,
    type: step.type || "single",
    input: step.input,
    expects: step.expects,
    maxRetries: step.max_retries,
    loopConfig: step.loop ? {
      over: step.loop.over,
      completion: step.loop.completion,
      freshSession: step.loop.freshSession,
      verifyEach: step.loop.verifyEach,
      verifyStep: step.loop.verifyStep,
    } : undefined,
  }));

  return {
    id: spec.id,
    name: spec.name || spec.id,
    version: spec.version || 1,
    description: spec.context?.description,
    activeRuns: activeRuns.length,
    status: activeRuns.length > 0 ? "ACTIVE" : "IDLE",
    agents,
    steps,
    context: spec.context,
    notifications: spec.notifications,
  };
}

export function formatWorkflowDetails(details: WorkflowDetails): string {
  const lines: string[] = [];
  
  // Header
  lines.push(`Workflow: ${details.name} (${details.id})`);
  lines.push(`Version: ${details.version}`);
  if (details.description) {
    lines.push(`Description: ${details.description}`);
  }
  lines.push(`Status: ${details.status} (${details.activeRuns} active run${details.activeRuns !== 1 ? 's' : ''})`);
  lines.push("");

  // Agents
  lines.push("Agents:");
  if (details.agents.length === 0) {
    lines.push("  (no agents configured)");
  } else {
    for (const agent of details.agents) {
      lines.push(`  ${agent.id}${agent.name ? ` (${agent.name})` : ""}`);
      if (agent.description) {
        lines.push(`    Description: ${agent.description}`);
      }
      if (agent.role) {
        lines.push(`    Role: ${agent.role}`);
      }
      if (agent.model) {
        lines.push(`    Model: ${agent.model}`);
      }
      if (agent.timeoutSeconds) {
        lines.push(`    Timeout: ${agent.timeoutSeconds}s`);
      }
      lines.push(`    Workspace: ${agent.workspace.baseDir} (${agent.workspace.fileCount} file${agent.workspace.fileCount !== 1 ? 's' : ''})`);
      if (agent.workspace.skills && agent.workspace.skills.length > 0) {
        lines.push(`    Skills: ${agent.workspace.skills.join(", ")}`);
      }
      lines.push("");
    }
  }

  // Steps
  lines.push("Steps:");
  if (details.steps.length === 0) {
    lines.push("  (no steps configured)");
  } else {
    for (const step of details.steps) {
      const typeInfo = step.type === "loop" ? " [LOOP]" : "";
      lines.push(`  ${step.id} → ${step.agent}${typeInfo}`);
      lines.push(`    Input: ${step.input.slice(0, 80)}${step.input.length > 80 ? "..." : ""}`);
      lines.push(`    Expects: ${step.expects.slice(0, 80)}${step.expects.length > 80 ? "..." : ""}`);
      if (step.maxRetries) {
        lines.push(`    Max Retries: ${step.maxRetries}`);
      }
      if (step.loopConfig) {
        lines.push(`    Loop: over ${step.loopConfig.over}, completion ${step.loopConfig.completion}`);
        if (step.loopConfig.freshSession) {
          lines.push(`      Fresh session: yes`);
        }
        if (step.loopConfig.verifyEach) {
          lines.push(`      Verify each: yes${step.loopConfig.verifyStep ? ` (via ${step.loopConfig.verifyStep})` : ""}`);
        }
      }
      lines.push("");
    }
  }

  // Context (if any)
  if (details.context && Object.keys(details.context).length > 0) {
    lines.push("Context:");
    for (const [key, value] of Object.entries(details.context)) {
      if (key !== "description") { // Description already shown above
        lines.push(`  ${key}: ${value}`);
      }
    }
    lines.push("");
  }

  // Notifications (if any)
  if (details.notifications?.url) {
    lines.push("Notifications:");
    lines.push(`  URL: ${details.notifications.url}`);
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}