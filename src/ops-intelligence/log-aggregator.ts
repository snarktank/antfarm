/**
 * Event log aggregator for ops intelligence analysis
 * Reads and aggregates antfarm events and workflow logs for failure pattern analysis
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import readline from "node:readline";
import type {
  RawEvent,
  AggregatedEvent,
  FailureContext,
  AggregateableEventType,
} from "./types.js";

const ANTFARM_DIR = path.join(os.homedir(), ".openclaw", "antfarm");
const EVENTS_FILE = path.join(ANTFARM_DIR, "events.jsonl");
const WORKFLOW_LOG_FILE = path.join(ANTFARM_DIR, "logs", "workflow.log");

/**
 * Configuration for filtering log analysis
 */
export interface LogFilterOptions {
  /**
   * Only analyze events from the last N days (ISO format date or number of days)
   */
  fromDate?: string | Date;
  /**
   * Only analyze events up to this date
   */
  toDate?: string | Date;
  /**
   * Only analyze these specific event types
   */
  eventTypes?: AggregateableEventType[];
  /**
   * Only analyze these specific workflows
   */
  workflows?: string[];
  /**
   * Maximum number of runs to analyze (most recent)
   */
  maxRuns?: number;
}

/**
 * Result from aggregating all logs
 */
export interface AggregationResult {
  aggregatedEvents: AggregatedEvent[];
  totalFailures: number;
  analysisStartTime: string;
  analysisEndTime: string;
  eventsProcessed: number;
  errorsSkipped: number;
  timeRange: {
    earliest: string;
    latest: string;
  };
}

/**
 * Reads events.jsonl and returns RawEvent objects in chronological order
 * Handles corrupted/partial events gracefully by skipping with warnings
 */
export async function getEventStream(
  options: LogFilterOptions = {}
): Promise<RawEvent[]> {
  const events: RawEvent[] = [];
  let errorsSkipped = 0;

  if (!fs.existsSync(EVENTS_FILE)) {
    console.warn(`Events file not found: ${EVENTS_FILE}`);
    return [];
  }

  const fileStream = fs.createReadStream(EVENTS_FILE);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (!line.trim()) continue;

    try {
      const event = JSON.parse(line) as RawEvent;

      // Apply filters
      if (!shouldIncludeEvent(event, options)) {
        continue;
      }

      events.push(event);
    } catch (err) {
      errorsSkipped++;
      console.warn(`Skipped corrupted event: ${line.substring(0, 100)}...`);
    }
  }

  // Return in chronological order (oldest first)
  return events.sort(
    (a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime()
  );
}

/**
 * Aggregates events by type (run.failed, step.failed, step.timeout, story.failed)
 * Counts occurrences and tracks first/last occurrence times
 */
export function aggregateEventsByType(
  events: RawEvent[],
  options: LogFilterOptions = {}
): AggregatedEvent[] {
  const aggregated = new Map<AggregateableEventType, AggregatedEvent>();
  const failureEventTypes: AggregateableEventType[] = [
    "run.failed",
    "step.failed",
    "step.timeout",
    "story.failed",
  ];

  for (const event of events) {
    const eventType = event.event as AggregateableEventType;

    // Only process failure events
    if (!failureEventTypes.includes(eventType)) {
      continue;
    }

    // Apply event type filter if specified
    if (options.eventTypes && !options.eventTypes.includes(eventType)) {
      continue;
    }

    const context = extractFailureContext(event);

    if (!aggregated.has(eventType)) {
      aggregated.set(eventType, {
        eventType,
        count: 0,
        firstOccurrence: event.ts,
        lastOccurrence: event.ts,
        occurrences: [],
      });
    }

    const agg = aggregated.get(eventType)!;
    agg.count++;
    // Only update lastOccurrence (events are in chronological order)
    agg.lastOccurrence = event.ts;
    agg.occurrences.push(context);
  }

  return Array.from(aggregated.values());
}

/**
 * Extracts structured failure context from an event
 * Returns runId, stepId, workflowId, timestamp, detail, agentId
 */
