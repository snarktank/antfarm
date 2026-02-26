import { describe, it, mock, beforeEach } from "node:test";
import assert from "node:assert/strict";

// We need to mock gateway-api before importing agent-cron
// Since we're using ESM, we'll test the exported functions directly
// and verify behavior through the buildPollingPrompt output + setupAgentCrons logic

import { buildPollingPrompt } from "../dist/installer/agent-cron.js";

describe("two-phase-cron-setup", () => {
  describe("buildPollingPrompt with work model", () => {
    it("includes sessions_spawn instruction", () => {
      const prompt = buildPollingPrompt("feature-dev", "developer");
      assert.ok(prompt.includes("sessions_spawn"), "should mention sessions_spawn");
    });

    it("omits work model when none specified", () => {
      const prompt = buildPollingPrompt("feature-dev", "developer");
      assert.ok(!prompt.includes("- model:"), "should omit work model when unspecified");
    });

    it("includes custom work model when specified", () => {
      const prompt = buildPollingPrompt("feature-dev", "developer", "anthropic/custom-model");
      assert.ok(prompt.includes("anthropic/custom-model"), "should include custom model");
    });

    it("regression: does not emit openai-codex/default alias when model is omitted", () => {
      const prompt = buildPollingPrompt("bug-fix", "fixer");
      assert.ok(!prompt.includes("openai-codex/default"), "should never hardcode provider default alias");
      assert.ok(!prompt.includes('"default"'), "should not hardcode literal default model");
    });

    it("still includes step claim command", () => {
      const prompt = buildPollingPrompt("feature-dev", "developer");
      assert.ok(prompt.includes('step claim "feature-dev_developer"'));
    });

    it("still includes HEARTBEAT_OK for NO_WORK", () => {
      const prompt = buildPollingPrompt("feature-dev", "developer");
      assert.ok(prompt.includes("HEARTBEAT_OK"));
    });

    it("remains under 5000 chars (includes embedded work prompt)", () => {
      const prompt = buildPollingPrompt("feature-dev", "developer");
      assert.ok(prompt.length < 5000, `Prompt too long: ${prompt.length} chars`);
    });
  });

  describe("setupAgentCrons config resolution", () => {
    // These tests verify the exported constants and prompt builder behavior
    // that setupAgentCrons depends on

    it("work model is optional when unspecified", async () => {
      const prompt = buildPollingPrompt("test", "agent");
      assert.ok(!prompt.includes("- model:"), "no implicit default work model in prompt");
    });

    it("polling prompt uses correct agent id format", () => {
      const prompt = buildPollingPrompt("security-audit", "scanner");
      assert.ok(prompt.includes("security-audit_scanner"));
    });
  });
});
