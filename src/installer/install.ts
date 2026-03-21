import fs from "node:fs/promises";
import path from "node:path";
import { fetchWorkflow } from "./workflow-fetch.js";
import { loadWorkflowSpec } from "./workflow-spec.js";
import { provisionAgents } from "./agent-provision.js";
import { readOpenClawConfig, writeOpenClawConfig, type OpenClawConfig } from "./openclaw-config.js";
import { updateMainAgentGuidance } from "./main-agent-guidance.js";
import { addSubagentAllowlist } from "./subagent-allowlist.js";
import { installAntfarmSkill } from "./skill-install.js";
import type { AgentRole, WorkflowInstallResult } from "./types.js";

function ensureAgentList(config: { agents?: { list?: Array<Record<string, unknown>>; defaults?: Record<string, unknown> } }) {
  if (!config.agents) config.agents = {};
  if (!Array.isArray(config.agents.list)) config.agents.list = [];
  return config.agents.list;
}

/**
 * Ensure the user's main agent is explicitly in the list with `default: true`.
 * Without this, adding workflow agents to an empty list makes the first workflow
 * agent the default — hijacking the user's main session (issue #41).
 */
function ensureMainAgentInList(
  list: Array<Record<string, unknown>>,
  config: { agents?: { defaults?: Record<string, unknown> } },
) {
  // If any entry already has default: true, the user has configured routing — don't touch it
  if (list.some((entry) => entry.default === true)) return;

  // If "main" agent already exists in the list, just mark it as default
  const existing = list.find((entry) => entry.id === "main");
  if (existing) {
    existing.default = true;
    return;
  }

  // Main agent isn't in the list — add a minimal entry so it stays the default.
  // Respect workspace from agents.defaults if set; otherwise use the standard path.
  const workspace = (config.agents?.defaults as Record<string, unknown>)?.workspace as string | undefined;
  const entry: Record<string, unknown> = {
    id: "main",
    name: "Main",
    default: true,
  };
  if (workspace) entry.workspace = workspace;
  list.unshift(entry);
}

// ── Shared deny list: things no workflow agent should ever touch ──
// Note: sessions_spawn is allowed — two-phase polling agents need it to hand off work to opus sessions
const ALWAYS_DENY = ["gateway", "cron", "message", "nodes", "canvas", "sessions_send"];

const DEFAULT_CRON_SESSION_RETENTION = "24h";
const DEFAULT_SESSION_MAINTENANCE = {
  mode: "enforce",
  pruneAfter: "7d",
  maxEntries: 500,
  rotateBytes: "10mb",
} as const;

/**
 * Per-role defaults: tool policies + timeout overrides.
 *
 * Profile "coding" provides: group:fs (read/write/edit/apply_patch),
 *   group:runtime (exec/process), group:sessions, group:memory, image.
 * We then use deny to remove tools each role shouldn't have.
 *
 * timeoutSeconds: heavy roles (coding, testing) get 30 min; lighter roles 20 min.
 * If a role has no timeoutSeconds, OpenClaw's global default (600s) applies.
 */
const TIMEOUT_20_MIN = 1200;
const TIMEOUT_30_MIN = 1800;

