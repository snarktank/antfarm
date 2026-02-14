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

/** Check if a URL is safe for webhooks (blocks internal/private ranges). */
function isSafeUrl(urlStr: string): boolean {
  try {
    const url = new URL(urlStr);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;

    const host = url.hostname.toLowerCase();

    // 1. Literal localhost / loopback
    if (host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "0.0.0.0") return false;

    // 2. IPv4 Private Ranges
    // 10.0.0.0/8
    if (host.startsWith("10.")) return false;
    // 172.16.0.0/12
    if (host.startsWith("172.")) {
      const parts = host.split(".");
      if (parts.length >= 2) {
        const second = parseInt(parts[1], 10);
        if (second >= 16 && second <= 31) return false;
      }
    }
    // 192.168.0.0/16
    if (host.startsWith("192.168.")) return false;
    // 169.254.0.0/16 (Link-local)
    if (host.startsWith("169.254.")) return false;

    // 3. IPv6 Private/Local Ranges
    if (host.startsWith("[fc") || host.startsWith("[fd")) return false;
    if (host.startsWith("[fe80")) return false;

    return true;
  } catch {
    return false;
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

    if (!isSafeUrl(url)) {
      return;
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
