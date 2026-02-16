import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { getDb } from "../db.js";

const EVENTS_DIR = path.join(os.homedir(), ".openclaw", "antfarm");
const EVENTS_FILE = path.join(EVENTS_DIR, "events.jsonl");
const MAX_EVENTS_SIZE = 10 * 1024 * 1024; // 10MB
const QUEUE_BACKLOG_THRESHOLD = 100; // Alert if queue > 100 pending events

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
    // Rotate if too large, preserving undelivered events
    try {
      const stats = fs.statSync(EVENTS_FILE);
      if (stats.size > MAX_EVENTS_SIZE) {
        rotateEventsFile();
      }
    } catch {}
    fs.appendFileSync(EVENTS_FILE, JSON.stringify(evt) + "\n");
  } catch {
    // best-effort, never throw
  }
  
  // Enqueue event for delivery with retry logic
  try {
    enqueueEvent(evt);
  } catch {
    // best-effort
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
 * Enqueue an event for delivery to Mission Control with retry logic.
 * Ensures all events are persisted before webhook attempt.
 */
function enqueueEvent(evt: AntfarmEvent): void {
  try {
    const db = getDb();
    const now = new Date().toISOString();
    const queueId = crypto.randomUUID();
    
    db.prepare(`
      INSERT INTO event_queue (
        id, event_data, run_id, status, retry_count, max_retries,
        next_retry_at, created_at, updated_at
      ) VALUES (?, ?, ?, 'pending', 0, 5, ?, ?, ?)
    `).run(queueId, JSON.stringify(evt), evt.runId, now, now, now);
    
    // Check for backlog alert
    checkQueueBacklog();
    
    // Schedule immediate async processing (non-blocking)
    setImmediate(() => processQueueItem(queueId));
  } catch {
    // best-effort, never throw
  }
}

/**
 * Process a single queue item with retry logic and exponential backoff.
 */
function processQueueItem(queueId: string): void {
  try {
    const db = getDb();
    const item = db.prepare(`
      SELECT id, event_data, run_id, retry_count, max_retries, status, next_retry_at
      FROM event_queue WHERE id = ?
    `).get(queueId) as {
      id: string;
      event_data: string;
      run_id: string;
      retry_count: number;
      max_retries: number;
      status: string;
      next_retry_at: string | null;
    } | undefined;
    
    if (!item) return;
    
    // Skip if not yet ready for retry
    if (item.next_retry_at && new Date(item.next_retry_at) > new Date()) {
      return;
    }
    
    const evt: AntfarmEvent = JSON.parse(item.event_data);
    const raw = getNotifyUrl(item.run_id);
    
    if (!raw) {
      // No notify URL, mark as dead-lettered (no delivery needed)
      db.prepare(`
        UPDATE event_queue SET status = 'dead_lettered', updated_at = ?
        WHERE id = ?
      `).run(new Date().toISOString(), queueId);
      return;
    }
    
    // Attempt webhook delivery
    attemptWebhookDelivery(queueId, evt, raw);
  } catch {
    // best-effort
  }
}

/**
 * Attempt to deliver event to Mission Control webhook endpoint.
 */
function attemptWebhookDelivery(queueId: string, evt: AntfarmEvent, notifyUrl: string): void {
  try {
    let url = notifyUrl;
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
    })
      .then((resp) => {
        if (resp.ok) {
          // Mark as delivered
          const db = getDb();
          const now = new Date().toISOString();
          db.prepare(`
            UPDATE event_queue
            SET status = 'delivered', delivered_at = ?, updated_at = ?
            WHERE id = ?
          `).run(now, now, queueId);
        } else {
          handleWebhookFailure(queueId, `HTTP ${resp.status}`);
        }
      })
      .catch((err) => {
        handleWebhookFailure(queueId, String(err));
      });
  } catch (err) {
    handleWebhookFailure(queueId, String(err));
  }
}

/**
 * Handle a failed webhook delivery with exponential backoff retry.
 */
