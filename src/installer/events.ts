import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { getDb } from "../db.js";
import { logger } from "../lib/logger.js";

const EVENTS_DIR = path.join(os.homedir(), ".openclaw", "antfarm");
const EVENTS_FILE = path.join(EVENTS_DIR, "events.jsonl");
const MAX_EVENTS_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_EVENT_QUEUE_RETRIES = 5;

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

  // Enqueue event for webhook delivery with retry persistence
  try {
    enqueueEvent(evt);
  } catch {
    // best-effort, never throw
  }
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

/**
 * Enqueue an event for persistent webhook delivery with automatic retry.
 */
function enqueueEvent(evt: AntfarmEvent): void {
  try {
    const db = getDb();
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO event_queue (id, event_json, status, retry_count, created_at, updated_at)
      VALUES (?, ?, 'pending', 0, ?, ?)
    `).run(id, JSON.stringify(evt), now, now);

    // Try immediate delivery (fire-and-forget on failure)
    fireWebhook(evt).catch(() => {
      // Failed delivery will be retried by processEventQueue
    });
  } catch (err) {
    logger.debug(`Failed to enqueue event: ${err}`);
  }
}

/**
 * Calculate exponential backoff delay in ms.
 * Progression: 10s, 50s, 250s, 1250s, 5m
 */
function getBackoffDelayMs(retryCount: number): number {
  const baseMs = 10000; // 10s
  const delays = [0, baseMs, 50000, 250000, 1250000, 300000]; // 0, 10s, 50s, 250s, 1250s, 5m
  return delays[Math.min(retryCount, delays.length - 1)];
}

/**
 * Process pending events in the queue with exponential backoff retry.
 * Call this periodically (e.g., every 30s) to handle webhook delivery.
 */
export async function processEventQueue(): Promise<void> {
  try {
    const db = getDb();
    const now = new Date().getTime();

    // Get pending events ready for retry (created_at + backoff <= now)
    const pending = db.prepare(`
      SELECT id, event_json, retry_count, created_at FROM event_queue
      WHERE status = 'pending'
      ORDER BY created_at ASC
      LIMIT 10
    `).all() as Array<{ id: string; event_json: string; retry_count: number; created_at: string }>;

    for (const row of pending) {
      try {
        const createdAtMs = new Date(row.created_at).getTime();
        const backoffMs = getBackoffDelayMs(row.retry_count);
        const nextRetryMs = createdAtMs + backoffMs;

        // Not yet time to retry
        if (now < nextRetryMs) continue;

        const evt: AntfarmEvent = JSON.parse(row.event_json);

        // Attempt delivery
        const success = await fireWebhook(evt);

        if (success) {
          // Mark as delivered
          db.prepare("UPDATE event_queue SET status = 'delivered', updated_at = ? WHERE id = ?")
            .run(new Date().toISOString(), row.id);
        } else {
          // Increment retry count
          const newRetryCount = row.retry_count + 1;
          if (newRetryCount >= MAX_EVENT_QUEUE_RETRIES) {
            // Give up after max retries
            db.prepare("UPDATE event_queue SET status = 'dead_lettered', failed_at = ?, updated_at = ? WHERE id = ?")
              .run(new Date().toISOString(), new Date().toISOString(), row.id);
            logger.warn(`Event queue: Event ${row.id} failed after ${MAX_EVENT_QUEUE_RETRIES} retries, marking dead_lettered`);
          } else {
            // Schedule for next retry
            db.prepare("UPDATE event_queue SET retry_count = ?, updated_at = ? WHERE id = ?")
              .run(newRetryCount, new Date().toISOString(), row.id);
          }
        }
      } catch (err) {
        logger.debug(`Event queue processing error: ${err}`);
      }
    }

    // Check queue depth and alert if too large
    const queueDepth = db.prepare("SELECT COUNT(*) AS cnt FROM event_queue WHERE status = 'pending'").get() as { cnt: number };
    if (queueDepth.cnt > 100) {
      logger.warn(`Event queue: ${queueDepth.cnt} pending events, check webhook connectivity`);
    }
  } catch (err) {
    logger.debug(`processEventQueue error: ${err}`);
  }
}

async function fireWebhook(evt: AntfarmEvent): Promise<boolean> {
  const raw = getNotifyUrl(evt.runId);
  if (!raw) return false;
  try {
    let url = raw;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    const hashIdx = url.indexOf("#auth=");
    if (hashIdx !== -1) {
      headers["Authorization"] = decodeURIComponent(url.slice(hashIdx + 6));
      url = url.slice(0, hashIdx);
    }
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(evt),
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch {
    return false;
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