export function extractFailureContext(event: RawEvent): FailureContext {
  return {
    runId: event.runId,
    stepId: event.stepId,
    workflowId: event.workflowId,
    agentId: event.agentId,
    timestamp: event.ts,
    detail: event.detail,
  };
}

/**
 * Parses workflow.log for error entries
 * Returns events that indicate failures or issues
 */
export async function parseWorkflowLog(
  options: LogFilterOptions = {}
): Promise<RawEvent[]> {
  const events: RawEvent[] = [];

  if (!fs.existsSync(WORKFLOW_LOG_FILE)) {
    console.warn(`Workflow log file not found: ${WORKFLOW_LOG_FILE}`);
    return [];
  }

  const fileStream = fs.createReadStream(WORKFLOW_LOG_FILE);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (!line.trim()) continue;

    try {
      // Parse log lines that contain error information
      // Format: YYYY-MM-DDTHH:MM:SS.sssZ [LEVEL] [workflow] [run-id] [step] message
      const match = line.match(
        /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)\s+\[([A-Z]+)\]\s+\[([^\]]+)\]\s+\[([^\]]+)\]\s+\[([^\]]+)\]\s+(.*)/
      );

      if (!match) continue;

      const [, timestamp, level, workflow, runId, step, message] = match;

      // Only include ERROR level logs
      if (level !== "ERROR") continue;

      const event: RawEvent = {
        ts: timestamp,
        event: "workflow.error",
        runId,
        workflowId: workflow,
        stepId: step,
        detail: message,
      };

      // Apply filters
      if (!shouldIncludeEvent(event, options)) {
        continue;
      }

      events.push(event);
    } catch (err) {
      // Skip lines that can't be parsed
      continue;
    }
  }

  return events;
}

/**
 * Aggregates all log sources (events.jsonl and workflow.log)
 * Combines failure events into a single analysis result
 */
export async function aggregateAllLogs(
  options: LogFilterOptions = {}
): Promise<AggregationResult> {
  const analysisStartTime = new Date().toISOString();

  // Read events from both sources
  const [eventStreamEvents, workflowLogEvents] = await Promise.all([
    getEventStream(options),
    parseWorkflowLog(options),
  ]);

  const allEvents = [...eventStreamEvents, ...workflowLogEvents];

  // Sort by timestamp
  allEvents.sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());

  // Aggregate by type
  const aggregatedEvents = aggregateEventsByType(allEvents, options);

  // Calculate total failures
  const totalFailures = aggregatedEvents.reduce(
    (sum, agg) => sum + agg.count,
    0
  );

  // Find time range
  const timestamps = allEvents.map((e) => new Date(e.ts).getTime());
  const timeRange = {
    earliest: allEvents.length > 0 ? allEvents[0].ts : new Date().toISOString(),
    latest: allEvents.length > 0 ? allEvents[allEvents.length - 1].ts : new Date().toISOString(),
  };

  const analysisEndTime = new Date().toISOString();

  return {
    aggregatedEvents,
    totalFailures,
    analysisStartTime,
    analysisEndTime,
    eventsProcessed: allEvents.length,
    errorsSkipped: 0,
    timeRange,
  };
}

/**
 * Helper: Determines if an event should be included based on filters
 */
function shouldIncludeEvent(event: RawEvent, options: LogFilterOptions): boolean {
  // Filter by date range
  if (options.fromDate || options.toDate) {
    const eventDate = new Date(event.ts).getTime();
    
    if (options.fromDate) {
      const fromDate =
        options.fromDate instanceof Date
          ? options.fromDate.getTime()
          : new Date(options.fromDate).getTime();
      if (eventDate < fromDate) return false;
    }

    if (options.toDate) {
      const toDate =
        options.toDate instanceof Date
          ? options.toDate.getTime()
          : new Date(options.toDate).getTime();
      if (eventDate > toDate) return false;
    }
  }

  // Filter by workflows
  if (options.workflows && event.workflowId) {
    if (!options.workflows.includes(event.workflowId)) {
      return false;
    }
  }

  return true;
}

/**
 * Helper: Convert days to milliseconds
 */
function daysToMs(days: number): number {
  return days * 24 * 60 * 60 * 1000;
}
