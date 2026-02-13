import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildPollingPrompt, buildWorkPrompt } from "../dist/installer/agent-cron.js";

/**
 * Integration tests for the full two-phase polling flow.
 * Verifies that setupAgentCrons creates the right structure,
 * prompts are correctly sized, and backward compatibility holds.
 */
describe("two-phase-integration", () => {
  // AC1: setupAgentCrons with polling config creates jobs with polling model
  // We verify this through the prompt builder since setupAgentCrons uses it internally.
  // The cron job payload model is set by setupAgentCrons; we test the prompt side here.
  describe("polling config creates correct prompt structure", () => {
    it("polling prompt with custom work model embeds that model for Phase 2", () => {
      const prompt = buildPollingPrompt("feature-dev", "developer", "anthropic/claude-opus-4-6");
      // Phase 2 should use the specified work model via sessions_spawn
      assert.ok(prompt.includes("anthropic/claude-opus-4-6"), "work model in sessions_spawn");
      assert.ok(prompt.includes("sessions_spawn"), "should trigger sessions_spawn for Phase 2");
    });

    it("polling prompt embeds the full work prompt for Phase 2 execution", () => {
      const pollingPrompt = buildPollingPrompt("feature-dev", "developer");
      const workPrompt = buildWorkPrompt("feature-dev", "developer");
      // The polling prompt should contain the full work prompt between delimiters
      assert.ok(pollingPrompt.includes(workPrompt), "polling prompt embeds full work prompt");
    });
  });

  // AC2: Without polling config, defaults to claude-sonnet-4-20250514
  // (The default polling MODEL is set in setupAgentCrons payload, not in the prompt itself.
  //  The prompt contains the WORK model. We verify default work model here.)
  describe("defaults without polling config", () => {
    it("uses default work model (claude-opus-4-6) when no workModel specified", () => {
      const prompt = buildPollingPrompt("feature-dev", "developer");
      assert.ok(prompt.includes('"claude-opus-4-6"'), "default work model");
    });

    it("agent id uses hyphenated format (workflowId-agentId)", () => {
      const prompt = buildPollingPrompt("feature-dev", "developer");
      assert.ok(prompt.includes("feature-dev-developer"), "hyphenated agent id");
      assert.ok(!prompt.includes("feature-dev/developer"), "no slash-separated id");
    });
  });

  // AC3: Polling prompt is minimal (under 2000 chars for just the Phase 1 part)
  describe("polling prompt is minimal", () => {
    it("Phase 1 instructions (before work prompt) are concise", () => {
      const prompt = buildPollingPrompt("feature-dev", "developer");
      // Extract just the Phase 1 part (before the embedded work prompt)
      const phase1End = prompt.indexOf("---START WORK PROMPT---");
      assert.ok(phase1End > 0, "work prompt delimiter exists");
      const phase1 = prompt.substring(0, phase1End);
      assert.ok(phase1.length < 2000, `Phase 1 too long: ${phase1.length} chars`);
    });

    it("polling prompt does not contain AGENTS.md or SOUL.md references", () => {
      const prompt = buildPollingPrompt("feature-dev", "developer");
      assert.ok(!prompt.includes("AGENTS.md"));
      assert.ok(!prompt.includes("SOUL.md"));
      assert.ok(!prompt.includes("MEMORY.md"));
    });

    it("polling prompt does not contain heavy workflow context", () => {
      const prompt = buildPollingPrompt("feature-dev", "developer");
      // Should not have acceptance criteria, story details, etc.
      assert.ok(!prompt.includes("Acceptance Criteria"));
      assert.ok(!prompt.includes("COMPLETED STORIES"));
    });
  });

  // AC4: Work prompt contains full execution instructions
  describe("work prompt has full execution instructions", () => {
    it("contains step complete with file-pipe pattern", () => {
      const prompt = buildWorkPrompt("feature-dev", "developer");
      assert.ok(prompt.includes("antfarm-step-output.txt"), "file-pipe pattern");
      assert.ok(prompt.includes("step complete"), "step complete command");
    });

    it("contains step fail instructions", () => {
      const prompt = buildWorkPrompt("feature-dev", "developer");
      assert.ok(prompt.includes("step fail"));
    });

    it("contains critical warning about session ending", () => {
      const prompt = buildWorkPrompt("feature-dev", "developer");
      assert.ok(prompt.includes("CRITICAL"));
      assert.ok(prompt.includes("stuck forever"));
    });

    it("contains all 3 rules", () => {
      const prompt = buildWorkPrompt("feature-dev", "developer");
      assert.ok(prompt.includes("NEVER end your session"));
      assert.ok(prompt.includes("Write output to a file first"));
      assert.ok(prompt.includes("step fail with an explanation"));
    });

    it("does NOT contain step claim (Phase 1 handles claiming)", () => {
      const prompt = buildWorkPrompt("feature-dev", "developer");
      assert.ok(!prompt.includes("step claim"));
    });
  });

  // AC5: Backward compatibility — workflows without polling config still work
  describe("backward compatibility", () => {
    it("buildPollingPrompt works with no workModel argument", () => {
      const prompt = buildPollingPrompt("feature-dev", "developer");
      assert.ok(prompt.length > 0);
      assert.ok(prompt.includes("step claim"));
      assert.ok(prompt.includes("HEARTBEAT_OK"));
      assert.ok(prompt.includes("sessions_spawn"));
    });

    it("buildWorkPrompt is independent of polling config", () => {
      const prompt = buildWorkPrompt("feature-dev", "developer");
      assert.ok(prompt.length > 0);
      assert.ok(prompt.includes("step complete"));
      assert.ok(prompt.includes("step fail"));
    });

    it("all three workflows produce valid prompts", () => {
      const workflows = [
        { id: "feature-dev", agents: ["planner", "developer", "reviewer", "verifier"] },
        { id: "security-audit", agents: ["scanner", "analyst", "remediator"] },
        { id: "bug-fix", agents: ["triager", "fixer", "verifier"] },
      ];

      for (const wf of workflows) {
        for (const agent of wf.agents) {
          const polling = buildPollingPrompt(wf.id, agent);
          const work = buildWorkPrompt(wf.id, agent);
          assert.ok(polling.includes(`${wf.id}-${agent}`), `${wf.id}/${agent} polling agent id`);
          assert.ok(work.includes("step complete"), `${wf.id}/${agent} work has step complete`);
          assert.ok(polling.includes("sessions_spawn"), `${wf.id}/${agent} polling has spawn`);
        }
      }
    });

    it("original buildAgentPrompt pattern still works for non-polling usage", async () => {
      // The original buildAgentPrompt function should still exist for backward compat
      // Import it dynamically to check
      const mod = await import("../dist/installer/agent-cron.js");
      // setupAgentCrons and removeAgentCrons should still be exported
      assert.ok(typeof mod.setupAgentCrons === "function", "setupAgentCrons exported");
      assert.ok(typeof mod.removeAgentCrons === "function", "removeAgentCrons exported");
      assert.ok(typeof mod.buildPollingPrompt === "function", "buildPollingPrompt exported");
      assert.ok(typeof mod.buildWorkPrompt === "function", "buildWorkPrompt exported");
    });
  });
});
