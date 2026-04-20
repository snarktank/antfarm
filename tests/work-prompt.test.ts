import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildWorkPrompt } from "../dist/installer/agent-cron.js";

describe("buildWorkPrompt", () => {
  it("contains step complete instructions", () => {
    const prompt = buildWorkPrompt("feature-dev", "developer");
    assert.ok(prompt.includes("step complete"));
    assert.ok(prompt.includes("step complete-file"));
  });

  it("contains step fail instructions", () => {
    const prompt = buildWorkPrompt("feature-dev", "developer");
    assert.ok(prompt.includes("step fail"));
  });

  it("does NOT contain step claim command", () => {
    const prompt = buildWorkPrompt("feature-dev", "developer");
    assert.ok(!prompt.includes("step claim"));
  });

  it("includes the critical warning about reporting", () => {
    const prompt = buildWorkPrompt("feature-dev", "developer");
    assert.ok(prompt.includes("CRITICAL"));
    assert.ok(prompt.includes("stuck forever"));
  });

  it("warns agents not to use generic placeholder keys", () => {
    const prompt = buildWorkPrompt("feature-dev", "developer");
    assert.ok(prompt.includes("Do NOT use placeholder keys like CHANGES/TESTS"));
    assert.ok(prompt.includes("EXACT KEY: value output requested by this step"));
    assert.ok(prompt.includes("Do NOT use heredocs, pipes, cat, or shell substitution"));
  });

  it("does not include HEARTBEAT_OK or NO_WORK", () => {
    const prompt = buildWorkPrompt("feature-dev", "developer");
    assert.ok(!prompt.includes("HEARTBEAT_OK"));
    assert.ok(!prompt.includes("NO_WORK"));
  });

  it("works with different workflow/agent ids without errors", () => {
    const p1 = buildWorkPrompt("security-audit", "scanner");
    const p2 = buildWorkPrompt("bug-fix", "fixer");
    // Both should be valid prompts with completion instructions
    assert.ok(p1.includes("step complete"));
    assert.ok(p2.includes("step complete"));
    // Neither should contain step claim
    assert.ok(!p1.includes("step claim"));
    assert.ok(!p2.includes("step claim"));
  });
});
