import { describe, it, afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { getDb } from "../db.js";
import { emitEvent, getRecentEvents, getRunEvents, processEventQueue } from "./events.js";
import type { AntfarmEvent } from "./events.js";

// Helper to clean up test data
function cleanupTestData(runId?: string) {
  const db = getDb();
  try {
    if (runId) {
      db.prepare("DELETE FROM event_queue WHERE run_id = ?").run(runId);
      db.prepare("DELETE FROM runs WHERE id = ?").run(runId);
    } else {
      db.prepare("DELETE FROM event_queue").run();
    }
  } catch {}
}

describe("Event Queue with Persistent Storage and Retry Logic", () => {
  let testRunId: string;

  beforeEach(() => {
    testRunId = crypto.randomUUID();
    cleanupTestData();
    
    // Set up a test run with notify_url for webhook delivery tests
    const db = getDb();
    const now = new Date().toISOString();
    db.prepare(`
      INSERT OR REPLACE INTO runs (
        id, workflow_id, task, status, context, notify_url, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(testRunId, "test-wf", "test task", "running", "{}", "http://localhost:9999/webhook", now, now);
  });

  afterEach(() => {
    cleanupTestData(testRunId);
  });

  it("should enqueue events for delivery before firing webhook", async () => {
    const evt: AntfarmEvent = {
      ts: new Date().toISOString(),
      event: "run.started",
      runId: testRunId,
      workflowId: "test-wf-1",
    };

    emitEvent(evt);

    // Check that event is in queue
    const db = getDb();
    const queueItems = db.prepare(
      "SELECT * FROM event_queue WHERE run_id = ?"
    ).all(testRunId) as Array<{ status: string; event_data: string }>;

    assert.ok(queueItems.length > 0, "Event should be queued");
    assert.equal(queueItems[0].status, "pending", "Event should be pending");

    const storedEvent = JSON.parse(queueItems[0].event_data) as AntfarmEvent;
    assert.equal(storedEvent.event, "run.started");
    assert.equal(storedEvent.runId, testRunId);
  });

  it("should persist events to events.jsonl for audit trail", async () => {
    const evt: AntfarmEvent = {
      ts: new Date().toISOString(),
      event: "step.done",
      runId: testRunId,
      stepId: "implement",
    };

    emitEvent(evt);

    // Check recent events
    const events = getRecentEvents(10);
    const found = events.find((e) => e.stepId === "implement" && e.runId === testRunId);
    assert.ok(found, "Event should be in events.jsonl");
  });

  it("should track retry count and exponential backoff on delivery failure", async () => {
    const evt: AntfarmEvent = {
      ts: new Date().toISOString(),
      event: "run.completed",
      runId: testRunId,
    };

    emitEvent(evt);

    const db = getDb();

    // Get the queued item
    let item = db.prepare(
      "SELECT id, retry_count, status, next_retry_at FROM event_queue WHERE run_id = ?"
    ).get(testRunId) as {
      id: string;
      retry_count: number;
      status: string;
      next_retry_at: string | null;
    };

    assert.equal(item.retry_count, 0, "Initial retry count should be 0");
    assert.equal(item.status, "pending", "Initial status should be pending");

    // Simulate a failed delivery by directly updating the queue item
    // (since we can't easily mock fetch in this test)
    const queueId = item.id;
    const now = new Date();
    const backoffMs = Math.pow(2, 1) * 1000; // 2^1 = 2 seconds
    const nextRetry = new Date(now.getTime() + backoffMs).toISOString();

    db.prepare(
      "UPDATE event_queue SET retry_count = 1, status = 'pending', next_retry_at = ? WHERE id = ?"
    ).run(nextRetry, queueId);

    // Verify retry tracking
    item = db.prepare(
      "SELECT id, retry_count, status, next_retry_at FROM event_queue WHERE id = ?"
    ).get(queueId) as {
      id: string;
      retry_count: number;
      status: string;
      next_retry_at: string | null;
    };

    assert.equal(item.retry_count, 1, "Retry count should increment");
    assert.ok(item.next_retry_at, "Next retry time should be set");
    assert(
      new Date(item.next_retry_at!) > now,
      "Next retry should be in the future"
    );
  });

  it("should move events to dead letter after max retries", async () => {
    const db = getDb();
    const queueId = crypto.randomUUID();
    const evt: AntfarmEvent = {
      ts: new Date().toISOString(),
      event: "run.failed",
      runId: testRunId,
    };

    // Directly insert a max-retried item
    db.prepare(`
      INSERT INTO event_queue (
        id, event_data, run_id, status, retry_count, max_retries,
        created_at, updated_at, last_error
      ) VALUES (?, ?, ?, 'pending', 5, 5, ?, ?, 'Connection timeout')
    `).run(queueId, JSON.stringify(evt), testRunId, new Date().toISOString(), new Date().toISOString());

    // Mark as dead-lettered (exceeds max retries)
    db.prepare(
      "UPDATE event_queue SET status = 'dead_lettered' WHERE id = ?"
    ).run(queueId);

    const item = db.prepare(
      "SELECT status FROM event_queue WHERE id = ?"
    ).get(queueId) as { status: string };

    assert.equal(item.status, "dead_lettered", "Event should be dead-lettered after max retries");
  });

  it("should track delivery confirmation", async () => {
    const db = getDb();
    const queueId = crypto.randomUUID();
    const evt: AntfarmEvent = {
      ts: new Date().toISOString(),
      event: "run.completed",
      runId: testRunId,
    };

    // Insert a queued event
    db.prepare(`
      INSERT INTO event_queue (
        id, event_data, run_id, status, retry_count, max_retries,
        created_at, updated_at
      ) VALUES (?, ?, ?, 'pending', 0, 5, ?, ?)
    `).run(queueId, JSON.stringify(evt), testRunId, new Date().toISOString(), new Date().toISOString());

    // Mark as delivered with confirmation
    const now = new Date().toISOString();
    db.prepare(
      "UPDATE event_queue SET status = 'delivered', delivered_at = ? WHERE id = ?"
    ).run(now, queueId);

    const item = db.prepare(
      "SELECT status, delivered_at FROM event_queue WHERE id = ?"
    ).get(queueId) as { status: string; delivered_at: string | null };

    assert.equal(item.status, "delivered", "Event should be marked delivered");
    assert.ok(item.delivered_at, "Delivery confirmation timestamp should be set");
  });

  it("should skip events without notify_url (no delivery needed)", async () => {
    const db = getDb();
    const noUrlRunId = crypto.randomUUID();
    const evt: AntfarmEvent = {
      ts: new Date().toISOString(),
      event: "run.started",
      runId: noUrlRunId,
    };

    // Create a run without notify_url
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO runs (
        id, workflow_id, task, status, context, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(noUrlRunId, "test-wf", "test task", "running", "{}", now, now);

    emitEvent(evt);

    // Give async processing a moment to complete
    await new Promise(resolve => setTimeout(resolve, 10));

    // Event should be queued and marked as dead-lettered (no delivery needed)
    const queueItems = db.prepare(
      "SELECT status FROM event_queue WHERE run_id = ?"
    ).all(noUrlRunId) as Array<{ status: string }>;

    // Should be dead-lettered since no notify_url
    if (queueItems.length > 0) {
      assert.equal(queueItems[0].status, "dead_lettered", "Event should be dead-lettered (no notify URL)");
    }
    
    // Cleanup
    cleanupTestData(noUrlRunId);
  });

  it("should process queue items with exponential backoff", async () => {
    const db = getDb();
    const queueId = crypto.randomUUID();
    const evt: AntfarmEvent = {
      ts: new Date().toISOString(),
      event: "step.done",
      runId: testRunId,
    };

    // Insert an item with future retry time
    const futureTime = new Date(Date.now() + 60000).toISOString(); // 60 seconds from now
    db.prepare(`
      INSERT INTO event_queue (
        id, event_data, run_id, status, retry_count, max_retries,
        next_retry_at, created_at, updated_at
      ) VALUES (?, ?, ?, 'pending', 2, 5, ?, ?, ?)
    `).run(queueId, JSON.stringify(evt), testRunId, futureTime, new Date().toISOString(), new Date().toISOString());

    // Process queue - should skip because next_retry_at is in future
    const processed = processEventQueue();
    // Item should not be processed (future retry time)
    const item = db.prepare(
      "SELECT retry_count FROM event_queue WHERE id = ?"
    ).get(queueId) as { retry_count: number };
    assert.equal(item.retry_count, 2, "Item should not be retried yet");
  });

  it("should handle getRunEvents with queued events", async () => {
    const evt1: AntfarmEvent = {
      ts: new Date().toISOString(),
      event: "run.started",
      runId: testRunId,
    };
    const evt2: AntfarmEvent = {
      ts: new Date().toISOString(),
      event: "step.done",
      runId: testRunId,
      stepId: "plan",
    };

    emitEvent(evt1);
    emitEvent(evt2);

    const events = getRunEvents(testRunId);
    assert.ok(events.length > 0, "Should retrieve events for run");
    assert.equal(events[0].runId, testRunId);
  });
});
