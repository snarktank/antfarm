import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { logger, readRecentLogs, log, formatEntry } from "../dist/lib/logger.js";

describe("US-002: Logger caller integration", () => {
  it("logger.info returns void (not a Promise)", () => {
    const result = logger.info("caller integration test - info");
    // Synchronous API: should return undefined, not a Promise
    assert.equal(result, undefined);
    assert.equal(result instanceof Promise, false);
  });

  it("logger.warn returns void", () => {
    const result = logger.warn("caller integration test - warn");
    assert.equal(result, undefined);
  });

  it("logger.error returns void", () => {
    const result = logger.error("caller integration test - error");
    assert.equal(result, undefined);
  });

  it("logger.debug returns void", () => {
    const result = logger.debug("caller integration test - debug");
    assert.equal(result, undefined);
  });

  it("logger methods accept context without error", () => {
    // Simulates how run.ts and step-ops.ts call the logger
    assert.doesNotThrow(() => {
      logger.info("Run started: test", { workflowId: "test-wf", runId: "abc-123", stepId: "plan" });
      logger.info("Step claimed by test-agent", { runId: "abc-123", stepId: "implement" });
      logger.warn("Something happened", { runId: "abc-123" });
      logger.error("Something failed", { runId: "abc-123", stepId: "verify" });
    });
  });

  it("readRecentLogs returns a Promise", async () => {
    const result = readRecentLogs(5);
    assert.ok(result instanceof Promise, "readRecentLogs should return a Promise");
    const lines = await result;
    assert.ok(Array.isArray(lines), "resolved value should be an array");
  });

  it("log function returns void synchronously", () => {
    const result = log("info", "direct log call test");
    assert.equal(result, undefined);
  });

  it("formatEntry is exported and works", () => {
    const entry = {
      timestamp: "2026-01-01T00:00:00.000Z",
      level: "info" as const,
      message: "test message",
      runId: "12345678-abcd-1234-abcd-123456789012",
    };
    const formatted = formatEntry(entry);
    assert.ok(formatted.includes("[INFO]"));
    assert.ok(formatted.includes("[12345678]"));
    assert.ok(formatted.includes("test message"));
  });
});
