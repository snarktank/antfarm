/**
 * Tests for src/installer/notifications.ts — formatRunSummary and sendRunNotification
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatRunSummary } from "../dist/installer/notifications.js";

describe("formatRunSummary", () => {
  const base = {
    workflowName: "feature-dev",
    task: "Build a widget",
    status: "completed" as const,
    createdAt: "2026-02-10T17:00:00Z",
    updatedAt: "2026-02-10T18:30:00Z",
    storyCounts: { done: 3, failed: 0, total: 3 },
  };

  it("includes workflow name", () => {
    const msg = formatRunSummary(base);
    assert.ok(msg.includes("feature-dev"));
  });

  it("includes task text", () => {
    const msg = formatRunSummary(base);
    assert.ok(msg.includes("Build a widget"));
  });

  it("includes status", () => {
    const msg = formatRunSummary(base);
    assert.ok(msg.includes("completed"));
  });

  it("includes duration", () => {
    const msg = formatRunSummary(base);
    assert.ok(msg.includes("1h 30m"));
  });

  it("includes story counts", () => {
    const msg = formatRunSummary(base);
    assert.ok(msg.includes("3 done"));
    assert.ok(msg.includes("0 failed"));
    assert.ok(msg.includes("3 total"));
  });

  it("includes PR link when provided", () => {
    const msg = formatRunSummary({ ...base, prLink: "https://github.com/org/repo/pull/42" });
    assert.ok(msg.includes("PR: https://github.com/org/repo/pull/42"));
  });

  it("omits PR line when no PR link", () => {
    const msg = formatRunSummary(base);
    assert.ok(!msg.includes("PR:"));
  });

  it("shows checkmark emoji for completed", () => {
    const msg = formatRunSummary(base);
    assert.ok(msg.includes("✅"));
  });

  it("shows X emoji for failed", () => {
    const msg = formatRunSummary({ ...base, status: "failed" });
    assert.ok(msg.includes("❌"));
  });

  it("truncates long task text", () => {
    const longTask = "A".repeat(200);
    const msg = formatRunSummary({ ...base, task: longTask });
    assert.ok(msg.includes("..."));
    // Should not contain the full 200-char string
    assert.ok(!msg.includes(longTask));
  });

  it("shows short duration for less than an hour", () => {
    const msg = formatRunSummary({
      ...base,
      createdAt: "2026-02-10T18:00:00Z",
      updatedAt: "2026-02-10T18:25:00Z",
    });
    assert.ok(msg.includes("25m"));
  });
});
