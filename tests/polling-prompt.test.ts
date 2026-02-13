import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildPollingPrompt } from "../dist/installer/agent-cron.js";

describe("buildPollingPrompt", () => {
  it("contains the step claim command with correct agent id", () => {
    const prompt = buildPollingPrompt("feature-dev", "developer");
    assert.ok(prompt.includes('step claim "feature-dev-developer"'));
  });

  it("instructs to reply HEARTBEAT_OK on NO_WORK", () => {
    const prompt = buildPollingPrompt("feature-dev", "developer");
    assert.ok(prompt.includes("HEARTBEAT_OK"));
    assert.ok(prompt.includes("NO_WORK"));
  });

  it("does NOT contain workspace/AGENTS.md/SOUL.md content", () => {
    const prompt = buildPollingPrompt("feature-dev", "developer");
    assert.ok(!prompt.includes("AGENTS.md"));
    assert.ok(!prompt.includes("SOUL.md"));
  });

  it("works with different workflow/agent ids", () => {
    const prompt = buildPollingPrompt("bug-fix", "fixer");
    assert.ok(prompt.includes('step claim "bug-fix-fixer"'));
  });

  it("includes instructions for parsing step claim JSON output", () => {
    const prompt = buildPollingPrompt("feature-dev", "developer");
    assert.ok(prompt.includes("stepId"), "should mention stepId field");
    assert.ok(prompt.includes("runId"), "should mention runId field");
    assert.ok(prompt.includes("input"), "should mention input field");
    assert.ok(prompt.includes("parse"), "should instruct to parse JSON");
  });

  it("includes sessions_spawn invocation with correct agentId", () => {
    const prompt = buildPollingPrompt("feature-dev", "developer");
    assert.ok(prompt.includes("sessions_spawn"), "should mention sessions_spawn");
    assert.ok(prompt.includes('"feature-dev-developer"'), "should include full agentId");
  });

  it("includes the full work prompt with step complete/fail instructions", () => {
    const prompt = buildPollingPrompt("feature-dev", "developer");
    assert.ok(prompt.includes("step complete"), "should include step complete from work prompt");
    assert.ok(prompt.includes("step fail"), "should include step fail from work prompt");
    assert.ok(prompt.includes("---START WORK PROMPT---"), "should delimit work prompt");
    assert.ok(prompt.includes("---END WORK PROMPT---"), "should delimit work prompt");
  });

  it("specifies the full model for the spawned task", () => {
    const prompt = buildPollingPrompt("feature-dev", "developer", "claude-opus-4-6");
    assert.ok(prompt.includes('"claude-opus-4-6"'), "should specify model for spawn");
  });

  it("uses default model when workModel not provided", () => {
    const prompt = buildPollingPrompt("feature-dev", "developer");
    assert.ok(prompt.includes('"claude-opus-4-6"'), "should use default model");
  });

  it("instructs to include claimed JSON in spawned task", () => {
    const prompt = buildPollingPrompt("feature-dev", "developer");
    assert.ok(prompt.includes("CLAIMED STEP JSON"), "should instruct to append claimed JSON");
  });
});
