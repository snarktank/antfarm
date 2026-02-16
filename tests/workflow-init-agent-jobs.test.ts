/**
 * Regression test for workflow initialization agent job creation
 *
 * Bug: Workflow initialization process for creating agent jobs has an issue
 * where cron jobs are set up but may not properly trigger agent work sessions.
 * The two-phase polling (peek/claim) expects specific behavior from the gateway API,
 * but there's a potential mismatch between the cron payload configuration and
 * actual agent job creation.
 */

import { describe, it, mock, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";

describe("workflow initialization creates proper agent jobs", () => {
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

  it("cron payload agentId matches the expected format for OpenClaw gateway", async () => {
    const { setupAgentCrons } = await import("../dist/installer/agent-cron.js");

    const fakeWorkflow = {
      id: "bug-fix",
      name: "Bug Fix",
      version: 1,
      polling: {
        model: "default",
        timeoutSeconds: 120,
      },
      agents: [
        {
          id: "triager",
          name: "Triager",
          workspace: { baseDir: "agents/triager", files: {} },
        },
      ],
      steps: [
        { id: "triage", agent: "triager", input: "triage bug", expects: "RESULT" },
      ],
    };

    await setupAgentCrons(fakeWorkflow as any);

    assert.equal(capturedJobs.length, 1, "should create one cron job");
    const job = capturedJobs[0];
    
    // The agentId must be in the format that OpenClaw expects: workflowId_agentId
    assert.equal(
      job.agentId,
      "bug-fix_triager",
      "agentId should be namespaced with workflow_id prefix using underscore separator"
    );
    
    // The payload model should be "default" to let OpenClaw resolve it
    assert.equal(
      job.payload.model,
      "default",
      "polling model should be 'default' to let OpenClaw resolve the model"
    );
  });

  it("cron payload contains proper two-phase polling instructions", async () => {
    const { setupAgentCrons } = await import("../dist/installer/agent-cron.js");

    const fakeWorkflow = {
      id: "test-workflow",
      name: "Test Workflow",
      version: 1,
      polling: {
        model: "claude-haiku-3",
        timeoutSeconds: 60,
      },
      agents: [
        {
          id: "worker",
          name: "Worker",
          workspace: { baseDir: "agents/worker", files: {} },
        },
      ],
      steps: [
        { id: "step1", agent: "worker", input: "do work", expects: "RESULT" },
      ],
    };

    await setupAgentCrons(fakeWorkflow as any);

    assert.equal(capturedJobs.length, 1, "should create one cron job");
    const job = capturedJobs[0];
    const payload = job.payload;
    
    // Verify payload structure
    assert.equal(payload.kind, "agentTurn", "payload.kind should be agentTurn");
    assert.equal(payload.model, "claude-haiku-3", "payload.model should match workflow polling model");
    assert.equal(payload.timeoutSeconds, 60, "payload.timeoutSeconds should match workflow config");
    
    // Verify the message contains proper two-phase instructions
    const message = payload.message;
    
    // Phase 1: peek
    assert.ok(
      message.includes('step peek "test-workflow_worker"'),
      "message should include step peek command with correct agentId"
    );
    assert.ok(
      message.includes("NO_WORK") && message.includes("HEARTBEAT_OK"),
      "message should include NO_WORK/HEARTBEAT_OK handling"
    );
    
    // Phase 2: claim and spawn
    assert.ok(
      message.includes('step claim "test-workflow_worker"'),
      "message should include step claim command with correct agentId"
    );
    assert.ok(
      message.includes("sessions_spawn"),
      "message should include sessions_spawn instruction"
    );
    
    // The message should reference the work model (passed to sessions_spawn)
    assert.ok(
      message.includes('- agentId: "test-workflow_worker"'),
      "message should include correct agentId for sessions_spawn"
    );
  });

  it("ensures workflow crons are created with proper delivery configuration", async () => {
    const { setupAgentCrons } = await import("../dist/installer/agent-cron.js");

    const fakeWorkflow = {
      id: "security-audit",
      name: "Security Audit",
      version: 1,
      polling: {
        model: "default",
        timeoutSeconds: 120,
      },
      agents: [
        {
          id: "scanner",
          name: "Scanner",
          workspace: { baseDir: "agents/scanner", files: {} },
        },
      ],
      steps: [
        { id: "scan", agent: "scanner", input: "scan code", expects: "RESULT" },
      ],
    };

    await setupAgentCrons(fakeWorkflow as any);

    assert.equal(capturedJobs.length, 1, "should create one cron job");
    const job = capturedJobs[0];
    
    // Delivery mode should be "none" for agent crons (no announcements needed)
    assert.ok(
      job.delivery,
      "job should have delivery configuration"
    );
    assert.equal(
      job.delivery.mode,
      "none",
      "delivery mode should be 'none' for agent crons"
    );
    
    // Session target should be "isolated" for clean agent sessions
    assert.equal(
      job.sessionTarget,
      "isolated",
      "sessionTarget should be 'isolated' for agent crons"
    );
    
    // Job should be enabled
    assert.equal(
      job.enabled,
      true,
      "job should be enabled"
    );
  });

  it("per-agent pollingModel overrides workflow-level polling model", async () => {
    const { setupAgentCrons } = await import("../dist/installer/agent-cron.js");

    const fakeWorkflow = {
      id: "test-workflow",
      name: "Test Workflow",
      version: 1,
      polling: {
        model: "claude-sonnet-4-20250514",
        timeoutSeconds: 120,
      },
      agents: [
        {
          id: "cheap-worker",
          name: "Cheap Worker",
          pollingModel: "claude-haiku-3",
          workspace: { baseDir: "agents/cheap", files: {} },
        },
        {
          id: "regular-worker",
          name: "Regular Worker",
          workspace: { baseDir: "agents/regular", files: {} },
        },
      ],
      steps: [
        { id: "s1", agent: "cheap-worker", input: "cheap work", expects: "R" },
        { id: "s2", agent: "regular-worker", input: "regular work", expects: "R" },
      ],
    };

    await setupAgentCrons(fakeWorkflow as any);

    assert.equal(capturedJobs.length, 2, "should create two cron jobs");

    // Find jobs by agentId
    const cheapJob = capturedJobs.find(j => j.agentId === "test-workflow_cheap-worker");
    const regularJob = capturedJobs.find(j => j.agentId === "test-workflow_regular-worker");

    assert.ok(cheapJob, "should have job for cheap-worker");
    assert.ok(regularJob, "should have job for regular-worker");

    // Agent with pollingModel override
    assert.equal(
      cheapJob.payload.model,
      "claude-haiku-3",
      "per-agent pollingModel should override workflow-level polling model"
    );

    // Agent without override should use workflow-level polling model
    assert.equal(
      regularJob.payload.model,
      "claude-sonnet-4-20250514",
      "agent without pollingModel should use workflow-level polling model"
    );
  });

  it("workModel is passed to sessions_spawn via prompt when specified", async () => {
    const { setupAgentCrons } = await import("../dist/installer/agent-cron.js");

    const fakeWorkflow = {
      id: "feature-dev",
      name: "Feature Dev",
      version: 1,
      polling: {
        model: "default",
        timeoutSeconds: 120,
      },
      agents: [
        {
          id: "developer",
          name: "Developer",
          model: "anthropic/claude-opus-4",
          workspace: { baseDir: "agents/dev", files: {} },
        },
      ],
      steps: [
        { id: "develop", agent: "developer", input: "implement feature", expects: "RESULT" },
      ],
    };

    await setupAgentCrons(fakeWorkflow as any);

    assert.equal(capturedJobs.length, 1, "should create one cron job");
    const job = capturedJobs[0];
    const message = job.payload.message;
    
    // The work model should be embedded in the prompt for sessions_spawn
    assert.ok(
      message.includes('model: "anthropic/claude-opus-4"'),
      "message should include the work model for sessions_spawn"
    );
  });

  it("uses default work model when agent.model is not specified", async () => {
    const { setupAgentCrons } = await import("../dist/installer/agent-cron.js");

    const fakeWorkflow = {
      id: "test-workflow",
      name: "Test Workflow",
      version: 1,
      polling: {
        model: "default",
        timeoutSeconds: 120,
      },
      agents: [
        {
          id: "worker",
          name: "Worker",
          // No model specified
          workspace: { baseDir: "agents/worker", files: {} },
        },
      ],
      steps: [
        { id: "work", agent: "worker", input: "do work", expects: "RESULT" },
      ],
    };

    await setupAgentCrons(fakeWorkflow as any);

    assert.equal(capturedJobs.length, 1, "should create one cron job");
    const job = capturedJobs[0];
    const message = job.payload.message;
    
    // Should use "default" as the work model
    assert.ok(
      message.includes('model: "default"'),
      "message should use 'default' as work model when agent.model is not specified"
    );
  });
});