function handleWebhookFailure(queueId: string, error: string): void {
  try {
    const db = getDb();
    const item = db.prepare(`
      SELECT retry_count, max_retries FROM event_queue WHERE id = ?
    `).get(queueId) as {
      retry_count: number;
      max_retries: number;
    } | undefined;
    
    if (!item) return;
    
    const now = new Date();
    const nextRetryCount = item.retry_count + 1;
    
    if (nextRetryCount > item.max_retries) {
      // Max retries exceeded, move to dead letter
      db.prepare(`
        UPDATE event_queue
        SET status = 'dead_lettered', last_error = ?, updated_at = ?
        WHERE id = ?
      `).run(error, now.toISOString(), queueId);
    } else {
      // Calculate next retry time with exponential backoff: 2^retryCount seconds
      const backoffMs = Math.pow(2, nextRetryCount) * 1000;
      const nextRetryAt = new Date(now.getTime() + backoffMs).toISOString();
      
      db.prepare(`
        UPDATE event_queue
        SET status = 'pending', retry_count = ?, next_retry_at = ?, 
            last_error = ?, updated_at = ?
        WHERE id = ?
      `).run(nextRetryCount, nextRetryAt, error, now.toISOString(), queueId);
    }
  } catch {
    // best-effort
  }
}

/**
 * Check queue backlog and emit alert if threshold exceeded.
 */
function checkQueueBacklog(): void {
  try {
    const db = getDb();
    const result = db.prepare(`
      SELECT COUNT(*) as count FROM event_queue WHERE status = 'pending'
    `).get() as { count: number } | undefined;
    
    if (result && result.count > QUEUE_BACKLOG_THRESHOLD) {
      console.warn(`⚠️  Event queue backlog alert: ${result.count} pending events (threshold: ${QUEUE_BACKLOG_THRESHOLD})`);
    }
  } catch {
    // best-effort
  }
}

/**
 * Process all retry-eligible items in the event queue.
 * Should be called periodically (e.g., every 30 seconds) by a background task.
 */
export function processEventQueue(): number {
  try {
    const db = getDb();
    const now = new Date().toISOString();
    
    // Get all items ready for retry
    const items = db.prepare(`
      SELECT id FROM event_queue
      WHERE status = 'pending' AND (next_retry_at IS NULL OR next_retry_at <= ?)
      LIMIT 50
    `).all(now) as Array<{ id: string }>;
    
    for (const item of items) {
      processQueueItem(item.id);
    }
    
    return items.length;
  } catch {
    return 0;
  }
}

/**
 * Rotate events.jsonl file, preserving undelivered events.
 */
function rotateEventsFile(): void {
  try {
    const rotated = EVENTS_FILE + ".1";
    try { fs.unlinkSync(rotated); } catch {}
    
    // Read current events
    const content = fs.readFileSync(EVENTS_FILE, "utf-8");
    const lines = content.trim().split("\n").filter(Boolean);
    const events: AntfarmEvent[] = [];
    
    for (const line of lines) {
      try {
        events.push(JSON.parse(line) as AntfarmEvent);
      } catch {
        // skip malformed
      }
    }
    
    // Check which events have undelivered queue items
    const db = getDb();
    const undeliveredIds = new Set<string>();
    
    const undelivered = db.prepare(`
      SELECT DISTINCT run_id FROM event_queue WHERE status IN ('pending', 'dead_lettered')
    `).all() as Array<{ run_id: string }>;
    
    for (const item of undelivered) {
      undeliveredIds.add(item.run_id);
    }
    
    // Keep only events with undelivered queued items
    const preserved = events.filter(e => undeliveredIds.has(e.runId));
    
    // Rotate current file
    fs.renameSync(EVENTS_FILE, rotated);
    
    // Write preserved events back
    if (preserved.length > 0) {
      fs.writeFileSync(EVENTS_FILE, preserved.map(e => JSON.stringify(e)).join("\n") + "\n");
    }
  } catch {
    // best-effort
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
