#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { startDashboard } from "./dashboard.js";
import { startScheduler, stopScheduler, registerAgents } from "../installer/agent-scheduler.js";
import { getDb } from "../db.js";
import { loadWorkflowSpec } from "../installer/workflow-spec.js";
import { resolveWorkflowDir } from "../installer/paths.js";
import { buildAgentPrompt } from "../installer/agent-cron.js";

const port = parseInt(process.argv[2], 10) || 3333;

const pidDir = path.join(os.homedir(), ".openclaw", "antfarm");
const pidFile = path.join(pidDir, "dashboard.pid");

fs.mkdirSync(pidDir, { recursive: true });
fs.writeFileSync(pidFile, String(process.pid));

process.on("SIGTERM", () => {
  stopScheduler();
  try { fs.unlinkSync(pidFile); } catch {}
  process.exit(0);
});

// Register agents for any active (running) workflow runs
async function registerActiveRunAgents() {
  try {
    const db = getDb();
    const activeRuns = db.prepare(
      "SELECT DISTINCT workflow_id FROM runs WHERE status = 'running'"
    ).all() as Array<{ workflow_id: string }>;

    for (const run of activeRuns) {
      try {
        const workflowDir = resolveWorkflowDir(run.workflow_id);
        const workflow = await loadWorkflowSpec(workflowDir);
        const everyMs = workflow.cron?.interval_ms ?? 300_000;

        const entries = workflow.agents.map((agent: { id: string }, i: number) => ({
          workflowId: workflow.id,
          agentId: agent.id,
          prompt: buildAgentPrompt(workflow.id, agent.id),
          intervalMs: everyMs,
          anchorMs: i * 60_000,
        }));

        registerAgents(entries);
        console.log(`[daemon] Registered ${entries.length} agents for active workflow: ${run.workflow_id}`);
      } catch (err) {
        console.error(`[daemon] Failed to register agents for ${run.workflow_id}:`, err);
      }
    }
  } catch (err) {
    console.error("[daemon] Failed to scan active runs:", err);
  }
}

await registerActiveRunAgents();
startScheduler();
startDashboard(port);
