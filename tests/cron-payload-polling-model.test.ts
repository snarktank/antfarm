/**
 * Regression test: cron payload must include polling model
 *
 * Bug #121: The stale dist was using buildAgentPrompt() which produced
 * cron payloads WITHOUT a model field, causing all polling to run on
 * the agent's default model (opus) instead of the cheap polling model
 * (sonnet). This test ensures setupAgentCrons always produces payloads
 * with the correct polling model.
 */

import { describe, it, mock, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

describe("cron payload includes polling model (regression #121)", () => {
  let capturedJobs: any[];
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    capturedJobs = [];
    originalFetch = globalThis.fetch;
    // Mock fetch to capture the cron job payloads
    globalThis.fetch = mock.fn(async (_url: any, opts: any) => {
      const body = JSON.parse(opts.body);
      if (body.args?.job) {
        capturedJobs.push(body.args.job);
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true, result: { id: `job-${capturedJobs.length}` } }),
      };
    }) as any;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("setupAgentCrons passes polling model in payload, not opus", async () => {
    const { setupAgentCrons } = await import("../dist/installer/agent-cron.js");

    const fakeWorkflow = {
      id: "test-workflow",
      name: "Test",
      version: 1,
      polling: {
        model: "claude-sonnet-4-20250514",
        timeoutSeconds: 120,
      },
      agents: [
        {
          id: "agent-a",
          name: "Agent A",
          workspace: { baseDir: "agents/a", files: {} },
        },
      ],
      steps: [
        { id: "step-a", agent: "agent-a", input: "do work", expects: "RESULT" },
      ],
    };

    await setupAgentCrons(fakeWorkflow as any);

    assert.equal(capturedJobs.length, 1, "should create one cron job");
    const payload = capturedJobs[0].payload;

    // Key regression assertion: payload.model must be the polling model, NOT opus
    assert.equal(
      payload.model,
      "claude-sonnet-4-20250514",
      "cron payload must use polling model (sonnet), not the default agent model (opus)"
    );

    // Also verify the prompt uses buildPollingPrompt (contains sessions_spawn)
    assert.ok(
      payload.message.includes("sessions_spawn"),
      "polling prompt should mention sessions_spawn (two-phase design)"
    );

    // And NOT the old buildAgentPrompt style (which had the full execution logic inline)
    assert.ok(
      !payload.message.startsWith("You are an Antfarm workflow agent. Check for pending work"),
      "should NOT use old buildAgentPrompt format"
    );
  });

  it("per-agent pollingModel overrides workflow-level polling model", async () => {
    const { setupAgentCrons } = await import("../dist/installer/agent-cron.js");

    const fakeWorkflow = {
      id: "test-override",
      name: "Test Override",
      version: 1,
      polling: {
        model: "claude-sonnet-4-20250514",
        timeoutSeconds: 120,
      },
      agents: [
        {
          id: "cheap-agent",
          name: "Cheap Agent",
          pollingModel: "claude-haiku-3",
          workspace: { baseDir: "agents/cheap", files: {} },
        },
        {
          id: "default-agent",
          name: "Default Agent",
          workspace: { baseDir: "agents/default", files: {} },
        },
      ],
      steps: [
        { id: "s1", agent: "cheap-agent", input: "work", expects: "R" },
        { id: "s2", agent: "default-agent", input: "work", expects: "R" },
      ],
    };

    await setupAgentCrons(fakeWorkflow as any);

    assert.equal(capturedJobs.length, 2, "should create two cron jobs");

    // Agent with pollingModel override
    assert.equal(
      capturedJobs[0].payload.model,
      "claude-haiku-3",
      "per-agent pollingModel should override workflow-level polling model"
    );

    // Agent without override should use workflow-level polling model
    assert.equal(
      capturedJobs[1].payload.model,
      "claude-sonnet-4-20250514",
      "agent without pollingModel should use workflow-level polling model"
    );
  });

  it("cron payload includes timeoutSeconds from workflow polling config", async () => {
    const { setupAgentCrons } = await import("../dist/installer/agent-cron.js");

    const fakeWorkflow = {
      id: "test-timeout",
      name: "Test Timeout",
      version: 1,
      polling: {
        model: "claude-sonnet-4-20250514",
        timeoutSeconds: 120,
      },
      agents: [
        {
          id: "agent-t",
          name: "Agent T",
          workspace: { baseDir: "agents/t", files: {} },
        },
      ],
      steps: [
        { id: "st", agent: "agent-t", input: "work", expects: "R" },
      ],
    };

    await setupAgentCrons(fakeWorkflow as any);

    assert.equal(capturedJobs[0].payload.timeoutSeconds, 120,
      "cron payload should include timeoutSeconds from workflow polling config");
  });
});
