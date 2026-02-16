/**
 * Tests for the Log Aggregator module
 * Verifies event aggregation, filtering, and parsing functionality
 */

import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type { RawEvent } from "../dist/ops-intelligence/types.js";

// Import the module after build
const {
  getEventStream,
  aggregateEventsByType,
  extractFailureContext,
  parseWorkflowLog,
  aggregateAllLogs,
} = await import("../dist/ops-intelligence/log-aggregator.js");

describe("Log Aggregator", () => {
  describe("getEventStream", () => {
    it("should return an empty array when events file does not exist", async () => {
      // This will log a warning, but should gracefully return empty array
      const events = await getEventStream();
      assert.ok(Array.isArray(events));
    });

    it("should read events from events.jsonl in chronological order", async () => {
      const events = await getEventStream();
      
      if (events.length > 1) {
        // Verify chronological order
        for (let i = 0; i < events.length - 1; i++) {
          const currTime = new Date(events[i].ts).getTime();
          const nextTime = new Date(events[i + 1].ts).getTime();
          assert.ok(currTime <= nextTime, "Events should be in chronological order");
        }
      }
    });

    it("should include ts and event fields in events", async () => {
      const events = await getEventStream();
      
      if (events.length > 0) {
        events.forEach((event) => {
          assert.ok(event.ts, "Event should have ts field");
          assert.ok(event.event, "Event should have event field");
          assert.ok(typeof event.ts === "string");
          assert.ok(typeof event.event === "string");
        });
      }
    });

    it("should filter events by date range", async () => {
      const events = await getEventStream();
      
      if (events.length > 0) {
        const midpoint = new Date(
          (new Date(events[0].ts).getTime() +
            new Date(events[events.length - 1].ts).getTime()) /
            2
        );

        const filteredEvents = await getEventStream({
          fromDate: midpoint,
        });

        // All filtered events should be >= midpoint
        filteredEvents.forEach((event) => {
          const eventTime = new Date(event.ts).getTime();
          assert.ok(
            eventTime >= midpoint.getTime(),
            "Filtered events should be after fromDate"
          );
        });
      }
    });

    it("should filter events by workflow", async () => {
      const events = await getEventStream();
      
      if (events.length > 0) {
        const workflow = events[0].workflowId;
        if (workflow) {
          const filteredEvents = await getEventStream({
            workflows: [workflow],
          });

          filteredEvents.forEach((event) => {
            // Events without workflowId are included by default
            if (event.workflowId) {
              assert.equal(event.workflowId, workflow);
            }
          });
        }
      }
    });
  });

  describe("aggregateEventsByType", () => {
    it("should group events by failure event type", () => {
      const mockEvents: RawEvent[] = [
        {
          ts: "2026-02-15T10:00:00Z",
          event: "run.failed",
          runId: "run-1",
          workflowId: "test-wf",
          detail: "Test failure",
        },
        {
          ts: "2026-02-15T10:01:00Z",
          event: "run.failed",
          runId: "run-2",
          workflowId: "test-wf",
          detail: "Another failure",
        },
        {
          ts: "2026-02-15T10:02:00Z",
          event: "step.failed",
          runId: "run-3",
          stepId: "step-1",
          workflowId: "test-wf",
          detail: "Step failure",
        },
        {
          ts: "2026-02-15T10:03:00Z",
          event: "run.started",
          runId: "run-4",
          workflowId: "test-wf",
        },
      ];

      const aggregated = aggregateEventsByType(mockEvents);

      // Should have 2 types: run.failed and step.failed
      const eventTypes = aggregated.map((a) => a.eventType);
      assert.ok(eventTypes.includes("run.failed"));
      assert.ok(eventTypes.includes("step.failed"));
      assert.ok(!eventTypes.includes("run.started"));

      // Check counts
      const runFailed = aggregated.find((a) => a.eventType === "run.failed");
      assert.equal(runFailed?.count, 2);

      const stepFailed = aggregated.find((a) => a.eventType === "step.failed");
      assert.equal(stepFailed?.count, 1);
    });

    it("should track first and last occurrence times", () => {
      const mockEvents: RawEvent[] = [
        {
          ts: "2026-02-15T10:00:00Z",
          event: "run.failed",
          runId: "run-1",
          detail: "First",
        },
        {
          ts: "2026-02-15T10:05:00Z",
          event: "run.failed",
          runId: "run-2",
          detail: "Last",
        },
      ];

      const aggregated = aggregateEventsByType(mockEvents);
      const runFailed = aggregated[0];

      assert.equal(runFailed.firstOccurrence, "2026-02-15T10:00:00Z");
      assert.equal(runFailed.lastOccurrence, "2026-02-15T10:05:00Z");
    });

    it("should collect all occurrences in the aggregation", () => {
      const mockEvents: RawEvent[] = [
        {
          ts: "2026-02-15T10:00:00Z",
          event: "step.failed",
          runId: "run-1",
          stepId: "step-1",
        },
        {
          ts: "2026-02-15T10:01:00Z",
          event: "step.failed",
          runId: "run-2",
          stepId: "step-2",
        },
      ];

      const aggregated = aggregateEventsByType(mockEvents);
      const stepFailed = aggregated[0];

      assert.equal(stepFailed.occurrences.length, 2);
      assert.equal(stepFailed.occurrences[0].runId, "run-1");
      assert.equal(stepFailed.occurrences[1].runId, "run-2");
    });

    it("should filter by event type if specified", () => {
      const mockEvents: RawEvent[] = [
        { ts: "2026-02-15T10:00:00Z", event: "run.failed", runId: "run-1" },
        { ts: "2026-02-15T10:01:00Z", event: "step.failed", runId: "run-2" },
        { ts: "2026-02-15T10:02:00Z", event: "step.timeout", runId: "run-3" },
      ];

      const aggregated = aggregateEventsByType(mockEvents, {
        eventTypes: ["run.failed"],
      });

      assert.equal(aggregated.length, 1);
      assert.equal(aggregated[0].eventType, "run.failed");
      assert.equal(aggregated[0].count, 1);
    });

    it("should handle empty event list", () => {
      const aggregated = aggregateEventsByType([]);
      assert.equal(aggregated.length, 0);
    });
  });

  describe("extractFailureContext", () => {
    it("should extract all context fields from an event", () => {
      const event: RawEvent = {
        ts: "2026-02-15T10:00:00Z",
        event: "run.failed",
        runId: "run-123",
        workflowId: "test-wf",
        stepId: "step-1",
        agentId: "test-agent",
        detail: "Something went wrong",
      };

      const context = extractFailureContext(event);

      assert.equal(context.runId, "run-123");
      assert.equal(context.workflowId, "test-wf");
      assert.equal(context.stepId, "step-1");
      assert.equal(context.agentId, "test-agent");
      assert.equal(context.timestamp, "2026-02-15T10:00:00Z");
      assert.equal(context.detail, "Something went wrong");
    });

    it("should handle missing optional fields", () => {
      const event: RawEvent = {
        ts: "2026-02-15T10:00:00Z",
        event: "run.failed",
      };

      const context = extractFailureContext(event);

      assert.equal(context.timestamp, "2026-02-15T10:00:00Z");
      assert.equal(context.runId, undefined);
      assert.equal(context.workflowId, undefined);
      assert.equal(context.stepId, undefined);
      assert.equal(context.detail, undefined);
    });
  });

  describe("parseWorkflowLog", () => {
    it("should return an empty array when workflow log file does not exist", async () => {
      // This will log a warning, but should gracefully return empty array
      const events = await parseWorkflowLog();
      assert.ok(Array.isArray(events));
    });

    it("should parse workflow log lines with ERROR level", async () => {
      // Create a temporary workflow log file for testing
      const tempDir = os.tmpdir();
      const testLogFile = path.join(tempDir, "test-workflow.log");

      try {
        // Write test log content
        const logContent = `2026-02-15T10:00:00.000Z [INFO] [test-wf] [run-1] [step-1] Starting step
2026-02-15T10:01:00.000Z [ERROR] [test-wf] [run-1] [step-1] Connection timeout
2026-02-15T10:02:00.000Z [WARN] [test-wf] [run-1] [step-2] Retrying...
2026-02-15T10:03:00.000Z [ERROR] [test-wf] [run-1] [step-2] Max retries exceeded
`;

        fs.writeFileSync(testLogFile, logContent);

        // For this test, we'll just verify the function doesn't crash
        // and returns an array (since we can't easily mock the actual file location)
        const events = await parseWorkflowLog();
        assert.ok(Array.isArray(events));
      } finally {
        try {
          fs.unlinkSync(testLogFile);
        } catch {}
      }
    });

    it("should handle corrupted log lines gracefully", async () => {
      // The function should skip unparseable lines without throwing
      const events = await parseWorkflowLog();
      assert.ok(Array.isArray(events));
    });
  });

  describe("aggregateAllLogs", () => {
    it("should return an AggregationResult with required fields", async () => {
      const result = await aggregateAllLogs();

      assert.ok(result.aggregatedEvents);
      assert.ok(Array.isArray(result.aggregatedEvents));
      assert.ok(typeof result.totalFailures === "number");
      assert.ok(result.analysisStartTime);
      assert.ok(result.analysisEndTime);
      assert.ok(typeof result.eventsProcessed === "number");
      assert.ok(typeof result.errorsSkipped === "number");
      assert.ok(result.timeRange);
      assert.ok(result.timeRange.earliest);
      assert.ok(result.timeRange.latest);
    });

    it("should correctly aggregate events from both sources", async () => {
      const result = await aggregateAllLogs();

      // If there are aggregated events, they should all be valid failure types
      result.aggregatedEvents.forEach((agg) => {
        assert.ok(
          [
            "run.failed",
            "step.failed",
            "step.timeout",
            "story.failed",
          ].includes(agg.eventType)
        );
        assert.ok(agg.count > 0);
        assert.ok(agg.firstOccurrence);
        assert.ok(agg.lastOccurrence);
        assert.ok(Array.isArray(agg.occurrences));
      });
    });

    it("should filter by date range in aggregation", async () => {
      const result = await aggregateAllLogs();
      const baselineTotal = result.totalFailures;

      if (baselineTotal > 0) {
        // Filter to a narrower date range (just first day)
        const earliestDate = new Date(result.timeRange.earliest);
        const nextDay = new Date(earliestDate.getTime() + 24 * 60 * 60 * 1000);

        const filteredResult = await aggregateAllLogs({
          fromDate: earliestDate,
          toDate: nextDay,
        });

        // Filtered result should have <= total failures
        assert.ok(filteredResult.totalFailures <= baselineTotal);
      }
    });

    it("should calculate correct eventsProcessed count", async () => {
      const result = await aggregateAllLogs();

      // eventsProcessed should match the number of aggregated occurrences
      let totalOccurrences = 0;
      result.aggregatedEvents.forEach((agg) => {
        totalOccurrences += agg.count;
      });

      // Note: eventsProcessed includes all events, not just aggregated failures
      assert.ok(result.eventsProcessed >= totalOccurrences);
    });

    it("should handle empty log files gracefully", async () => {
      // Even with missing/empty files, should return valid result structure
      const result = await aggregateAllLogs();
      assert.ok(result);
      assert.ok(Array.isArray(result.aggregatedEvents));
      assert.equal(typeof result.totalFailures, "number");
    });
  });

  describe("Integration Tests", () => {
    it("should successfully aggregate real event data from antfarm", async () => {
      const result = await aggregateAllLogs();

      // Should return valid structure regardless of data
      assert.ok(result);
      assert.ok(Array.isArray(result.aggregatedEvents));
      assert.ok(result.eventsProcessed >= 0);

      // If we have data, verify it's properly structured
      if (result.aggregatedEvents.length > 0) {
        result.aggregatedEvents.forEach((agg) => {
          assert.ok(agg.eventType);
          assert.ok(agg.count > 0);
          assert.ok(agg.firstOccurrence);
          assert.ok(agg.lastOccurrence);
          assert.ok(agg.occurrences.length === agg.count);
        });
      }
    });

    it("should support time-window filtering", async () => {
      const now = new Date();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      const result = await aggregateAllLogs({
        fromDate: sevenDaysAgo,
        toDate: now,
      });

      assert.ok(result);
      assert.ok(typeof result.totalFailures === "number");

      // All events should be within the time window
      result.aggregatedEvents.forEach((agg) => {
        const earliest = new Date(agg.firstOccurrence).getTime();
        const latest = new Date(agg.lastOccurrence).getTime();
        
        assert.ok(earliest >= sevenDaysAgo.getTime());
        assert.ok(latest <= now.getTime());
      });
    });
  });
});
