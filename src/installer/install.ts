import fs from "node:fs/promises";
import path from "node:path";
import { fetchWorkflow } from "./workflow-fetch.js";
import { loadWorkflowSpec } from "./workflow-spec.js";
import { provisionAgents } from "./agent-provision.js";
import { readOpenClawConfig, writeOpenClawConfig } from "./openclaw-config.js";
import { updateMainAgentGuidance } from "./main-agent-guidance.js";
import { addSubagentAllowlist } from "./subagent-allowlist.js";
import { installAntfarmSkill } from "./skill-install.js";
import type { AgentRole, WorkflowInstallResult, WorkflowSpec } from "./types.js";

function ensureAgentList(config: { agents?: { list?: Array<Record<string, unknown>> } }) {
  if (!config.agents) config.agents = {};
  if (!Array.isArray(config.agents.list)) config.agents.list = [];
  return config.agents.list;
}

// ── Shared deny list: things no workflow agent should ever touch ──
const ALWAYS_DENY = ["gateway", "cron", "message", "nodes", "canvas", "sessions_spawn", "sessions_send"];

/**
 * Per-role tool policies using OpenClaw's profile + allow/deny system.
 *
 * Profile "coding" provides: group:fs (read/write/edit/apply_patch),
 *   group:runtime (exec/process), group:sessions, group:memory, image.
 * We then use deny to remove tools each role shouldn't have.
 *
 * Roles without a profile entry use allow-lists for tighter control.
 */
const ROLE_TOOL_POLICIES: Record<AgentRole, { profile?: string; alsoAllow?: string[]; deny: string[] }> = {
  // analysis: read code, run git/grep, reason — no writing, no web, no browser
  analysis: {
    profile: "coding",
    deny: [
      ...ALWAYS_DENY,
      "write", "edit", "apply_patch",  // no file modification
      "image", "tts",                  // unnecessary
      "group:ui",                      // no browser/canvas
    ],
  },

  // coding: full read/write/exec — the workhorses (developer, fixer, setup)
  coding: {
    profile: "coding",
    deny: [
      ...ALWAYS_DENY,
      "image", "tts",                  // unnecessary
      "group:ui",                      // no browser/canvas
    ],
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
  },
};

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
  const policy = ROLE_TOOL_POLICIES[role];
  const tools: Record<string, unknown> = {};
  if (policy.profile) tools.profile = policy.profile;
  if (policy.alsoAllow?.length) tools.alsoAllow = policy.alsoAllow;
  tools.deny = policy.deny;
  return tools;
}

function upsertAgent(
  list: Array<Record<string, unknown>>,
  agent: { id: string; name?: string; model?: string; workspaceDir: string; agentDir: string; role: AgentRole },
) {
  const existing = list.find((entry) => entry.id === agent.id);
  const payload: Record<string, unknown> = {
    id: agent.id,
    name: agent.name ?? agent.id,
    workspace: agent.workspaceDir,
    agentDir: agent.agentDir,
    tools: buildToolsConfig(agent.role),
    subagents: SUBAGENT_POLICY,
  };
  if (agent.model) payload.model = agent.model;
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
  const list = ensureAgentList(config);
  addSubagentAllowlist(config, provisioned.map((a) => a.id));
  for (const agent of provisioned) {
    // Extract the local agent id (after the workflow prefix slash)
    const localId = agent.id.includes("/") ? agent.id.split("/").pop()! : agent.id;
    const role = roleMap.get(localId) ?? inferRole(localId);
    upsertAgent(list, { ...agent, role });
  }
  await writeOpenClawConfig(configPath, config);
  await updateMainAgentGuidance();
  await installAntfarmSkill();
  await writeWorkflowMetadata({ workflowDir, workflowId: workflow.id, source: `bundled:${params.workflowId}` });

  return { workflowId: workflow.id, workflowDir };
}
