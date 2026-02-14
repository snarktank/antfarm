import { describe, it, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";

// Mock the mission-control module before importing step-ops
// We need to verify that reportEvent is called at the right lifecycle points

describe("Mission Control hooks in step-ops", () => {
  // We test that the mission-control module functions are imported and called
  // by verifying the module structure rather than doing full integration tests
  // (which would require a SQLite DB setup)

  describe("mission-control module", () => {
    it("reportEvent is a function", async () => {
      const mc = await import("../mission-control.js");
      assert.equal(typeof mc.reportEvent, "function");
    });

    it("reportRunComplete is a function", async () => {
      const mc = await import("../mission-control.js");
      assert.equal(typeof mc.reportRunComplete, "function");
    });

    it("reportRunFail is a function", async () => {
      const mc = await import("../mission-control.js");
      assert.equal(typeof mc.reportRunFail, "function");
    });

    it("reportEvent is a no-op when MISSION_CONTROL_URL is not set", async () => {
      delete process.env.MISSION_CONTROL_URL;
      const mc = await import("../mission-control.js");
      // Should resolve without error
      await mc.reportEvent({
        actorId: "test",
        actorName: "Test",
        eventType: "task_received",
        message: "test message",
      });
    });

    it("reportRunComplete is a no-op when MISSION_CONTROL_URL is not set", async () => {
      delete process.env.MISSION_CONTROL_URL;
      const mc = await import("../mission-control.js");
      await mc.reportRunComplete({ runId: "test-run" });
    });

    it("reportRunFail is a no-op when MISSION_CONTROL_URL is not set", async () => {
      delete process.env.MISSION_CONTROL_URL;
      const mc = await import("../mission-control.js");
      await mc.reportRunFail({ runId: "test-run" });
    });

    it("sanitize redacts emails", async () => {
      const mc = await import("../mission-control.js");
      const result = mc.sanitize("contact user@example.com for info");
      assert.ok(result.includes("[EMAIL]"));
      assert.ok(!result.includes("user@example.com"));
    });

    it("sanitize redacts file paths", async () => {
      const mc = await import("../mission-control.js");
      const result = mc.sanitize("file at /Users/joe/secret/file.txt");
      assert.ok(result.includes("[REDACTED_PATH]"));
      assert.ok(!result.includes("/Users/joe"));
    });

    it("sanitize truncates long messages", async () => {
      const mc = await import("../mission-control.js");
      const long = "a".repeat(1000);
      const result = mc.sanitize(long);
      assert.ok(result.length <= 500);
      assert.ok(result.endsWith("[truncated]"));
    });

    it("reportEvent does not throw when URL is unreachable", async () => {
      process.env.MISSION_CONTROL_URL = "http://localhost:19999";
      const mc = await import("../mission-control.js");
      // Should not throw - fire and forget with catch
      await mc.reportEvent({
        actorId: "test",
        actorName: "Test",
        eventType: "error",
        message: "test",
      });
      delete process.env.MISSION_CONTROL_URL;
    });
  });

  describe("step-ops imports mission-control", () => {
    it("step-ops module loads without error", async () => {
      // This verifies the import of mission-control in step-ops doesn't break
      const mod = await import("./step-ops.js");
      assert.equal(typeof mod.claimStep, "function");
      assert.equal(typeof mod.completeStep, "function");
      assert.equal(typeof mod.failStep, "function");
    });
  });
});
