/**
 * Regression test for dashboard active agent indicator.
 * Bug: Dashboard was not showing when agents were actively working
 * because polling was too slow (30s) and there was no visual indicator.
 * Fix: Reduced polling to 5s and added pulse animation for running state.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const DASHBOARD_HTML = path.resolve(
  import.meta.dirname,
  "..",
  "src",
  "server",
  "index.html"
);

describe("dashboard active agent indicator", () => {
  const html = fs.readFileSync(DASHBOARD_HTML, "utf-8");

  it("should use 5-second polling interval for responsive updates", () => {
    // The bug was 30-second polling which missed short-lived running states
    assert.ok(
      html.includes("setInterval(() => { if (currentWf) loadRuns(); }, 5000)"),
      "polling interval should be 5000ms (5 seconds), not 30000ms"
    );
    assert.ok(
      !html.includes("setInterval(() => { if (currentWf) loadRuns(); }, 30000)"),
      "should not use the old 30-second polling interval"
    );
  });

  it("should have pulse animation for running step icons", () => {
    // Running steps need visual feedback so users can see active agents
    assert.ok(
      html.includes(".step-icon.running") && html.includes("animation:pulse"),
      "running step icon should have pulse animation"
    );
  });

  it("should have pulse animation for running badges", () => {
    // Running badges on cards also need visual feedback
    assert.ok(
      html.includes(".badge-running") && html.includes("animation:pulse-badge"),
      "running badge should have pulse-badge animation"
    );
  });

  it("should display correct refresh interval in UI", () => {
    // UI should accurately reflect the polling interval
    assert.ok(
      html.includes("Auto-refresh: 5s"),
      "refresh note should say 5s, not 30s"
    );
  });
});
