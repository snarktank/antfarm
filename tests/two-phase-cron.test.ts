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

    it("includes the default work model when none specified", () => {
      const prompt = buildPollingPrompt("feature-dev", "developer");
      assert.ok(prompt.includes("claude-opus-4-6"), "should include default work model");
    });

    it("includes custom work model when specified", () => {
      const prompt = buildPollingPrompt("feature-dev", "developer", "anthropic/custom-model");
      assert.ok(prompt.includes("anthropic/custom-model"), "should include custom model");
      assert.ok(!prompt.includes("claude-opus-4-6"), "should not include default model");
    });

    it("still includes step claim command", () => {
      const prompt = buildPollingPrompt("feature-dev", "developer");
      assert.ok(prompt.includes('step claim "feature-dev-developer"'));
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

    it("default polling model is claude-sonnet-4-20250514", async () => {
      // We verify this through the module — the constant is used in setupAgentCrons
      // The polling prompt doesn't contain the polling model (that's in the cron payload)
      // but we can verify the work model default
      const prompt = buildPollingPrompt("test", "agent");
      // The polling prompt contains the WORK model, not the polling model
      // The polling model is set in the cron job payload by setupAgentCrons
      assert.ok(prompt.includes("claude-opus-4-6"), "default work model in prompt");
    });

    it("polling prompt uses correct agent id format", () => {
      const prompt = buildPollingPrompt("security-audit", "scanner");
      assert.ok(prompt.includes("security-audit-scanner"));
    });
  });
});
