import { getDb } from "../db.js";
import { sendNotification } from "./gateway-api.js";
import { loadWorkflowSpec } from "./workflow-spec.js";
import type { NotificationsConfig } from "./types.js";
import path from "node:path";
import os from "node:os";

interface RunRow {
  workflow_id: string;
  task: string;
  context: string;
  status: string;
  created_at: string;
  updated_at: string;
}

interface StoryRow {
  status: string;
}

function formatDuration(start: string, end: string): string {
  try {
    const ms = new Date(end).getTime() - new Date(start).getTime();
    if (ms < 0) return "unknown";
    const mins = Math.floor(ms / 60000);
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    const remMins = mins % 60;
    return `${hrs}h ${remMins}m`;
  } catch {
    return "unknown";
  }
}

function truncate(text: string, maxLen: number = 100): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 3) + "...";
}

/**
 * Build a human-readable summary message for a completed/failed run.
 */
export function formatRunSummary(opts: {
  workflowName: string;
  task: string;
  status: "completed" | "failed";
  createdAt: string;
  updatedAt: string;
  prLink?: string;
  storyCounts: { done: number; failed: number; total: number };
}): string {
  const emoji = opts.status === "completed" ? "✅" : "❌";
  const duration = formatDuration(opts.createdAt, opts.updatedAt);

  const lines = [
    `${emoji} **Workflow ${opts.status}:** ${opts.workflowName}`,
    `Task: ${truncate(opts.task)}`,
    `Status: ${opts.status}`,
    `Duration: ${duration}`,
    `Stories: ${opts.storyCounts.done} done, ${opts.storyCounts.failed} failed, ${opts.storyCounts.total} total`,
  ];

  if (opts.prLink) {
    lines.push(`PR: ${opts.prLink}`);
  }

  return lines.join("\n");
}

/**
 * Send a notification when a run completes or fails.
 * Best-effort: never throws.
 */
export async function sendRunNotification(runId: string): Promise<void> {
  try {
    const db = getDb();

    // Load run
    const run = db.prepare(
      "SELECT workflow_id, task, context, status, created_at, updated_at FROM runs WHERE id = ?"
    ).get(runId) as RunRow | undefined;
    if (!run) return;

    const runStatus = run.status === "completed" ? "completed" : "failed";

    // Load workflow spec for notifications config
    const workflowDir = path.join(
      os.homedir(), ".openclaw", "workspace", "antfarm", "workflows", run.workflow_id
    );
    let config: NotificationsConfig | undefined;
    try {
      const spec = await loadWorkflowSpec(workflowDir);
      config = spec.notifications;
    } catch {
      return; // Can't load spec, skip
    }

    // Check enabled flag (defaults to true if not specified)
    if (config?.enabled === false) return;

    // Check on_success / on_failure flags (default to true)
    if (runStatus === "completed" && config?.on_success === false) return;
    if (runStatus === "failed" && config?.on_failure === false) return;

    // Get story counts
    const stories = db.prepare(
      "SELECT status FROM stories WHERE run_id = ?"
    ).all(runId) as unknown as StoryRow[];
    const storyCounts = {
      done: stories.filter(s => s.status === "done").length,
      failed: stories.filter(s => s.status === "failed").length,
      total: stories.length,
    };

    // Parse context for PR link
    let context: Record<string, string> = {};
    try { context = JSON.parse(run.context); } catch { /* ignore */ }

    const message = formatRunSummary({
      workflowName: run.workflow_id,
      task: run.task,
      status: runStatus,
      createdAt: run.created_at,
      updatedAt: run.updated_at,
      prLink: context.pr,
      storyCounts,
    });

    const sessionTarget = config?.sessionTarget ?? config?.channel ?? "main";
    await sendNotification({ message, sessionTarget });
  } catch {
    // Best-effort: never throw
  }
}
