import { describe, it } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

const agentCronPath = path.resolve(fileURLToPath(import.meta.url), "..", "..", "dist", "installer", "agent-cron.js");
const { buildWorkPrompt } = await import(agentCronPath);

describe("buildWorkPrompt", () => {
  it("contains step complete instructions", () => {
    const prompt = buildWorkPrompt("feature-dev", "developer");
    assert.ok(prompt.includes("step complete"));
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