const ROLE_POLICIES: Record<AgentRole, { profile?: string; alsoAllow?: string[]; deny: string[]; timeoutSeconds: number }> = {
  // analysis: read code, run git/grep, reason — no writing, no web, no browser
  analysis: {
    profile: "coding",
    deny: [
      ...ALWAYS_DENY,
      "write", "edit", "apply_patch",  // no file modification
      "image", "tts",                  // unnecessary
      "group:ui",                      // no browser/canvas
    ],
    timeoutSeconds: TIMEOUT_20_MIN,  // codebase exploration + reasoning
  },

  // coding: full read/write/exec — the workhorses (developer, fixer, setup)
  coding: {
    profile: "coding",
    deny: [
      ...ALWAYS_DENY,
      "image", "tts",                  // unnecessary
      "group:ui",                      // no browser/canvas
    ],
    timeoutSeconds: TIMEOUT_30_MIN,  // implements code + build + tests
  },

  // verification: read + exec but NO write — preserves independent verification integrity
  verification: {
    profile: "coding",
    deny: [
      ...ALWAYS_DENY,
      "write", "edit", "apply_patch",  // cannot modify code it's verifying
      "image", "tts",                  // unnecessary
      "group:ui",                      // no browser/canvas
    ],
    timeoutSeconds: TIMEOUT_20_MIN,  // code review + runs tests
  },

  // testing: read + exec + browser/web for E2E, NO write
  testing: {
    profile: "coding",
    alsoAllow: ["browser", "web_search", "web_fetch"],
    deny: [
      ...ALWAYS_DENY,
      "write", "edit", "apply_patch",  // testers don't write production code
      "image", "tts",                  // unnecessary
    ],
    timeoutSeconds: TIMEOUT_30_MIN,  // full test suites + E2E
  },

  // pr: just needs read + exec (for `gh pr create`)
  pr: {
    profile: "coding",
    deny: [
      ...ALWAYS_DENY,
      "write", "edit", "apply_patch",  // no file modification
      "image", "tts",                  // unnecessary
      "group:ui",                      // no browser/canvas
    ],
    timeoutSeconds: TIMEOUT_20_MIN,  // quick task, no special-casing
  },

  // scanning: read + exec + web (CVE lookups), NO write
  scanning: {
    profile: "coding",
    alsoAllow: ["web_search", "web_fetch"],
    deny: [
      ...ALWAYS_DENY,
      "write", "edit", "apply_patch",  // scanners don't modify code
      "image", "tts",                  // unnecessary
      "group:ui",                      // no browser/canvas
    ],
    timeoutSeconds: TIMEOUT_20_MIN,  // security scanning + web lookups
  },
};

/**
 * Return the highest configured role timeout (seconds).
 * Used by step-ops to derive the abandoned-step threshold.
 */
export function getMaxRoleTimeoutSeconds(): number {
  return Math.max(...Object.values(ROLE_POLICIES).map(r => r.timeoutSeconds));
}

const SUBAGENT_POLICY = { allowAgents: [] as string[] };

/**
 * Infer an agent's role from its id when not explicitly set in workflow YAML.
 * Matches common agent id patterns across all bundled workflows.
 */
function inferRole(agentId: string): AgentRole {
  const id = agentId.toLowerCase();
  if (id.includes("planner") || id.includes("prioritizer") || id.includes("reviewer")
      || id.includes("investigator") || id.includes("triager")) return "analysis";
  if (id.includes("verifier")) return "verification";
  if (id.includes("tester")) return "testing";
  if (id.includes("scanner")) return "scanning";
  if (id === "pr" || id.includes("/pr")) return "pr";
  // developer, fixer, setup → coding
  return "coding";
}

function buildToolsConfig(role: AgentRole): Record<string, unknown> {
  const defaults = ROLE_POLICIES[role];
  const tools: Record<string, unknown> = {};
  if (defaults.profile) tools.profile = defaults.profile;
  if (defaults.alsoAllow?.length) tools.alsoAllow = defaults.alsoAllow;
  tools.deny = defaults.deny;
  return tools;
}

function ensureCronSessionRetention(config: OpenClawConfig): void {
  if (!config.cron) config.cron = {};
  if (config.cron.sessionRetention === undefined) {
    config.cron.sessionRetention = DEFAULT_CRON_SESSION_RETENTION;
  }
}

