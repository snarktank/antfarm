import { describe, it, mock, beforeEach } from "node:test";
import assert from "node:assert/strict";

// We need to mock gateway-api before importing agent-cron
// Since we're using ESM, we'll test the exported functions directly
// and verify behavior through the buildPollingPrompt output + setupAgentCrons logic

import { buildPollingPrompt } from "../dist/installer/agent-cron.js";

const MODEL = "anthropic/claude-haiku-4-5:latest";

describe("two-phase-cron-setup", () => {
  describe("buildPollingPrompt with work model", () => {
    it("includes sessions_spawn instruction", () => {
      const prompt = buildPollingPrompt("feature-dev", "developer", MODEL);
      assert.ok(prompt.includes("sessions_spawn"), "should mention sessions_spawn");
    });

    it("includes the specified work model in the prompt", () => {
      const prompt = buildPollingPrompt("feature-dev", "developer", MODEL);
      assert.ok(prompt.includes(`"${MODEL}"`), "should include specified work model");
    });

    it("includes custom work model when specified", () => {
      const prompt = buildPollingPrompt("feature-dev", "developer", "anthropic/custom-model");
      assert.ok(prompt.includes("anthropic/custom-model"), "should include custom model");
    });

    it("still includes step claim command", () => {
      const prompt = buildPollingPrompt("feature-dev", "developer", MODEL);
      assert.ok(prompt.includes('step claim "feature-dev_developer"'));
    });

    it("still includes HEARTBEAT_OK for NO_WORK", () => {
      const prompt = buildPollingPrompt("feature-dev", "developer", MODEL);
      assert.ok(prompt.includes("HEARTBEAT_OK"));
    });

    it("remains under 5000 chars (includes embedded work prompt)", () => {
      const prompt = buildPollingPrompt("feature-dev", "developer", MODEL);
      assert.ok(prompt.length < 5000, `Prompt too long: ${prompt.length} chars`);
    });
  });

  describe("setupAgentCrons config resolution", () => {
    // These tests verify the exported constants and prompt builder behavior
    // that setupAgentCrons depends on

    it("work model is embedded in the polling prompt", async () => {
      // The polling prompt contains the WORK model, not the polling model
      // The polling model is set in the cron job payload by setupAgentCrons
      // workModel is now required — no more "default" fallback
      const prompt = buildPollingPrompt("test", "agent", MODEL);
      assert.ok(prompt.includes(`"${MODEL}"`), "work model in prompt");
      assert.ok(!prompt.includes('"default"'), "should never contain 'default' as model");
    });

    it("polling prompt uses correct agent id format", () => {
      const prompt = buildPollingPrompt("security-audit", "scanner", MODEL);
      assert.ok(prompt.includes("security-audit_scanner"));
    });
  });
});
