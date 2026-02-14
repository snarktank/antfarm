import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

/**
 * Tests verifying that Mission Control reporting is wired into workflow run lifecycle.
 * We test by mocking fetch and setting MISSION_CONTROL_URL, then checking
 * that the correct HTTP calls are made.
 */

describe("run lifecycle Mission Control integration", () => {
  let originalUrl: string | undefined;
  let originalFetch: typeof globalThis.fetch;
  let fetchCalls: { url: string; body: Record<string, unknown> }[];

  beforeEach(() => {
    originalUrl = process.env.MISSION_CONTROL_URL;
    originalFetch = globalThis.fetch;
    fetchCalls = [];
    process.env.MISSION_CONTROL_URL = "http://mc-test:3000";
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(init.body as string) : {};
      fetchCalls.push({ url: String(url), body });
      return { ok: true, status: 200, text: async () => "ok" } as Response;
    }) as typeof fetch;
  });

  afterEach(() => {
    if (originalUrl === undefined) {
      delete process.env.MISSION_CONTROL_URL;
    } else {
      process.env.MISSION_CONTROL_URL = originalUrl;
    }
    globalThis.fetch = originalFetch;
  });

  it("reportRunStart sends updateRun with running status", async () => {
    const { reportRunStart } = await import("../mission-control.js");
    await reportRunStart({ runId: "run-1", workflowId: "feature-dev", task: "Build feature" });
    assert.equal(fetchCalls.length, 1);
    assert.ok(fetchCalls[0].url.includes("/updateRun"));
    assert.equal(fetchCalls[0].body.runId, "run-1");
    assert.equal(fetchCalls[0].body.workflowId, "feature-dev");
    assert.equal(fetchCalls[0].body.status, "running");
    assert.ok(typeof fetchCalls[0].body.startedAt === "number");
  });

  it("reportRunComplete sends updateRun with completed status", async () => {
    const { reportRunComplete } = await import("../mission-control.js");
    await reportRunComplete({ runId: "run-1", pr: "https://github.com/pr/42" });
    assert.equal(fetchCalls.length, 1);
    assert.ok(fetchCalls[0].url.includes("/updateRun"));
    assert.equal(fetchCalls[0].body.status, "completed");
    assert.equal(fetchCalls[0].body.pr, "https://github.com/pr/42");
    assert.ok(typeof fetchCalls[0].body.completedAt === "number");
  });

  it("reportRunFail sends updateRun with failed status", async () => {
    const { reportRunFail } = await import("../mission-control.js");
    await reportRunFail({ runId: "run-1" });
    assert.equal(fetchCalls.length, 1);
    assert.ok(fetchCalls[0].url.includes("/updateRun"));
    assert.equal(fetchCalls[0].body.status, "failed");
  });

  it("reportEvent with run_started includes workflowId and runId", async () => {
    const { reportEvent } = await import("../mission-control.js");
    await reportEvent({
      actorId: "antfarm",
      actorName: "Antfarm",
      workflowId: "feature-dev",
      runId: "run-1",
      eventType: "run_started",
      message: "Run started: Build feature",
    });
    assert.equal(fetchCalls.length, 1);
    assert.ok(fetchCalls[0].url.includes("/reportEvent"));
    assert.equal(fetchCalls[0].body.eventType, "run_started");
    assert.equal(fetchCalls[0].body.workflowId, "feature-dev");
    assert.equal(fetchCalls[0].body.runId, "run-1");
  });

  it("reportEvent with run_completed includes workflowId and runId", async () => {
    const { reportEvent } = await import("../mission-control.js");
    await reportEvent({
      actorId: "antfarm",
      actorName: "Antfarm",
      workflowId: "feature-dev",
      runId: "run-1",
      eventType: "run_completed",
      message: "Run completed",
    });
    assert.equal(fetchCalls.length, 1);
    assert.equal(fetchCalls[0].body.eventType, "run_completed");
    assert.equal(fetchCalls[0].body.runId, "run-1");
  });

  it("all run lifecycle calls are fire-and-forget safe", async () => {
    // Simulate fetch failure
    globalThis.fetch = (async () => { throw new Error("Network error"); }) as typeof fetch;
    const { reportRunStart, reportRunComplete, reportRunFail, reportEvent } = await import("../mission-control.js");

    // None of these should throw
    await reportRunStart({ runId: "r", workflowId: "w", task: "t" });
    await reportRunComplete({ runId: "r" });
    await reportRunFail({ runId: "r" });
    await reportEvent({ actorId: "a", actorName: "A", eventType: "run_started", message: "m" });
  });

  it("skips silently when MISSION_CONTROL_URL not set", async () => {
    delete process.env.MISSION_CONTROL_URL;
    const { reportRunStart, reportEvent } = await import("../mission-control.js");
    await reportRunStart({ runId: "r", workflowId: "w", task: "t" });
    await reportEvent({ actorId: "a", actorName: "A", eventType: "run_started", message: "m" });
    assert.equal(fetchCalls.length, 0);
  });
});