function ensureSessionMaintenance(config: OpenClawConfig): void {
  if (!config.session) config.session = {};
  if (!config.session.maintenance) {
    config.session.maintenance = { ...DEFAULT_SESSION_MAINTENANCE };
    return;
  }
  const maintenance = config.session.maintenance;
  if (maintenance.mode === undefined) maintenance.mode = DEFAULT_SESSION_MAINTENANCE.mode;
  if (maintenance.pruneAfter === undefined && maintenance.pruneDays === undefined) {
    maintenance.pruneAfter = DEFAULT_SESSION_MAINTENANCE.pruneAfter;
  }
  if (maintenance.maxEntries === undefined) {
    maintenance.maxEntries = DEFAULT_SESSION_MAINTENANCE.maxEntries;
  }
  if (maintenance.rotateBytes === undefined) {
    maintenance.rotateBytes = DEFAULT_SESSION_MAINTENANCE.rotateBytes;
  }
}

function upsertAgent(
  list: Array<Record<string, unknown>>,
  agent: { id: string; name?: string; model?: string | import("./types.js").ModelConfig; timeoutSeconds?: number; workspaceDir: string; agentDir: string; role: AgentRole },
) {
  const existing = list.find((entry) => entry.id === agent.id);
  // Never overwrite the user's default (main) agent — it was configured outside antfarm.
  if (existing?.default === true) return;
  const payload: Record<string, unknown> = {
    id: agent.id,
    name: agent.name ?? agent.id,
    workspace: agent.workspaceDir,
    agentDir: agent.agentDir,
    tools: buildToolsConfig(agent.role),
    subagents: SUBAGENT_POLICY,
  };
  if (agent.model) payload.model = agent.model;
  // Note: timeoutSeconds is NOT written to the agent config entry because
  // OpenClaw's agent schema uses .strict() and rejects unknown keys.
  // Timeouts are applied via cron job payload.timeoutSeconds instead.
  if (existing) Object.assign(existing, payload);
  else list.push(payload);
}

async function writeWorkflowMetadata(params: { workflowDir: string; workflowId: string; source: string }) {
  const content = { workflowId: params.workflowId, source: params.source, installedAt: new Date().toISOString() };
  await fs.writeFile(path.join(params.workflowDir, "metadata.json"), `${JSON.stringify(content, null, 2)}\n`, "utf-8");
}

export async function installWorkflow(params: { workflowId: string }): Promise<WorkflowInstallResult> {
  const { workflowDir, bundledSourceDir } = await fetchWorkflow(params.workflowId);
  const workflow = await loadWorkflowSpec(workflowDir);
  const provisioned = await provisionAgents({ workflow, workflowDir, bundledSourceDir });

  // Build a role lookup: workflow agent id → role (explicit or inferred)
  const roleMap = new Map<string, AgentRole>();
  for (const agent of workflow.agents) {
    roleMap.set(agent.id, agent.role ?? inferRole(agent.id));
  }

  const { path: configPath, config } = await readOpenClawConfig();
  ensureCronSessionRetention(config);
  ensureSessionMaintenance(config);
  const list = ensureAgentList(config);
  ensureMainAgentInList(list, config);
  for (const agent of provisioned) {
    const existing = list.find((entry) => entry.id === agent.id);
    if (existing && !agent.id.startsWith(workflow.id + "_")) {
      throw new Error(`Agent ID collision: "${agent.id}" already exists from a different source`);
    }
  }
  addSubagentAllowlist(config, provisioned.map((a) => a.id));
  for (const agent of provisioned) {
    // Extract the local agent id (strip the workflow prefix + separator)
    const prefix = workflow.id + "_";
    const localId = agent.id.startsWith(prefix) ? agent.id.slice(prefix.length) : agent.id;
    const role = roleMap.get(localId) ?? inferRole(localId);
    upsertAgent(list, { ...agent, role });
  }
  await writeOpenClawConfig(configPath, config);
  await updateMainAgentGuidance();
  await installAntfarmSkill();
  await writeWorkflowMetadata({ workflowDir, workflowId: workflow.id, source: `bundled:${params.workflowId}` });

  return { workflowId: workflow.id, workflowDir };
}
