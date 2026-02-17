import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { checkStuckCrons } from "../dist/medic/checks.js";

describe("checkStuckCrons", () => {
  const now = Date.now();

  it("detects cron with runningAtMs stuck beyond timeout + buffer", () => {
    const jobs = [
      {
        id: "abc",
        name: "antfarm/ops/planner",
        enabled: true,
        state: { runningAtMs: now - 300_000 }, // 5 min ago
        payload: { timeoutSeconds: 120 }, // 2 min timeout + 2 min buffer = 4 min
      },
    ];
    const findings = checkStuckCrons(jobs);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].check, "stuck_crons");
    assert.equal(findings[0].action, "unstick_cron");
    assert.ok(findings[0].message.includes("antfarm/ops/planner"));
  });

  it("ignores crons that are running within the timeout window", () => {
    const jobs = [
      {
        id: "abc",
        name: "antfarm/ops/planner",
        enabled: true,
        state: { runningAtMs: now - 60_000 }, // 1 min ago
        payload: { timeoutSeconds: 120 }, // 2 min timeout + 2 min buffer = 4 min
      },
    ];
    const findings = checkStuckCrons(jobs);
    assert.equal(findings.length, 0);
  });

  it("ignores disabled crons", () => {
    const jobs = [
      {
        id: "abc",
        name: "antfarm/ops/planner",
        enabled: false,
        state: { runningAtMs: now - 600_000 },
        payload: { timeoutSeconds: 120 },
      },
    ];
    const findings = checkStuckCrons(jobs);
    assert.equal(findings.length, 0);
  });

  it("ignores medic cron", () => {
    const jobs = [
      {
        id: "abc",
        name: "antfarm/medic",
        enabled: true,
        state: { runningAtMs: now - 600_000 },
        payload: { timeoutSeconds: 120 },
      },
    ];
    const findings = checkStuckCrons(jobs);
    assert.equal(findings.length, 0);
  });

  it("ignores crons without runningAtMs", () => {
    const jobs = [
      {
        id: "abc",
        name: "antfarm/ops/planner",
        enabled: true,
        state: { nextRunAtMs: now + 60_000 },
        payload: { timeoutSeconds: 120 },
      },
    ];
    const findings = checkStuckCrons(jobs);
    assert.equal(findings.length, 0);
  });

  it("detects scheduler freeze when all crons are overdue > 10 min", () => {
    const jobs = [
      {
        id: "a",
        name: "antfarm/ops/planner",
        enabled: true,
        state: { nextRunAtMs: now - 15 * 60_000 },
        payload: { timeoutSeconds: 120 },
      },
      {
        id: "b",
        name: "antfarm/ops/executor",
        enabled: true,
        state: { nextRunAtMs: now - 12 * 60_000 },
        payload: { timeoutSeconds: 120 },
      },
    ];
    const findings = checkStuckCrons(jobs);
    const freeze = findings.find((f) => f.check === "scheduler_freeze");
    assert.ok(freeze, "should detect scheduler freeze");
    assert.equal(freeze!.severity, "critical");
    assert.ok(freeze!.message.includes("frozen"));
  });

  it("does NOT report scheduler freeze when some crons are on time", () => {
    const jobs = [
      {
        id: "a",
        name: "antfarm/ops/planner",
        enabled: true,
        state: { nextRunAtMs: now - 15 * 60_000 },
        payload: { timeoutSeconds: 120 },
      },
      {
        id: "b",
        name: "antfarm/ops/executor",
        enabled: true,
        state: { nextRunAtMs: now + 60_000 }, // on schedule
        payload: { timeoutSeconds: 120 },
      },
    ];
    const findings = checkStuckCrons(jobs);
    const freeze = findings.find((f) => f.check === "scheduler_freeze");
    assert.equal(freeze, undefined, "should not report freeze when some crons are on time");
  });

  it("handles multiple stuck crons", () => {
    const jobs = [
      {
        id: "a",
        name: "antfarm/ops/planner",
        enabled: true,
        state: { runningAtMs: now - 600_000 },
        payload: { timeoutSeconds: 120 },
      },
      {
        id: "b",
        name: "antfarm/ops/executor",
        enabled: true,
        state: { runningAtMs: now - 500_000 },
        payload: { timeoutSeconds: 120 },
      },
    ];
    const findings = checkStuckCrons(jobs);
    const stuck = findings.filter((f) => f.check === "stuck_crons");
    assert.equal(stuck.length, 2);
  });
});
