import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Bundled workflows ship with antfarm (in the repo's workflows/ directory)
// Override with ANTFARM_WORKFLOWS_DIR to load workflows from an external location.
export function resolveBundledWorkflowsDir(): string {
  const env = process.env.ANTFARM_WORKFLOWS_DIR?.trim();
  if (env) {
    return path.resolve(env);
  }
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

export function resolveAntfarmRoot(): string {
  return path.join(resolveOpenClawStateDir(), "antfarm");
}

export function resolveWorkflowRoot(): string {
  // When ANTFARM_WORKFLOWS_DIR is set, use it as the runtime workflow root too.
  // This allows running workflows directly from an external directory without
  // requiring them to be installed into ~/.openclaw/antfarm/workflows/.
  const env = process.env.ANTFARM_WORKFLOWS_DIR?.trim();
  if (env) {
    return path.resolve(env);
  }
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

export function resolveAntfarmCli(): string {
  // From dist/installer/paths.js -> ../../dist/cli/cli.js
  return path.resolve(__dirname, "..", "cli", "cli.js");
}
