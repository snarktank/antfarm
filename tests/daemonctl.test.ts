/**
 * server/daemonctl.ts unit tests
 *
 * Tests getPidFile, getLogFile, isRunning, startDaemon, stopDaemon,
 * getDaemonStatus with mocked fs, os, child_process, and process.kill.
 */

import { describe, it, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";

// ── Mock state ──────────────────────────────────────────────────────

let mockExistsSync: (p: string) => boolean = () => false;
let mockReadFileSync: (p: string, enc: string) => string = () => "";
let mockUnlinkSync: (p: string) => void = () => {};
let mockMkdirSync: (p: string, opts?: unknown) => void = () => {};
let mockOpenSync: (p: string, flags: string) => number = () => 99;

let spawnCalls: Array<{ cmd: string; args: string[]; opts: unknown }> = [];
let mockChildUnref = mock.fn();

let processKillCalls: Array<{ pid: number; signal: number | string }> = [];
let processKillBehavior: (pid: number, signal: number | string) => void = () => {};

// ── Module mocks ────────────────────────────────────────────────────

mock.module("node:os", {
  defaultExport: {
    homedir: () => "/fake/home",
  },
});

mock.module("node:fs", {
  defaultExport: {
    existsSync: (p: string) => mockExistsSync(p),
    readFileSync: (p: string, enc: string) => mockReadFileSync(p, enc),
    unlinkSync: (p: string) => mockUnlinkSync(p),
    mkdirSync: (p: string, opts?: unknown) => mockMkdirSync(p, opts),
    openSync: (p: string, flags: string) => mockOpenSync(p, flags),
    // needed by logger if imported transitively
    statSync: () => ({ size: 0 }),
    appendFileSync: () => {},
  },
});

mock.module("node:child_process", {
  namedExports: {
    spawn: (cmd: string, args: string[], opts: unknown) => {
      spawnCalls.push({ cmd, args, opts });
      return { unref: mockChildUnref, pid: 42 };
    },
  },
});

// Import after mocks
const { getPidFile, getLogFile, isRunning, startDaemon, stopDaemon, getDaemonStatus } =
  await import("../dist/server/daemonctl.js");

// ── Helpers ─────────────────────────────────────────────────────────

const originalProcessKill = process.kill;

function resetMocks() {
  mockExistsSync = () => false;
  mockReadFileSync = () => "";
  mockUnlinkSync = () => {};
  mockMkdirSync = () => {};
  mockOpenSync = () => 99;
  spawnCalls = [];
  mockChildUnref = mock.fn();
  processKillCalls = [];
  processKillBehavior = () => {};

  // Override process.kill to capture calls
  (process as any).kill = (pid: number, signal: number | string) => {
    processKillCalls.push({ pid, signal });
    processKillBehavior(pid, signal);
  };
}

// ── Tests ────────────────────────────────────────────────────────────

describe("server/daemonctl", () => {
  beforeEach(() => {
    resetMocks();
  });

  // Restore original process.kill after all tests
  // (not strictly needed in test runner, but good hygiene)

  // ── getPidFile ──────────────────────────────────────────────────

  describe("getPidFile", () => {
    it("returns path under homedir/.openclaw/antfarm", () => {
      const result = getPidFile();
      assert.ok(result.includes("/fake/home"));
      assert.ok(result.endsWith("dashboard.pid"));
      assert.ok(result.includes(".openclaw"));
      assert.ok(result.includes("antfarm"));
    });
  });

  // ── getLogFile ──────────────────────────────────────────────────

  describe("getLogFile", () => {
    it("returns path under homedir/.openclaw/antfarm", () => {
      const result = getLogFile();
      assert.ok(result.includes("/fake/home"));
      assert.ok(result.endsWith("dashboard.log"));
      assert.ok(result.includes(".openclaw"));
      assert.ok(result.includes("antfarm"));
    });
  });

  // ── isRunning ───────────────────────────────────────────────────

  describe("isRunning", () => {
    it("returns running: false when PID file does not exist", () => {
      mockExistsSync = () => false;
      const result = isRunning();
      assert.deepEqual(result, { running: false });
    });

    it("returns running: false when PID file contains NaN", () => {
      mockExistsSync = () => true;
      mockReadFileSync = () => "not-a-number";
      const result = isRunning();
      assert.deepEqual(result, { running: false });
    });

    it("returns running: true with pid when process is alive", () => {
      mockExistsSync = () => true;
      mockReadFileSync = () => "12345";
      // process.kill(pid, 0) succeeds = process alive
      processKillBehavior = () => {};
      const result = isRunning();
      assert.equal(result.running, true);
      if (result.running) {
        assert.equal(result.pid, 12345);
      }
      // Verify signal 0 was used to check process
      assert.equal(processKillCalls.length, 1);
      assert.equal(processKillCalls[0].pid, 12345);
      assert.equal(processKillCalls[0].signal, 0);
    });

    it("returns running: false and removes stale PID when process is dead", () => {
      mockExistsSync = () => true;
      mockReadFileSync = () => "99999";
      let unlinkCalled = false;
      mockUnlinkSync = () => { unlinkCalled = true; };
      // process.kill(pid, 0) throws = process not found
      processKillBehavior = () => { throw new Error("ESRCH"); };
      const result = isRunning();
      assert.deepEqual(result, { running: false });
      assert.ok(unlinkCalled, "should unlink stale PID file");
    });

    it("handles PID file with whitespace", () => {
      mockExistsSync = () => true;
      mockReadFileSync = () => "  7777  \n";
      processKillBehavior = () => {};
      const result = isRunning();
      assert.equal(result.running, true);
      if (result.running) {
        assert.equal(result.pid, 7777);
      }
    });
  });

  // ── stopDaemon ──────────────────────────────────────────────────

  describe("stopDaemon", () => {
    it("returns false when daemon is not running", () => {
      mockExistsSync = () => false;
      const result = stopDaemon();
      assert.equal(result, false);
    });

    it("sends SIGTERM and removes PID file when daemon is running", () => {
      mockExistsSync = () => true;
      mockReadFileSync = () => "5555";
      processKillBehavior = (_pid, signal) => {
        if (signal === "SIGTERM") return; // SIGTERM succeeds
        // signal 0 check succeeds
      };
      let unlinkCalled = false;
      mockUnlinkSync = () => { unlinkCalled = true; };

      const result = stopDaemon();
      assert.equal(result, true);

      // First call is isRunning's signal-0 check, second is SIGTERM
      const sigtermCall = processKillCalls.find((c) => c.signal === "SIGTERM");
      assert.ok(sigtermCall, "should send SIGTERM");
      assert.equal(sigtermCall!.pid, 5555);
      assert.ok(unlinkCalled, "should remove PID file");
    });

    it("returns true even if process.kill throws on SIGTERM", () => {
      mockExistsSync = () => true;
      mockReadFileSync = () => "5555";
      processKillBehavior = (_pid, signal) => {
        if (signal === "SIGTERM") throw new Error("EPERM");
      };
      mockUnlinkSync = () => {};

      const result = stopDaemon();
      assert.equal(result, true);
    });
  });

  // ── getDaemonStatus ─────────────────────────────────────────────

  describe("getDaemonStatus", () => {
    it("returns running: false when not running", () => {
      mockExistsSync = () => false;
      const result = getDaemonStatus();
      assert.deepEqual(result, { running: false });
    });

    it("returns running: true with pid when running", () => {
      mockExistsSync = () => true;
      mockReadFileSync = () => "8888";
      processKillBehavior = () => {};
      const result = getDaemonStatus();
      assert.equal(result.running, true);
      assert.equal(result.pid, 8888);
    });
  });

  // ── startDaemon ─────────────────────────────────────────────────

  describe("startDaemon", () => {
    it("returns existing pid/port if daemon is already running", async () => {
      mockExistsSync = () => true;
      mockReadFileSync = () => "1111";
      processKillBehavior = () => {};

      const result = await startDaemon(4000);
      assert.equal(result.pid, 1111);
      assert.equal(result.port, 4000);
      // Should not have spawned anything
      assert.equal(spawnCalls.length, 0);
    });

    it("spawns daemon with correct arguments and default port", async () => {
      let callCount = 0;
      mockExistsSync = () => {
        callCount++;
        // First call: isRunning check -> no PID file
        // After spawn, second isRunning check -> PID file exists
        return callCount > 1;
      };
      mockReadFileSync = () => "42";
      processKillBehavior = () => {};
      let mkdirCalls: Array<{ path: string; opts: unknown }> = [];
      mockMkdirSync = (p, opts) => { mkdirCalls.push({ path: p, opts }); };
      let openSyncCalls: string[] = [];
      mockOpenSync = (p, flags) => { openSyncCalls.push(p); return 99; };

      const result = await startDaemon();
      assert.equal(result.pid, 42);
      assert.equal(result.port, 3333);

      // Verify spawn was called
      assert.equal(spawnCalls.length, 1);
      assert.equal(spawnCalls[0].cmd, "node");
      assert.ok(spawnCalls[0].args[0].endsWith("daemon.js"));
      assert.equal(spawnCalls[0].args[1], "3333");
      assert.deepEqual((spawnCalls[0].opts as any).detached, true);

      // Verify mkdirSync was called for PID directory
      assert.ok(mkdirCalls.length > 0);

      // Verify log file was opened
      assert.ok(openSyncCalls.length >= 2);

      // Verify child.unref was called
      assert.equal(mockChildUnref.mock.callCount(), 1);
    });

    it("throws when daemon fails to start", async () => {
      // isRunning always returns false (no PID file)
      mockExistsSync = () => false;

      await assert.rejects(
        () => startDaemon(5000),
        (err: Error) => {
          assert.ok(err.message.includes("Daemon failed to start"));
          return true;
        }
      );

      // Should have attempted spawn
      assert.equal(spawnCalls.length, 1);
    });

    it("spawns daemon with custom port", async () => {
      let callCount = 0;
      mockExistsSync = () => {
        callCount++;
        return callCount > 1;
      };
      mockReadFileSync = () => "42";
      processKillBehavior = () => {};

      const result = await startDaemon(9999);
      assert.equal(result.port, 9999);
      assert.equal(spawnCalls[0].args[1], "9999");
    });
  });
});
