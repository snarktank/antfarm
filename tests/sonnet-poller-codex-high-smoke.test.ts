import { describe, it, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";

describe("sonnet poller -> codex high worker smoke", () => {
  let capturedJobs: any[];
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    capturedJobs = [];
    originalFetch = globalThis.fetch;

    globalThis.fetch = mock.fn(async (_url: any, opts: any) => {
      const body = JSON.parse(opts.body);
      if (body.args?.job) capturedJobs.push(body.args.job);

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

  it("uses sonnet for polling payload and codex/high in sessions_spawn handoff", async () => {
    const { setupAgentCrons } = await import("../dist/installer/agent-cron.js");

    const workflowFixture = {
      id: "smoke-sonnet-codex-high",
      name: "Smoke Sonnet -> Codex High",
      version: 1,
      polling: {
        model: "sonnet",
        timeoutSeconds: 120,
      },
      agents: [
        {
          id: "developer",
          name: "Developer",
          model: "openai-codex/gpt-5.3-codex",
          workspace: { baseDir: "agents/developer", files: {} },
        },
      ],
      steps: [
        {
          id: "implement",
          agent: "developer",
          input: "Implement the story",
          expects: "STATUS: done",
        },
      ],
    };

    await setupAgentCrons(workflowFixture as any);

    assert.equal(capturedJobs.length, 1, "expected one cron payload");
    const payload = capturedJobs[0].payload;

    assert.equal(payload.model, "sonnet", "phase-1 polling must run on sonnet");
    assert.ok(payload.message.includes("Then call sessions_spawn with these parameters:"));
    assert.ok(payload.message.includes('- model: "openai-codex/gpt-5.3-codex"'));
    assert.ok(payload.message.includes('- thinking: "high"'));
  });
});
