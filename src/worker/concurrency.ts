import { getDb } from "../db.js";
import { loadConfig } from "../config.js";
import { logger } from "../lib/logger.js";

const SLOT_WAIT_TIMEOUT_MS = 60_000; // 60 seconds
const SLOT_POLL_INTERVAL_MS = 1_000; // check every second
const MAX_QUEUE_DEPTH = 10;

/**
 * Normalise a model string to a concurrency key (opus, sonnet, haiku).
 * Accepts full model IDs like "claude-opus-4-6" or short names like "opus".
 */
function modelToKey(model: string): string {
  const lower = model.toLowerCase();
  if (lower.includes("opus")) return "opus";
  if (lower.includes("sonnet")) return "sonnet";
  if (lower.includes("haiku")) return "haiku";
  // Default to opus limits for unknown models (conservative)
  return "opus";
}

/**
 * Controls the number of concurrent workers per model type.
 *
 * Uses the `concurrency_queue` database table to track slots.
 * Rows with status='acquired' represent active slots.
 * Rows with status='waiting' represent queued requests.
 *
 * Limits are loaded from antfarm.json config:
 *   { "concurrency": { "opus": 2, "sonnet": 4, "haiku": 8 } }
 */
export class ConcurrencyController {
  /**
   * Try to acquire a concurrency slot for the given model.
   * Blocks (polls) until a slot opens or the timeout expires.
   *
   * @returns The queue entry ID if acquired, or null if rejected (QUEUE_FULL or timeout).
   */
  async acquireSlot(model: string, agentId: string, stepId: string): Promise<number | null> {
    const key = modelToKey(model);
    const config = loadConfig();
    const limit = config.concurrency[key as keyof typeof config.concurrency] ?? 2;

    // Check queue depth first — reject if already overloaded
    const depth = this.getQueueDepth(key);
    if (depth >= MAX_QUEUE_DEPTH) {
      logger.error(`QUEUE_FULL: ${key} queue depth ${depth} >= ${MAX_QUEUE_DEPTH}, rejecting claim for step=${stepId}`);
      return null;
    }

    // Check if a slot is immediately available
    const active = this.getActiveSlotCount(key);
    if (active < limit) {
      return this.insertSlot(key, agentId, stepId, "acquired");
    }

    // No immediate slot — queue and wait
    const queueId = this.insertSlot(key, agentId, stepId, "waiting");
    logger.info(`Concurrency limit reached for ${key} (${active}/${limit}), queued step=${stepId} (queueId=${queueId})`);

    const deadline = Date.now() + SLOT_WAIT_TIMEOUT_MS;

    while (Date.now() < deadline) {
      await sleep(SLOT_POLL_INTERVAL_MS);

      // Clean up stale acquired slots (process may have died)
      this.cleanupStaleSlots(key);

      const currentActive = this.getActiveSlotCount(key);
      if (currentActive < limit) {
        // Try to promote our queue entry — use atomic update to handle races
        const promoted = this.promoteSlot(queueId);
        if (promoted) {
          logger.info(`Slot acquired for ${key} step=${stepId} after queuing (queueId=${queueId})`);
          return queueId;
        }
        // Another waiter beat us — keep waiting
      }
    }

    // Timeout — remove our queue entry and return null
    this.removeSlot(queueId);
    logger.warn(`Concurrency slot timeout for ${key} step=${stepId} after ${SLOT_WAIT_TIMEOUT_MS}ms`);
    return null;
  }

