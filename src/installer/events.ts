import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { getDb } from "../db.js";

const EVENTS_DIR = path.join(os.homedir(), ".openclaw", "antfarm");
const EVENTS_FILE = path.join(EVENTS_DIR, "events.jsonl");
const MAX_EVENTS_SIZE = 10 * 1024 * 1024; // 10MB

export type EventType =
  | "run.started" | "run.completed" | "run.failed"
  | "step.pending" | "step.running" | "step.done" | "step.failed" | "step.timeout"
  | "story.started" | "story.done" | "story.verified" | "story.retry" | "story.failed"
  | "pipeline.advanced";

export interface AntfarmEvent {
  ts: string;
  event: EventType;
  runId: string;
  workflowId?: string;
  /** Human-readable step name (e.g. "plan", "implement"), NOT the internal UUID. */
  stepId?: string;
  agentId?: string;
  storyId?: string;
  storyTitle?: string;
  detail?: string;
}

export function emitEvent(evt: AntfarmEvent): void {
  try {
    fs.mkdirSync(EVENTS_DIR, { recursive: true });
    // Rotate if too large
    try {
      const stats = fs.statSync(EVENTS_FILE);
      if (stats.size > MAX_EVENTS_SIZE) {
        const rotated = EVENTS_FILE + ".1";
        try { fs.unlinkSync(rotated); } catch {}
        fs.renameSync(EVENTS_FILE, rotated);
      }
    } catch {}
    fs.appendFileSync(EVENTS_FILE, JSON.stringify(evt) + "\n");
  } catch {
    // best-effort, never throw
  }
  fireWebhook(evt);
}

// In-memory cache: runId -> notify_url | null
const notifyUrlCache = new Map<string, string | null>();

function getNotifyUrl(runId: string): string | null {
  if (notifyUrlCache.has(runId)) return notifyUrlCache.get(runId)!;
  try {
    const db = getDb();
    const row = db.prepare("SELECT notify_url FROM runs WHERE id = ?").get(runId) as { notify_url: string | null } | undefined;
    const url = row?.notify_url ?? null;
    notifyUrlCache.set(runId, url);
    return url;
  } catch {
    return null;
  }
}

// Validates webhook URL to prevent SSRF attacks
function validateWebhookUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    
    // Only allow http and https
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return false;
    }
    
    // Reject localhost and internal IPs
    const hostname = parsed.hostname.toLowerCase();
    const internalPatterns = [
      /^localhost$/,
      /^127\./,
      /^10\./,
      /^172\.(1[6-9]|2[0-9]|3[01])\./,
      /^192\.168\./,
      /^0\.0\.0\.0$/,
      /^255\.255\.255\.255$/,
      // IPv6 patterns (note: hostname includes brackets for IPv6)
      /^\[fc00:/i,  // IPv6 unique local
      /^\[fe80:/i,  // IPv6 link-local
      /^\[::1\]$/,  // IPv6 loopback
    ];
    
    for (const pattern of internalPatterns) {
      if (pattern.test(hostname)) {
        return false;
      }
    }
    
    return true;
  } catch {
    return false;
  }
}

function fireWebhook(evt: AntfarmEvent): void {
  const raw = getNotifyUrl(evt.runId);
  if (!raw) return;
  try {
    // Validate URL to prevent SSRF attacks
    if (!validateWebhookUrl(raw)) {
      // Silently fail - do not send webhook to suspicious URLs
      return;
    }
    
    const url = raw;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    
    // Get auth from environment variables (not from URL fragments)
    // Support both generic ANTFARM_WEBHOOK_AUTH and run-specific ANTFARM_WEBHOOK_AUTH_<runId>
    const runSpecificEnvKey = `ANTFARM_WEBHOOK_AUTH_${evt.runId}`;
    const authFromEnv = process.env[runSpecificEnvKey] || process.env.ANTFARM_WEBHOOK_AUTH;
    
    if (authFromEnv) {
      headers["Authorization"] = authFromEnv;
    }
    
    fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(evt),
      signal: AbortSignal.timeout(5000),
    }).catch(() => {});
  } catch {
    // fire-and-forget
  }
}

// Read recent events (last N)
export function getRecentEvents(limit = 50): AntfarmEvent[] {
  try {
    const content = fs.readFileSync(EVENTS_FILE, "utf-8");
    const lines = content.trim().split("\n").filter(Boolean);
    const events: AntfarmEvent[] = [];
    for (const line of lines) {
      try { events.push(JSON.parse(line) as AntfarmEvent); } catch {}
    }
    return events.slice(-limit);
  } catch {
    return [];
  }
}

// Read events for a specific run (supports prefix match)
export function getRunEvents(runId: string, limit = 200): AntfarmEvent[] {
  try {
    const content = fs.readFileSync(EVENTS_FILE, "utf-8");
    const lines = content.trim().split("\n").filter(Boolean);
    const events: AntfarmEvent[] = [];
    for (const line of lines) {
      try {
        const evt = JSON.parse(line) as AntfarmEvent;
        if (evt.runId === runId || evt.runId.startsWith(runId)) events.push(evt);
      } catch {}
    }
    return events.slice(-limit);
  } catch {
    return [];
  }
}
