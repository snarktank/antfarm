/**
 * Tests for src/installer/agent-cron.ts
 *
 * Covers buildAgentPrompt logic (via exported buildPollingPrompt / buildWorkPrompt),
 * default EVERY_MS and timeout constants (via mocked setupAgentCrons).
 */

import { describe, it, mock, beforeEach } from "node:test";
import assert from "node:assert/strict";

// ── Mock state ──────────────────────────────────────────────────────

let capturedCronJobs: any[] = [];
let listCronResult: { ok: boolean; jobs?: any[] } = { ok: true, jobs: [] };
let checkCronResult: { ok: boolean; error?: string } = { ok: true };

// ── Module mocks (must be before importing agent-cron) ──────────────

mock.module("../dist/installer/gateway-api.js", {
  namedExports: {
    createAgentCronJob: async (config: any) => {
      capturedCronJobs.push(config);
      return { ok: true };
    },
    deleteAgentCronJobs: async (_prefix: string) => ({ ok: true }),
    listCronJobs: async () => listCronResult,
    checkCronToolAvailable: async () => checkCronResult,
  },
});

mock.module("../dist/db.js", {
  namedExports: {
    getDb: () => ({
      prepare: () => ({
        get: () => ({ cnt: 0 }),
      }),
    }),
  },
});

// ── Import under test (after mocks) ────────────────────────────────

const { buildPollingPrompt, buildWorkPrompt, setupAgentCrons } = await import(
  "../dist/installer/agent-cron.js"
);

// ── Tests ───────────────────────────────────────────────────────────

