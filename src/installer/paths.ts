import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Bundled workflows ship with antfarm (in the repo's workflows/ directory)
export function resolveBundledWorkflowsDir(): string {
  // From dist/installer/paths.js -> ../../workflows
  return path.resolve(__dirname, "..", "..", "workflows");
}

export function resolveBundledWorkflowDir(workflowId: string): string {
  return path.join(resolveBundledWorkflowsDir(), workflowId);
}

export function resolveOpenClawStateDir(): string {
  const env = process.env.OPENCLAW_STATE_DIR?.trim();
  if (env) {
    return env;
  }
  return path.join(os.homedir(), ".openclaw");
}

export function resolveOpenClawConfigPath(): string {
  const env = process.env.OPENCLAW_CONFIG_PATH?.trim();
  if (env) {
    return env;
  }
  return path.join(resolveOpenClawStateDir(), "openclaw.json");
}

export function resolveAntfarmHome(): string {
  const env = process.env.ANTFARM_HOME?.trim();
  if (env) {
    return env;
  }
  return path.join(resolveOpenClawStateDir(), "antfarm");
}

export function resolveAntfarmRoot(): string {
  return resolveAntfarmHome();
}

export function resolveWorkflowRoot(): string {
  return path.join(resolveAntfarmRoot(), "workflows");
}

export function resolveWorkflowDir(workflowId: string): string {
  return path.join(resolveWorkflowRoot(), workflowId);
}

export function resolveWorkflowWorkspaceRoot(): string {
  return path.join(resolveOpenClawStateDir(), "workspaces", "workflows");
}

export function resolveWorkflowWorkspaceDir(workflowId: string): string {
  return path.join(resolveWorkflowWorkspaceRoot(), workflowId);
}

export function resolveRunRoot(): string {
  return path.join(resolveAntfarmRoot(), "runs");
}

export function resolveAntfarmDbPath(): string {
  return path.join(resolveAntfarmRoot(), "antfarm.db");
}

export function resolveAntfarmEventsPath(): string {
  return path.join(resolveAntfarmRoot(), "events.jsonl");
}

export function resolveAntfarmLogsDir(): string {
  return path.join(resolveAntfarmRoot(), "logs");
}

export function resolveAntfarmDashboardPidPath(): string {
  return path.join(resolveAntfarmRoot(), "dashboard.pid");
}

export function resolveAntfarmDashboardLogPath(): string {
  return path.join(resolveAntfarmRoot(), "dashboard.log");
}

export function resolveOpenClawSkillsDir(): string {
  return path.join(resolveOpenClawStateDir(), "skills");
}

export function resolveOpenClawWorkspaceSkillsDir(): string {
  return path.join(resolveOpenClawStateDir(), "workspace", "skills");
}

export function resolveAntfarmCli(): string {
  // From dist/installer/paths.js -> ../../dist/cli/cli.js
  return path.resolve(__dirname, "..", "cli", "cli.js");
}
