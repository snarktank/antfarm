import { describe, it, mock, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

/**
 * Integration test for two-phase polling with Kimi models.
 * 
 * Verifies the full two-phase polling flow works correctly when configured
 * with Kimi models for both polling and work phases.
 */
describe("two-phase-polling-kimi", () => {
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

  describe("Kimi polling model in cron payload", () => {
    it("creates workflow with kimi-k2 polling model configured", async () => {
      const { setupAgentCrons } = await import("../dist/installer/agent-cron.js");

      const workflowWithKimiPolling = {
        id: "kimi-test-workflow",
        name: "Kimi Test Workflow",
        version: 1,
        polling: {
          model: "kimi-k2",
          timeoutSeconds: 120,
        },
        agents: [
          {
            id: "kimi-agent",
            name: "Kimi Agent",
            workspace: { baseDir: "agents/kimi", files: {} },
          },
        ],
        steps: [
          { id: "step-1", agent: "kimi-agent", input: "do work", expects: "RESULT" },
        ],
      };

      await setupAgentCrons(workflowWithKimiPolling as any);

      assert.equal(capturedJobs.length, 1, "should create one cron job");
      const payload = capturedJobs[0].payload;

      // AC1: Verify kimi-k2 is used as the polling model in the cron payload
      assert.equal(
        payload.model,
        "kimi-k2",
        "cron payload must use kimi-k2 as the polling model"
      );
    });

    it("mocks cron job creation and verifies correct Kimi model in payload", async () => {
      const { setupAgentCrons } = await import("../dist/installer/agent-cron.js");

      const workflowWithKimiCodePolling = {
        id: "kimi-code-workflow",
        name: "Kimi Code Workflow",
        version: 1,
        polling: {
          model: "kimi-code",
          timeoutSeconds: 90,
        },
        agents: [
          {
            id: "developer",
            name: "Developer",
            workspace: { baseDir: "agents/dev", files: {} },
          },
        ],
        steps: [
          { id: "dev-step", agent: "developer", input: "write code", expects: "CODE" },
        ],
      };

      await setupAgentCrons(workflowWithKimiCodePolling as any);

      assert.equal(capturedJobs.length, 1, "should create one cron job");
      const job = capturedJobs[0];
      const payload = job.payload;

      // AC2: Verify the cron job payload has correct Kimi model
      assert.equal(payload.model, "kimi-code", "payload.model should be kimi-code");
      assert.equal(payload.timeoutSeconds, 90, "payload.timeoutSeconds should be 90");
      assert.ok(payload.message.includes("sessions_spawn"), "prompt should include sessions_spawn");
    });
  });

  describe("Kimi work model in polling prompt", () => {
    it("polling prompt contains correct kimi-k2 work model reference", async () => {
      const { setupAgentCrons, buildPollingPrompt } = await import("../dist/installer/agent-cron.js");

      const workflowWithKimiWorkModel = {
        id: "kimi-workflow",
        name: "Kimi Work Workflow",
        version: 1,
        polling: {
          model: "claude-sonnet-4-20250514", // polling model
          timeoutSeconds: 120,
        },
        agents: [
          {
            id: "worker",
            name: "Worker",
            model: "kimi-k2", // work model - this is what we're testing
            workspace: { baseDir: "agents/worker", files: {} },
          },
        ],
        steps: [
          { id: "work-step", agent: "worker", input: "process data", expects: "DONE" },
        ],
      };

      // Verify the buildPollingPrompt directly
      const prompt = buildPollingPrompt("kimi-workflow", "worker", "kimi-k2");

      // AC3: Verify polling prompt contains correct Kimi work model reference
      assert.ok(prompt.includes('"kimi-k2"'), "polling prompt should contain kimi-k2 work model");
      assert.ok(prompt.includes("sessions_spawn"), "polling prompt should mention sessions_spawn");
      
      // Verify the prompt includes model parameter for sessions_spawn
      const modelLine = prompt.split('\n').find(line => line.includes('model:'));
      assert.ok(modelLine, "prompt should have a model line");
      assert.ok(modelLine!.includes('"kimi-k2"'), "model line should reference kimi-k2");
    });

    it("polling prompt contains correct kimi-for-coding work model reference", async () => {
      const { buildPollingPrompt } = await import("../dist/installer/agent-cron.js");

      const prompt = buildPollingPrompt("coding-workflow", "coder", "kimi-for-coding");

      // Verify kimi-for-coding is in the prompt
      assert.ok(prompt.includes('"kimi-for-coding"'), "polling prompt should contain kimi-for-coding work model");
      
      // Verify the structure is correct for the spawned session
      assert.ok(prompt.includes('agentId: "coding-workflow-coder"'), "should include correct agentId");
      assert.ok(prompt.includes("---START WORK PROMPT---"), "should include work prompt delimiter");
      assert.ok(prompt.includes("---END WORK PROMPT---"), "should include work prompt end delimiter");
    });

    it("uses per-agent pollingModel with kimi-code and work model kimi-k2", async () => {
      const { setupAgentCrons } = await import("../dist/installer/agent-cron.js");

      const workflowWithMixedModels = {
        id: "mixed-model-workflow",
        name: "Mixed Model Workflow",
        version: 1,
        polling: {
          model: "claude-sonnet-4-20250514", // default workflow polling model
          timeoutSeconds: 120,
        },
        agents: [
          {
            id: "smart-agent",
            name: "Smart Agent",
            pollingModel: "kimi-code", // per-agent polling model
            model: "kimi-k2", // work model
            workspace: { baseDir: "agents/smart", files: {} },
          },
        ],
        steps: [
          { id: "smart-step", agent: "smart-agent", input: "think", expects: "IDEA" },
        ],
      };

      await setupAgentCrons(workflowWithMixedModels as any);

      assert.equal(capturedJobs.length, 1, "should create one cron job");
      const payload = capturedJobs[0].payload;

      // Polling model should be kimi-code (per-agent override)
      assert.equal(payload.model, "kimi-code", "polling model should be kimi-code from per-agent pollingModel");
      
      // Work model should be referenced in the prompt (kimi-k2)
      assert.ok(payload.message.includes('"kimi-k2"'), "prompt should reference kimi-k2 work model");
    });
  });

  describe("cleanup and teardown", () => {
    it("cleanup removes created cron jobs", async () => {
      const { removeAgentCrons } = await import("../dist/installer/agent-cron.js");
      const deleteCalls: string[] = [];
      let listCallCount = 0;

      // Mock fetch to simulate list returning jobs and capturing delete calls
      globalThis.fetch = mock.fn(async (_url: any, opts: any) => {
        const body = JSON.parse(opts.body);
        
        // Handle list action
        if (body.args?.action === "list") {
          listCallCount++;
          return {
            ok: true,
            status: 200,
            json: async () => ({ 
              ok: true, 
              result: { 
                jobs: [
                  { id: "job-123", name: "antfarm/cleanup-test-workflow/agent-to-cleanup" }
                ] 
              } 
            }),
          };
        }
        
        // Handle remove action
        if (body.args?.action === "remove") {
          if (body.args?.id) {
            deleteCalls.push(body.args.id);
          }
          return {
            ok: true,
            status: 200,
            json: async () => ({ ok: true, result: { deleted: true } }),
          };
        }

        return {
          ok: true,
          status: 200,
          json: async () => ({ ok: true }),
        };
      }) as any;

      // AC4: Cleanup removes any created cron jobs
      await removeAgentCrons("cleanup-test-workflow");
      
      assert.equal(listCallCount, 1, "should call list once");
      assert.equal(deleteCalls.length, 1, "should call delete once");
      assert.equal(deleteCalls[0], "job-123", "should delete job with correct id");
    });
  });

  describe("full two-phase flow with Kimi models", () => {
    it("end-to-end: kimi polling model + kimi work model workflow", async () => {
      const { setupAgentCrons, buildPollingPrompt } = await import("../dist/installer/agent-cron.js");

      // Create a workflow with Kimi models for both polling and work phases
      const fullKimiWorkflow = {
        id: "full-kimi-workflow",
        name: "Full Kimi Workflow",
        version: 1,
        polling: {
          model: "kimi-k2", // Phase 1: Polling uses kimi-k2
          timeoutSeconds: 120,
        },
        agents: [
          {
            id: "kimi-worker",
            name: "Kimi Worker",
            model: "kimi-for-coding", // Phase 2: Work uses kimi-for-coding
            workspace: { baseDir: "agents/kimi-worker", files: {} },
          },
        ],
        steps: [
          { id: "kimi-step", agent: "kimi-worker", input: "do kimi work", expects: "RESULT" },
        ],
      };

      await setupAgentCrons(fullKimiWorkflow as any);

      // Verify cron job was created with correct configuration
      assert.equal(capturedJobs.length, 1, "should create one cron job");
      
      const job = capturedJobs[0];
      const payload = job.payload;

      // Phase 1 (Polling): Uses kimi-k2
      assert.equal(payload.model, "kimi-k2", "Phase 1 polling should use kimi-k2");
      assert.ok(payload.message.includes("step peek"), "prompt should include step peek");
      assert.ok(payload.message.includes("step claim"), "prompt should include step claim");
      assert.ok(payload.message.includes("sessions_spawn"), "prompt should include sessions_spawn for Phase 2");

      // Phase 2 (Work): Uses kimi-for-coding (referenced in the prompt for sessions_spawn)
      assert.ok(payload.message.includes('"kimi-for-coding"'), "Phase 2 work model should be kimi-for-coding");

      // Verify the full two-phase structure
      const prompt = payload.message;
      assert.ok(prompt.includes("HEARTBEAT_OK"), "should include HEARTBEAT_OK for NO_WORK case");
      assert.ok(prompt.includes("CLAIMED STEP JSON"), "should reference CLAIMED STEP JSON");
      assert.ok(prompt.includes("---START WORK PROMPT---"), "should embed full work prompt");
      assert.ok(prompt.includes("---END WORK PROMPT---"), "should delimit work prompt");
    });

    it("verifies multiple agents with different Kimi model combinations", async () => {
      const { setupAgentCrons } = await import("../dist/installer/agent-cron.js");

      const multiAgentKimiWorkflow = {
        id: "multi-kimi-workflow",
        name: "Multi Agent Kimi Workflow",
        version: 1,
        polling: {
          model: "kimi-code", // Workflow-level default polling model
          timeoutSeconds: 120,
        },
        agents: [
          {
            id: "planner",
            name: "Planner",
            // Uses workflow-level polling model (kimi-code)
            model: "kimi-k2", // Work model
            workspace: { baseDir: "agents/planner", files: {} },
          },
          {
            id: "coder",
            name: "Coder",
            pollingModel: "kimi-for-coding", // Override polling model
            model: "kimi-for-coding", // Work model
            workspace: { baseDir: "agents/coder", files: {} },
          },
        ],
        steps: [
          { id: "plan-step", agent: "planner", input: "plan", expects: "PLAN" },
          { id: "code-step", agent: "coder", input: "code", expects: "CODE" },
        ],
      };

      await setupAgentCrons(multiAgentKimiWorkflow as any);

      assert.equal(capturedJobs.length, 2, "should create two cron jobs");

      // First agent: planner
      // - Polling model: kimi-code (workflow default)
      // - Work model: kimi-k2
      assert.equal(capturedJobs[0].payload.model, "kimi-code", "planner polling model should be kimi-code");
      assert.ok(capturedJobs[0].payload.message.includes('"kimi-k2"'), "planner work model should be kimi-k2");

      // Second agent: coder
      // - Polling model: kimi-for-coding (per-agent override)
      // - Work model: kimi-for-coding
      assert.equal(capturedJobs[1].payload.model, "kimi-for-coding", "coder polling model should be kimi-for-coding");
      assert.ok(capturedJobs[1].payload.message.includes('"kimi-for-coding"'), "coder work model should be kimi-for-coding");
    });
  });
});
