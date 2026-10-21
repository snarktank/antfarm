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

  for (const workflowId of ["bug-fix", "feature-dev", "security-audit"]) {
    it(`${workflowId} sends bundled Flash polling and M3 work models to the gateway`, async () => {
      const { fileURLToPath } = await import("node:url");
      const { loadWorkflowSpec } = await import("../dist/installer/workflow-spec.js");
      const { setupAgentCrons } = await import("../dist/installer/agent-cron.js");
      const workflow = await loadWorkflowSpec(
        fileURLToPath(new URL(`../workflows/${workflowId}/`, import.meta.url))
      );

      await setupAgentCrons(workflow);

      assert.equal(capturedJobs.length, workflow.agents.length);
      for (const [index, job] of capturedJobs.entries()) {
        assert.equal(job.agentId, `${workflowId}_${workflow.agents[index].id}`);
        assert.equal(job.payload.model, "MiniMax-M3.1-Flash");
        assert.ok(job.payload.message.includes('- model: "MiniMax-M3"'));
        assert.equal(job.payload.timeoutSeconds, 120);
        assert.deepEqual(job.delivery, { mode: "none" });
      }
    });
  }

  for (const model of ["MiniMax-M3", "MiniMax-M2.7", "custom/model", "openai/gpt-5"]) {
    it(`preserves explicitly configured ${model} at the request boundary`, async () => {
      const { fileURLToPath } = await import("node:url");
      const { loadWorkflowSpec } = await import("../dist/installer/workflow-spec.js");
      const { setupAgentCrons } = await import("../dist/installer/agent-cron.js");
      const workflow = await loadWorkflowSpec(
        fileURLToPath(new URL("../workflows/bug-fix/", import.meta.url))
      );
      workflow.agents = [workflow.agents[0]];
      workflow.agents[0].model = model;
      workflow.agents[0].pollingModel = model;

      await setupAgentCrons(workflow);

      assert.equal(capturedJobs.length, 1);
      assert.equal(capturedJobs[0].payload.model, model);
      assert.ok(capturedJobs[0].payload.message.includes(`- model: "${model}"`));
    });
  }

  it("keeps a saved legacy model when a workflow requests the configured default", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const os = await import("node:os");
    const { fileURLToPath } = await import("node:url");
    const { loadWorkflowSpec } = await import("../dist/installer/workflow-spec.js");
    const { setupAgentCrons } = await import("../dist/installer/agent-cron.js");
    const workflow = await loadWorkflowSpec(
      fileURLToPath(new URL("../workflows/bug-fix/", import.meta.url))
    );
    workflow.agents = [workflow.agents[0]];
    workflow.agents[0].model = "default";
    workflow.polling!.model = "default";
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "antfarm-saved-model-"));
    const configPath = path.join(dir, "openclaw.json");
    const config = JSON.stringify({ agents: { list: [
      { id: "bug-fix_triager", model: { primary: "MiniMax-M2.7" } }
    ] } });
    await fs.writeFile(configPath, config);
    const previousPath = process.env.OPENCLAW_CONFIG_PATH;
    process.env.OPENCLAW_CONFIG_PATH = configPath;
    try {
      await setupAgentCrons(workflow);
      assert.equal(capturedJobs[0].payload.model, "MiniMax-M2.7");
      assert.ok(capturedJobs[0].payload.message.includes('- model: "MiniMax-M2.7"'));
      assert.equal(await fs.readFile(configPath, "utf8"), config);
    } finally {
      if (previousPath === undefined) delete process.env.OPENCLAW_CONFIG_PATH;
      else process.env.OPENCLAW_CONFIG_PATH = previousPath;
      await fs.rm(dir, { recursive: true, force: true });
    }
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
