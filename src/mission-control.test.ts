import { describe, it, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import { reportEvent, reportRunStart, reportRunComplete, reportRunFail, sanitize } from "./mission-control.js";

describe("mission-control", () => {
  let originalUrl: string | undefined;
  let originalFetch: typeof globalThis.fetch;
  let fetchCalls: { url: string; init: RequestInit }[];

  beforeEach(() => {
    originalUrl = process.env.MISSION_CONTROL_URL;
    originalFetch = globalThis.fetch;
    fetchCalls = [];
  });

  afterEach(() => {
    if (originalUrl === undefined) {
      delete process.env.MISSION_CONTROL_URL;
    } else {
      process.env.MISSION_CONTROL_URL = originalUrl;
    }
    globalThis.fetch = originalFetch;
  });

  function mockFetch(status = 200) {
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      fetchCalls.push({ url: String(url), init: init! });
      return { ok: status >= 200 && status < 300, status, text: async () => "ok" } as Response;
    }) as typeof fetch;
  }

  describe("no-op when MISSION_CONTROL_URL not set", () => {
    it("reportEvent does nothing", async () => {
      delete process.env.MISSION_CONTROL_URL;
      mockFetch();
      await reportEvent({ actorId: "a", actorName: "A", eventType: "task_started", message: "hi" });
      assert.equal(fetchCalls.length, 0);
    });

    it("reportRunStart does nothing", async () => {
      delete process.env.MISSION_CONTROL_URL;
      mockFetch();
      await reportRunStart({ runId: "r1", workflowId: "w1", task: "t" });
      assert.equal(fetchCalls.length, 0);
    });

    it("reportRunComplete does nothing", async () => {
      delete process.env.MISSION_CONTROL_URL;
      mockFetch();
      await reportRunComplete({ runId: "r1" });
      assert.equal(fetchCalls.length, 0);
    });

    it("reportRunFail does nothing", async () => {
      delete process.env.MISSION_CONTROL_URL;
      mockFetch();
      await reportRunFail({ runId: "r1" });
      assert.equal(fetchCalls.length, 0);
    });
  });

  describe("correct payload construction", () => {
    it("reportEvent sends correct payload", async () => {
      process.env.MISSION_CONTROL_URL = "http://localhost:3000";
      mockFetch();
      await reportEvent({
        actorId: "dev",
        actorName: "Developer",
        eventType: "task_completed",
        message: "Done",
        runId: "r1",
        stepId: "s1",
        durationMs: 1234,
      });
      assert.equal(fetchCalls.length, 1);
      assert.equal(fetchCalls[0].url, "http://localhost:3000/reportEvent");
      const body = JSON.parse(fetchCalls[0].init.body as string);
      assert.equal(body.actorId, "dev");
      assert.equal(body.actorName, "Developer");
      assert.equal(body.eventType, "task_completed");
      assert.equal(body.message, "Done");
      assert.equal(body.runId, "r1");
      assert.equal(body.stepId, "s1");
      assert.equal(body.durationMs, 1234);
    });

    it("reportRunStart sends correct payload", async () => {
      process.env.MISSION_CONTROL_URL = "http://localhost:3000";
      mockFetch();
      await reportRunStart({ runId: "r1", workflowId: "feature-dev", task: "Build stuff" });
      assert.equal(fetchCalls.length, 1);
      assert.equal(fetchCalls[0].url, "http://localhost:3000/updateRun");
      const body = JSON.parse(fetchCalls[0].init.body as string);
      assert.equal(body.runId, "r1");
      assert.equal(body.workflowId, "feature-dev");
      assert.equal(body.task, "Build stuff");
      assert.equal(body.status, "running");
      assert.ok(body.startedAt > 0);
    });

    it("reportRunComplete sends completed status", async () => {
      process.env.MISSION_CONTROL_URL = "http://localhost:3000";
      mockFetch();
      await reportRunComplete({ runId: "r1", pr: "https://github.com/pr/1" });
      const body = JSON.parse(fetchCalls[0].init.body as string);
      assert.equal(body.status, "completed");
      assert.equal(body.pr, "https://github.com/pr/1");
      assert.ok(body.completedAt > 0);
    });

    it("reportRunFail sends failed status", async () => {
      process.env.MISSION_CONTROL_URL = "http://localhost:3000";
      mockFetch();
      await reportRunFail({ runId: "r1" });
      const body = JSON.parse(fetchCalls[0].init.body as string);
      assert.equal(body.status, "failed");
    });
  });

  describe("sanitization", () => {
    it("sanitizes message in reportEvent", async () => {
      process.env.MISSION_CONTROL_URL = "http://localhost:3000";
      mockFetch();
      await reportEvent({
        actorId: "a",
        actorName: "A",
        eventType: "task_started",
        message: "Email: user@example.com and path /Users/john/secret",
      });
      const body = JSON.parse(fetchCalls[0].init.body as string);
      assert.ok(body.message.includes("[EMAIL]"));
      assert.ok(body.message.includes("[REDACTED_PATH]"));
      assert.ok(!body.message.includes("user@example.com"));
    });

    it("sanitizes task in reportRunStart", async () => {
      process.env.MISSION_CONTROL_URL = "http://localhost:3000";
      mockFetch();
      await reportRunStart({ runId: "r1", workflowId: "w", task: "Deploy to user@server.com" });
      const body = JSON.parse(fetchCalls[0].init.body as string);
      assert.ok(body.task.includes("[EMAIL]"));
    });
  });

  describe("graceful failure", () => {
    it("does not throw when fetch fails", async () => {
      process.env.MISSION_CONTROL_URL = "http://localhost:9999";
      globalThis.fetch = (async () => { throw new Error("Connection refused"); }) as typeof fetch;
      // Should not throw
      await reportEvent({ actorId: "a", actorName: "A", eventType: "error", message: "test" });
    });

    it("does not throw on non-200 response", async () => {
      process.env.MISSION_CONTROL_URL = "http://localhost:3000";
      mockFetch(500);
      await reportEvent({ actorId: "a", actorName: "A", eventType: "error", message: "test" });
    });
  });

  describe("sanitize function", () => {
    it("redacts emails", () => {
      assert.equal(sanitize("hi user@test.com"), "hi [EMAIL]");
    });

    it("redacts paths", () => {
      assert.ok(sanitize("/Users/bob/file.txt").includes("[REDACTED_PATH]"));
    });

    it("strips URL query params", () => {
      assert.equal(sanitize("http://example.com/path?secret=123"), "http://example.com/path");
    });
  });
});