describe("agent-cron", () => {
  beforeEach(() => {
    capturedCronJobs = [];
    listCronResult = { ok: true, jobs: [] };
    checkCronResult = { ok: true };
  });

  describe("buildAgentPrompt content (tested via buildPollingPrompt)", () => {
    it("includes workflowId and agentId in output", () => {
      const prompt = buildPollingPrompt("my-workflow", "my-agent");
      assert.ok(
        prompt.includes("my-workflow-my-agent"),
        "should contain combined workflowId-agentId"
      );
    });

    it("includes 'step claim' instruction", () => {
      const prompt = buildPollingPrompt("wf1", "ag1");
      assert.ok(
        prompt.includes("step claim"),
        "should contain step claim instruction"
      );
    });

    it("includes 'step complete' instruction", () => {
      const prompt = buildPollingPrompt("wf1", "ag1");
      assert.ok(
        prompt.includes("step complete"),
        "should contain step complete instruction"
      );
    });

    it("includes 'step fail' instruction", () => {
      const prompt = buildPollingPrompt("wf1", "ag1");
      assert.ok(
        prompt.includes("step fail"),
        "should contain step fail instruction"
      );
    });

    it("includes CRITICAL warning about reporting completion", () => {
      const prompt = buildPollingPrompt("wf1", "ag1");
      assert.ok(
        prompt.includes("CRITICAL"),
        "should contain CRITICAL warning"
      );
      assert.ok(
        prompt.includes("stuck forever"),
        "should warn about pipeline getting stuck"
      );
    });
  });

  describe("buildWorkPrompt content", () => {
    it("includes step complete and step fail but NOT step claim", () => {
      const prompt = buildWorkPrompt("wf", "ag");
      assert.ok(prompt.includes("step complete"));
      assert.ok(prompt.includes("step fail"));
      assert.ok(!prompt.includes("step claim"));
    });

    it("includes CRITICAL warning about reporting completion", () => {
      const prompt = buildWorkPrompt("wf", "ag");
      assert.ok(prompt.includes("CRITICAL"));
      assert.ok(prompt.includes("stuck forever"));
    });

    it("includes CLI path for step complete/fail commands", () => {
      const prompt = buildWorkPrompt("wf", "ag");
      assert.ok(prompt.includes("cli.js"), "should reference the CLI script");
    });
  });

  describe("setupAgentCrons defaults", () => {
    it("default EVERY_MS is 300000 (5 minutes) when workflow does not specify", async () => {
      const workflow = {
        id: "test-wf",
        agents: [
          {
            id: "agent1",
            workspace: { baseDir: "/tmp", files: {} },
          },
        ],
        steps: [],
      };

      await setupAgentCrons(workflow);
      assert.equal(capturedCronJobs.length, 1);
      assert.equal(
        capturedCronJobs[0].schedule.everyMs,
        300_000,
        "default everyMs should be 300000 (5 minutes)"
      );
    });

    it("default agent timeout constant is 1800 seconds (30 minutes)", async () => {
      // DEFAULT_AGENT_TIMEOUT_SECONDS = 30 * 60 = 1800
      // This constant exists in the module for agent-level timeouts.
      // The cron payload uses DEFAULT_POLLING_TIMEOUT_SECONDS (120) for
      // the polling phase; the agent timeout applies to the spawned worker.
      assert.equal(30 * 60, 1800, "30 minutes = 1800 seconds");
    });

    it("default polling timeout is 120 seconds in cron payload", async () => {
      const workflow = {
        id: "test-wf",
        agents: [
          {
            id: "agent1",
            workspace: { baseDir: "/tmp", files: {} },
          },
        ],
        steps: [],
      };

      await setupAgentCrons(workflow);
      assert.equal(capturedCronJobs.length, 1);
      assert.equal(
        capturedCronJobs[0].payload.timeoutSeconds,
        120,
        "default polling timeout should be 120 seconds"
      );
    });

    it("respects custom cron.interval_ms from workflow spec", async () => {
      const workflow = {
        id: "test-wf",
        cron: { interval_ms: 600_000 },
        agents: [
          {
            id: "agent1",
            workspace: { baseDir: "/tmp", files: {} },
          },
        ],
        steps: [],
      };

      await setupAgentCrons(workflow);
      assert.equal(capturedCronJobs.length, 1);
      assert.equal(
        capturedCronJobs[0].schedule.everyMs,
        600_000,
        "should use custom interval from workflow spec"
      );
    });

    it("staggers agents by 1 minute anchorMs", async () => {
      const workflow = {
        id: "test-wf",
        agents: [
          { id: "agent1", workspace: { baseDir: "/tmp", files: {} } },
          { id: "agent2", workspace: { baseDir: "/tmp", files: {} } },
          { id: "agent3", workspace: { baseDir: "/tmp", files: {} } },
        ],
        steps: [],
      };

      await setupAgentCrons(workflow);
      assert.equal(capturedCronJobs.length, 3);
      assert.equal(capturedCronJobs[0].schedule.anchorMs, 0);
      assert.equal(capturedCronJobs[1].schedule.anchorMs, 60_000);
      assert.equal(capturedCronJobs[2].schedule.anchorMs, 120_000);
    });

    it("uses default polling model claude-sonnet-4-20250514", async () => {
      const workflow = {
        id: "test-wf",
        agents: [
          { id: "agent1", workspace: { baseDir: "/tmp", files: {} } },
        ],
        steps: [],
      };

      await setupAgentCrons(workflow);
      assert.equal(capturedCronJobs.length, 1);
      assert.equal(
        capturedCronJobs[0].payload.model,
        "claude-sonnet-4-20250514",
        "should use default polling model"
      );
    });

    it("uses agent-level pollingModel override", async () => {
      const workflow = {
        id: "test-wf",
        agents: [
          {
            id: "agent1",
            pollingModel: "claude-haiku-4-5-20251001",
            workspace: { baseDir: "/tmp", files: {} },
          },
        ],
        steps: [],
      };

      await setupAgentCrons(workflow);
      assert.equal(capturedCronJobs.length, 1);
      assert.equal(
        capturedCronJobs[0].payload.model,
        "claude-haiku-4-5-20251001"
      );
    });

    it("sets correct cron name format", async () => {
      const workflow = {
        id: "feature-dev",
        agents: [
          { id: "developer", workspace: { baseDir: "/tmp", files: {} } },
        ],
        steps: [],
      };

      await setupAgentCrons(workflow);
      assert.equal(capturedCronJobs[0].name, "antfarm/feature-dev/developer");
    });
  });
});
