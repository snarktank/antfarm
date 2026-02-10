/**
 * Tests for US-002: Verify sendRunNotification is wired into step-ops.ts
 * 
 * These are structural tests that verify the notification module is properly
 * imported and called at all pipeline completion/failure points.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const stepOpsSrc = fs.readFileSync(
  path.join(import.meta.dirname, "..", "src", "installer", "step-ops.ts"),
  "utf-8"
);

describe("notification wiring in step-ops.ts", () => {
  it("imports sendRunNotification from notifications module", () => {
    assert.ok(
      stepOpsSrc.includes('import { sendRunNotification } from "./notifications.js"'),
      "should import sendRunNotification from notifications.js"
    );
  });

  it("does not define sendRunNotification locally", () => {
    assert.ok(
      !stepOpsSrc.includes("function sendRunNotification("),
      "should not have a local sendRunNotification function"
    );
  });

  it("calls sendRunNotification in advancePipeline (run completed)", () => {
    // Find the advancePipeline function and check it calls sendRunNotification
    const advanceMatch = stepOpsSrc.match(/function advancePipeline[\s\S]*?^}/m);
    assert.ok(advanceMatch, "advancePipeline function should exist");
    assert.ok(
      advanceMatch![0].includes("sendRunNotification(runId)"),
      "advancePipeline should call sendRunNotification(runId) on completion"
    );
  });

  it("calls sendRunNotification in cleanupAbandonedSteps (run failed)", () => {
    const cleanupMatch = stepOpsSrc.match(/function cleanupAbandonedSteps[\s\S]*?^}/m);
    assert.ok(cleanupMatch, "cleanupAbandonedSteps function should exist");
    assert.ok(
      cleanupMatch![0].includes("sendRunNotification("),
      "cleanupAbandonedSteps should call sendRunNotification on failure"
    );
  });

  it("calls sendRunNotification in handleVerifyEachCompletion (run failed)", () => {
    const verifyMatch = stepOpsSrc.match(/function handleVerifyEachCompletion[\s\S]*?^}/m);
    assert.ok(verifyMatch, "handleVerifyEachCompletion function should exist");
    assert.ok(
      verifyMatch![0].includes("sendRunNotification("),
      "handleVerifyEachCompletion should call sendRunNotification on failure"
    );
  });

  it("calls sendRunNotification in failStep (run failed)", () => {
    const failMatch = stepOpsSrc.match(/function failStep[\s\S]*?^}$/m);
    assert.ok(failMatch, "failStep function should exist");
    assert.ok(
      failMatch![0].includes("sendRunNotification("),
      "failStep should call sendRunNotification on failure"
    );
  });

  it("notification calls are fire-and-forget (not awaited)", () => {
    // sendRunNotification returns a Promise but calls should not be awaited
    const awaited = stepOpsSrc.match(/await\s+sendRunNotification/);
    assert.ok(!awaited, "sendRunNotification should not be awaited (fire-and-forget)");
  });

  it("has exactly 5 sendRunNotification call sites", () => {
    const calls = stepOpsSrc.match(/sendRunNotification\(/g);
    // 1 import doesn't match this pattern; we expect 5 actual calls
    // Filter out the import line
    const callLines = stepOpsSrc.split("\n").filter(
      l => l.includes("sendRunNotification(") && !l.includes("import")
    );
    assert.equal(callLines.length, 5, "should have exactly 5 call sites");
  });
});
