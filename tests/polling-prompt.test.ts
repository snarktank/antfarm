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

  it("accepts kimi-* models as workModel parameter", () => {
    const prompt = buildPollingPrompt("feature-dev", "developer", "kimi-k2");
    assert.ok(prompt.includes('"kimi-k2"'), "should specify kimi-k2 model for spawn");
  });

  it("accepts kimi-code model identifier", () => {
    const prompt = buildPollingPrompt("feature-dev", "developer", "kimi-code");
    assert.ok(prompt.includes('"kimi-code"'), "should specify kimi-code model for spawn");
  });

  it("properly escapes model identifiers with slashes like kimi-code/kimi-for-coding", () => {
    const prompt = buildPollingPrompt("feature-dev", "developer", "kimi-code/kimi-for-coding");
    assert.ok(prompt.includes('"kimi-code/kimi-for-coding"'), "should properly escape model with slash");
    // Verify the model is properly quoted so the slash doesn't break anything
    const modelLine = prompt.split('\n').find(line => line.includes('model:'));
    assert.ok(modelLine, "should have a model line");
    assert.ok(modelLine!.includes('"kimi-code/kimi-for-coding"'), "model value should be quoted");
  });

  it("accepts kimi-for-coding model identifier", () => {
    const prompt = buildPollingPrompt("feature-dev", "developer", "kimi-for-coding");
    assert.ok(prompt.includes('"kimi-for-coding"'), "should specify kimi-for-coding model for spawn");
  });
});