  /**
   * Release a concurrency slot by queue entry ID.
   */
  releaseSlot(slotId: number): void {
    try {
      const db = getDb();
      db.prepare(
        "UPDATE concurrency_queue SET status = 'released', released_at = ? WHERE id = ? AND status = 'acquired'"
      ).run(new Date().toISOString(), slotId);
      logger.info(`Concurrency slot released: id=${slotId}`);
    } catch (err) {
      logger.warn(`Failed to release concurrency slot ${slotId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * Release a concurrency slot by step ID.
   * Useful when the step ID is known but the queue entry ID isn't.
   */
  releaseSlotByStepId(stepId: string): void {
    try {
      const db = getDb();
      const row = db.prepare(
        "SELECT id FROM concurrency_queue WHERE step_id = ? AND status = 'acquired'"
      ).get(stepId) as { id: number } | undefined;

      if (row) {
        this.releaseSlot(row.id);
      }
    } catch (err) {
      logger.warn(`Failed to release slot by stepId ${stepId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * Get the number of waiting entries in the queue for a model.
   */
  getQueueDepth(model: string): number {
    const key = modelToKey(model);
    try {
      const db = getDb();
      const row = db.prepare(
        "SELECT COUNT(*) as cnt FROM concurrency_queue WHERE model = ? AND status = 'waiting'"
      ).get(key) as { cnt: number };
      return row.cnt;
    } catch (err) {
      logger.warn(`Failed to get queue depth for ${key}: ${err instanceof Error ? err.message : String(err)}`);
      return 0;
    }
  }

  /**
   * Get the number of actively acquired slots for a model.
   */
  getActiveWorkerCount(model: string): number {
    return this.getActiveSlotCount(modelToKey(model));
  }

  /**
   * Get the concurrency limit for a model from config.
   */
  getLimit(model: string): number {
    const key = modelToKey(model);
    const config = loadConfig();
    return config.concurrency[key as keyof typeof config.concurrency] ?? 2;
  }

  // ── Internal helpers ──────────────────────────────────────────────

  private getActiveSlotCount(key: string): number {
    try {
      const db = getDb();
      const row = db.prepare(
        "SELECT COUNT(*) as cnt FROM concurrency_queue WHERE model = ? AND status = 'acquired'"
      ).get(key) as { cnt: number };
      return row.cnt;
    } catch (err) {
      logger.warn(`Failed to count active slots for ${key}: ${err instanceof Error ? err.message : String(err)}`);
      return 0;
    }
  }

  private insertSlot(key: string, agentId: string, stepId: string, status: "acquired" | "waiting"): number {
    const db = getDb();
    const now = new Date().toISOString();
    const acquiredAt = status === "acquired" ? now : null;

    const result = db.prepare(
      `INSERT INTO concurrency_queue (model, agent_id, step_id, status, queued_at, acquired_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(key, agentId, stepId, status, now, acquiredAt);

    return Number(result.lastInsertRowid);
  }

  /**
   * Atomically promote a waiting entry to acquired.
   * Returns true if the promotion succeeded (i.e., the row was still in 'waiting' status).
   */
  private promoteSlot(queueId: number): boolean {
    try {
      const db = getDb();
      const result = db.prepare(
        "UPDATE concurrency_queue SET status = 'acquired', acquired_at = ? WHERE id = ? AND status = 'waiting'"
      ).run(new Date().toISOString(), queueId);
      return result.changes > 0;
    } catch {
      return false;
    }
  }

  private removeSlot(queueId: number): void {
    try {
      const db = getDb();
      db.prepare("DELETE FROM concurrency_queue WHERE id = ?").run(queueId);
    } catch (err) {
      logger.warn(`Failed to remove queue entry ${queueId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * Clean up acquired slots whose worker processes are no longer alive.
   * This prevents dead workers from holding slots indefinitely.
   */
  private cleanupStaleSlots(key: string): void {
    try {
      const db = getDb();
      const rows = db.prepare(
        `SELECT cq.id, w.pid
         FROM concurrency_queue cq
         LEFT JOIN workers w ON cq.step_id = w.step_id AND w.status = 'running'
         WHERE cq.model = ? AND cq.status = 'acquired'`
      ).all(key) as Array<{ id: number; pid: number | null }>;

      for (const row of rows) {
        if (row.pid === null) {
          // No matching running worker found — slot is stale
          // But only clean up if it's been acquired for > 30 seconds (give time for worker to start)
          const entry = db.prepare(
            "SELECT acquired_at FROM concurrency_queue WHERE id = ?"
          ).get(row.id) as { acquired_at: string | null } | undefined;

          if (entry?.acquired_at) {
            const age = Date.now() - new Date(entry.acquired_at).getTime();
            if (age > 30_000) {
              db.prepare(
                "UPDATE concurrency_queue SET status = 'released', released_at = ? WHERE id = ?"
              ).run(new Date().toISOString(), row.id);
              logger.info(`Cleaned stale concurrency slot: id=${row.id} model=${key}`);
            }
          }
          continue;
        }

        // Check if the worker process is still alive
        try {
          process.kill(row.pid, 0);
        } catch {
          // Process is dead — release the slot
          db.prepare(
            "UPDATE concurrency_queue SET status = 'released', released_at = ? WHERE id = ?"
          ).run(new Date().toISOString(), row.id);
          logger.info(`Cleaned stale concurrency slot (dead PID ${row.pid}): id=${row.id} model=${key}`);
        }
      }
    } catch (err) {
      logger.warn(`Failed to clean stale slots for ${key}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
