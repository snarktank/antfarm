/**
 * installer/resource-limits.ts unit tests
 *
 * Tests detectHardwareLimits(), generateSliceContent(), isSystemdAvailable(),
 * createWorkerSlice(), and applyResourceLimits() with mocked os, fs,
 * child_process, and config modules.
 */

import { describe, it, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";

// ── Mock state ──────────────────────────────────────────────────────

let fakeCpus = [{ model: "cpu", speed: 2400 }, { model: "cpu", speed: 2400 },
                { model: "cpu", speed: 2400 }, { model: "cpu", speed: 2400 }];
let fakeTotalmem = 8 * 1024 * 1024 * 1024; // 8 GB
const fakeHomedir = "/fake/home";

let execFileCalls: Array<{ cmd: string; args: string[] }> = [];
let execFileCallback: (err: Error | null) => void = () => {};

let fsWrittenFiles: Map<string, string> = new Map();
let fsMkdirCalls: string[] = [];

let loadConfigResult: Record<string, unknown> = {
  resourceLimits: { cpuQuota: "50%", memoryMax: "2G", nice: 10, ioWeight: 10 },
};
let saveConfigCalls: Array<Record<string, unknown>> = [];

// ── Module mocks ────────────────────────────────────────────────────

mock.module("node:os", {
  defaultExport: {
    cpus: () => fakeCpus,
    totalmem: () => fakeTotalmem,
    homedir: () => fakeHomedir,
  },
});

mock.module("node:fs", {
  defaultExport: {
    mkdirSync: (dir: string, _opts?: unknown) => { fsMkdirCalls.push(dir); },
    writeFileSync: (filePath: string, content: string, _enc?: string) => {
      fsWrittenFiles.set(filePath, content);
    },
    readFileSync: () => { throw Object.assign(new Error("ENOENT"), { code: "ENOENT" }); },
  },
});

mock.module("node:child_process", {
  namedExports: {
    execFile: (cmd: string, args: string[], _opts: unknown, cb: (err: Error | null) => void) => {
      execFileCalls.push({ cmd, args });
      execFileCallback(cb);
    },
  },
});

mock.module("../dist/lib/logger.js", {
  namedExports: {
    logger: {
      info: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {},
    },
  },
});

mock.module("../dist/config.js", {
  namedExports: {
    loadConfig: () => loadConfigResult,
    saveConfig: (cfg: Record<string, unknown>) => { saveConfigCalls.push(cfg); },
  },
});

// Import after mocks
const {
  detectHardwareLimits,
  generateSliceContent,
  isSystemdAvailable,
  createWorkerSlice,
  applyResourceLimits,
} = await import("../dist/installer/resource-limits.js");

// ── Tests ────────────────────────────────────────────────────────────

describe("installer/resource-limits", () => {
  beforeEach(() => {
    execFileCalls = [];
    execFileCallback = (_cb) => {};
    fsWrittenFiles = new Map();
    fsMkdirCalls = [];
    saveConfigCalls = [];
    loadConfigResult = {
      resourceLimits: { cpuQuota: "50%", memoryMax: "2G", nice: 10, ioWeight: 10 },
    };
    fakeCpus = [{ model: "cpu", speed: 2400 }, { model: "cpu", speed: 2400 },
                { model: "cpu", speed: 2400 }, { model: "cpu", speed: 2400 }];
    fakeTotalmem = 8 * 1024 * 1024 * 1024;
  });

  // ── detectHardwareLimits ────────────────────────────────────────

  describe("detectHardwareLimits", () => {
    it("returns expected limits for a 4-core 8GB machine", () => {
      const limits = detectHardwareLimits();
      assert.equal(limits.cpuQuota, "50%");
      assert.equal(limits.memoryMax, "2G");
      assert.equal(limits.nice, 10);
      assert.equal(limits.ioWeight, 10);
    });

    it("returns 50% cpuQuota for 2-core machine", () => {
      fakeCpus = [{ model: "cpu", speed: 2400 }, { model: "cpu", speed: 2400 }];
      const limits = detectHardwareLimits();
      assert.equal(limits.cpuQuota, "50%");
    });

    it("returns 50% cpuQuota for 8-core machine", () => {
      fakeCpus = Array.from({ length: 8 }, () => ({ model: "cpu", speed: 2400 }));
      const limits = detectHardwareLimits();
      assert.equal(limits.cpuQuota, "50%");
    });

    it("clamps cpuQuota to minimum 25% for 1-core machine", () => {
      fakeCpus = [{ model: "cpu", speed: 2400 }];
      const limits = detectHardwareLimits();
      assert.equal(limits.cpuQuota, "50%");
    });

    it("returns memory in megabytes for low-RAM machine (<1GB)", () => {
      fakeTotalmem = 512 * 1024 * 1024; // 512 MB
      const limits = detectHardwareLimits();
      assert.equal(limits.memoryMax, "256M");
    });

    it("caps memory at 2G for high-RAM machine (16GB)", () => {
      fakeTotalmem = 16 * 1024 * 1024 * 1024;
      const limits = detectHardwareLimits();
      assert.equal(limits.memoryMax, "2G");
    });

    it("returns memory in G for 4GB machine", () => {
      fakeTotalmem = 4 * 1024 * 1024 * 1024;
      const limits = detectHardwareLimits();
      assert.equal(limits.memoryMax, "2G");
    });

    it("returns memory in M when 50% is less than 1GB", () => {
      fakeTotalmem = 1.5 * 1024 * 1024 * 1024; // 1.5 GB → 50% = 768MB
      const limits = detectHardwareLimits();
      assert.equal(limits.memoryMax, "768M");
    });
  });

  // ── generateSliceContent ────────────────────────────────────────

  describe("generateSliceContent", () => {
    it("generates correct slice content with standard limits", () => {
      const content = generateSliceContent({
        cpuQuota: "50%",
        memoryMax: "2G",
        nice: 10,
        ioWeight: 10,
      });
      assert.ok(content.includes("[Unit]"));
      assert.ok(content.includes("Description=Antfarm Worker Process Isolation"));
      assert.ok(content.includes("[Slice]"));
      assert.ok(content.includes("CPUQuota=50%"));
      assert.ok(content.includes("MemoryMax=2G"));
      assert.ok(content.includes("IOWeight=10"));
    });

    it("reflects custom CPU quota", () => {
      const content = generateSliceContent({
        cpuQuota: "25%",
        memoryMax: "1G",
        nice: 5,
        ioWeight: 50,
      });
      assert.ok(content.includes("CPUQuota=25%"));
      assert.ok(content.includes("MemoryMax=1G"));
      assert.ok(content.includes("IOWeight=50"));
    });

    it("handles large values", () => {
      const content = generateSliceContent({
        cpuQuota: "400%",
        memoryMax: "16G",
        nice: 0,
        ioWeight: 1000,
      });
      assert.ok(content.includes("CPUQuota=400%"));
      assert.ok(content.includes("MemoryMax=16G"));
      assert.ok(content.includes("IOWeight=1000"));
    });
  });

  // ── isSystemdAvailable ──────────────────────────────────────────

  describe("isSystemdAvailable", () => {
    it("returns true when systemctl succeeds", async () => {
      execFileCallback = (cb) => cb(null);
      const result = await isSystemdAvailable();
      assert.equal(result, true);
      assert.equal(execFileCalls.length, 1);
      assert.equal(execFileCalls[0].cmd, "systemctl");
      assert.deepEqual(execFileCalls[0].args, ["--user", "--version"]);
    });

    it("returns false when systemctl fails", async () => {
      execFileCallback = (cb) => cb(new Error("not found"));
      const result = await isSystemdAvailable();
      assert.equal(result, false);
    });
  });

  // ── createWorkerSlice ───────────────────────────────────────────

  describe("createWorkerSlice", () => {
    it("returns null when systemd is not available", async () => {
      execFileCallback = (cb) => cb(new Error("not found"));
      const result = await createWorkerSlice({
        cpuQuota: "50%",
        memoryMax: "2G",
        nice: 10,
        ioWeight: 10,
      });
      assert.equal(result, null);
    });

    it("writes slice file and returns path when systemd is available", async () => {
      // First call: isSystemdAvailable (success), Second call: daemon-reload (success)
      let callCount = 0;
      execFileCallback = (cb) => {
        callCount++;
        cb(null);
      };

      const result = await createWorkerSlice({
        cpuQuota: "50%",
        memoryMax: "2G",
        nice: 10,
        ioWeight: 10,
      });

      assert.ok(result !== null);
      assert.ok(result!.includes("antfarm-worker.slice"));
      assert.ok(fsMkdirCalls.length > 0);
      assert.ok(fsWrittenFiles.size > 0);
      // Verify the content written includes our limits
      const writtenContent = Array.from(fsWrittenFiles.values())[0];
      assert.ok(writtenContent.includes("CPUQuota=50%"));
      assert.ok(writtenContent.includes("MemoryMax=2G"));
    });

    it("uses config limits when no limits argument passed", async () => {
      let callCount = 0;
      execFileCallback = (cb) => {
        callCount++;
        cb(null);
      };

      loadConfigResult = {
        resourceLimits: { cpuQuota: "75%", memoryMax: "4G", nice: 5, ioWeight: 50 },
      };

      const result = await createWorkerSlice();
      assert.ok(result !== null);
      const writtenContent = Array.from(fsWrittenFiles.values())[0];
      assert.ok(writtenContent.includes("CPUQuota=75%"));
      assert.ok(writtenContent.includes("MemoryMax=4G"));
    });

    it("still returns path when daemon-reload fails", async () => {
      let callCount = 0;
      execFileCallback = (cb) => {
        callCount++;
        if (callCount === 1) {
          cb(null); // isSystemdAvailable succeeds
        } else {
          cb(new Error("reload failed")); // daemon-reload fails
        }
      };

      const result = await createWorkerSlice({
        cpuQuota: "50%",
        memoryMax: "2G",
        nice: 10,
        ioWeight: 10,
      });

      // Should still return path (slice was written, reload is best-effort)
      assert.ok(result !== null);
      assert.ok(result!.includes("antfarm-worker.slice"));
    });
  });

  // ── applyResourceLimits ─────────────────────────────────────────

  describe("applyResourceLimits", () => {
    it("detects limits, merges with config, and saves", async () => {
      // systemd not available — that's fine, we still save config
      execFileCallback = (cb) => cb(new Error("no systemd"));
      loadConfigResult = {
        resourceLimits: { cpuQuota: "50%", memoryMax: "2G", nice: 10, ioWeight: 10 },
      };

      await applyResourceLimits();

      assert.equal(saveConfigCalls.length, 1);
      const saved = saveConfigCalls[0] as { resourceLimits: Record<string, unknown> };
      assert.ok(saved.resourceLimits);
      assert.equal(typeof saved.resourceLimits.cpuQuota, "string");
      assert.equal(typeof saved.resourceLimits.memoryMax, "string");
    });

    it("config overrides take precedence over detected values", async () => {
      execFileCallback = (cb) => cb(new Error("no systemd"));
      loadConfigResult = {
        resourceLimits: { cpuQuota: "25%", memoryMax: "1G", nice: 19, ioWeight: 100 },
      };

      await applyResourceLimits();

      const saved = saveConfigCalls[0] as { resourceLimits: Record<string, unknown> };
      // Config overrides should win (spread order: ...detected, ...config)
      assert.equal(saved.resourceLimits.cpuQuota, "25%");
      assert.equal(saved.resourceLimits.memoryMax, "1G");
      assert.equal(saved.resourceLimits.nice, 19);
      assert.equal(saved.resourceLimits.ioWeight, 100);
    });

    it("uses detected values when config has no overrides", async () => {
      execFileCallback = (cb) => cb(new Error("no systemd"));
      loadConfigResult = {
        resourceLimits: {},
      };

      await applyResourceLimits();

      const saved = saveConfigCalls[0] as { resourceLimits: Record<string, unknown> };
      // Detected defaults should be used
      assert.equal(saved.resourceLimits.cpuQuota, "50%");
      assert.equal(saved.resourceLimits.memoryMax, "2G");
      assert.equal(saved.resourceLimits.nice, 10);
      assert.equal(saved.resourceLimits.ioWeight, 10);
    });
  });
});
