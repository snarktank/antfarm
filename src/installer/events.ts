import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { getDb } from "../db.js";

const EVENTS_DIR = path.join(os.homedir(), ".openclaw", "antfarm");
const EVENTS_FILE = path.join(EVENTS_DIR, "events.jsonl");
const MAX_EVENTS_SIZE = 10 * 1024 * 1024; // 10MB
const NOTIFY_URL_TTL_MS = 60_000;

export type EventType =
  | "run.started" | "run.completed" | "run.failed"
  | "step.pending" | "step.running" | "step.done" | "step.failed" | "step.timeout"
  | "story.started" | "story.done" | "story.verified" | "story.retry" | "story.failed"
  | "pipeline.advanced" | "error";

export interface AntfarmEvent {
  ts: string;
  event: EventType;
  runId: string;
  workflowId?: string;
  stepId?: string;
  agentId?: string;
  storyId?: string;
  storyTitle?: string;
  detail?: string;
}

let eventFileLock = false;

export function emitEvent(evt: AntfarmEvent): void {
  try {
    if (eventFileLock) {
      fs.mkdirSync(EVENTS_DIR, { recursive: true });
      fs.appendFileSync(EVENTS_FILE, JSON.stringify(evt) + "\n");
    } else {
      eventFileLock = true;
      try {
        fs.mkdirSync(EVENTS_DIR, { recursive: true });
        // Rotate if too large
        try {
          const stats = fs.statSync(EVENTS_FILE);
          if (stats.size > MAX_EVENTS_SIZE) {
            const rotated = EVENTS_FILE + ".1";
            try {
              fs.unlinkSync(rotated);
            } catch {}
            fs.renameSync(EVENTS_FILE, rotated);
          }
        } catch {}
        fs.appendFileSync(EVENTS_FILE, JSON.stringify(evt) + "\n");
      } catch {
        // best-effort, never throw
      } finally {
        eventFileLock = false;
      }
    }
  } catch {
    // best-effort, never throw
  }
  fireWebhook(evt);
}

interface NotifyUrlCacheEntry {
  url: string | null;
  ts: number;
}

// In-memory cache: runId -> { url, ts }
const notifyUrlCache = new Map<string, NotifyUrlCacheEntry>();

function getNotifyUrl(runId: string): string | null {
  const now = Date.now();
  const cached = notifyUrlCache.get(runId);
  if (cached && now - cached.ts < NOTIFY_URL_TTL_MS) return cached.url;
  try {
    const db = getDb();
    const row = db.prepare("SELECT notify_url FROM runs WHERE id = ?").get(runId) as { notify_url: string | null } | undefined;
    const url = row?.notify_url ?? null;
    notifyUrlCache.set(runId, { url, ts: now });
    return url;
  } catch {
    return null;
  }
}

function fireWebhook(evt: AntfarmEvent): void {
  const raw = getNotifyUrl(evt.runId);
  if (!raw) return;
  try {
    let url = raw;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    const hashIdx = url.indexOf("#auth=");
    if (hashIdx !== -1) {
      headers["Authorization"] = decodeURIComponent(url.slice(hashIdx + 6));
      url = url.slice(0, hashIdx);
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

// Read events for a specific run
export function getRunEvents(runId: string, limit = 200): AntfarmEvent[] {
  try {
    const content = fs.readFileSync(EVENTS_FILE, "utf-8");
    const lines = content.trim().split("\n").filter(Boolean);
    const events: AntfarmEvent[] = [];
    for (const line of lines) {
      try {
        const evt = JSON.parse(line) as AntfarmEvent;
        if (evt.runId === runId) events.push(evt);
      } catch {}
    }
    return events.slice(-limit);
  } catch {
    return [];
  }
}
