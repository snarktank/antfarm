/**
 * EventLoopMonitor unit tests
 *
 * Tests start/stop lifecycle, metrics shape, config-driven thresholds,
 * and DB persistence without relying on real perf_hooks timing.
 *
 * Approach: Mock node:perf_hooks, ../dist/db.js, ../dist/config.js,
 * and ../dist/lib/logger.js to isolate EventLoopMonitor from real IO.
 */

import { describe, it, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";

// ── In-memory DB setup ──────────────────────────────────────────────

let testDb: DatabaseSync;

function createTestDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE IF NOT EXISTS event_loop_metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      lag_ms REAL NOT NULL,
      p50 REAL NOT NULL,
      p95 REAL NOT NULL,
      p99 REAL NOT NULL,
      max_lag REAL NOT NULL
    )
  `);
  return db;
}

// ── Fake histogram ──────────────────────────────────────────────────

function createFakeHistogram(values: {
  mean?: number;
  max?: number;
  percentiles?: Record<number, number>;
}) {
  const mean = values.mean ?? 5_000_000; // 5ms in ns
  const max = values.max ?? 20_000_000; // 20ms in ns
  const percentiles = values.percentiles ?? {
    50: 4_000_000,
    95: 10_000_000,
    99: 15_000_000,
  };

  return {
    mean,
    max,
    enable: mock.fn(),
    disable: mock.fn(),
    reset: mock.fn(),
    percentile: (p: number) => percentiles[p] ?? mean,
  };
}

let fakeHistogram = createFakeHistogram({});

// ── Config mock state ───────────────────────────────────────────────

let mockWarningMs = 100;
let mockCriticalMs = 1000;

// ── Module mocks ────────────────────────────────────────────────────

mock.module("node:perf_hooks", {
  namedExports: {
    monitorEventLoopDelay: (_opts?: { resolution?: number }) => fakeHistogram,
  },
});

mock.module("../dist/db.js", {
  namedExports: {
    getDb: () => testDb,
  },
});

mock.module("../dist/config.js", {
  namedExports: {
    loadConfig: () => ({
      concurrency: { opus: 2, sonnet: 4, haiku: 8 },
      polling: { intervalMs: 300_000, timeoutSeconds: 120 },
      worker: {
        timeoutSeconds: 1800,
        heartbeatEnabled: true,
        typingRefreshIntervalMs: 30_000,
        progressUpdateIntervalMs: 90_000,
        typingTtlMs: 120_000,
      },
      resourceLimits: {
        cpuQuota: "50%",
        memoryMax: "2G",
        nice: 10,
        ioWeight: 10,
      },
      monitoring: {
        eventLoopLagWarningMs: mockWarningMs,
        eventLoopLagCriticalMs: mockCriticalMs,
      },
    }),
  },
});

const logCalls: { level: string; msg: string }[] = [];

mock.module("../dist/lib/logger.js", {
  namedExports: {
    logger: {
      info: (msg: string) => logCalls.push({ level: "info", msg }),
      warn: (msg: string) => logCalls.push({ level: "warn", msg }),
      error: (msg: string) => logCalls.push({ level: "error", msg }),
      debug: (msg: string) => logCalls.push({ level: "debug", msg }),
    },
  },
});

// Import after mocks are set up
const { EventLoopMonitor } = await import(
  "../dist/monitoring/event-loop-lag.js"
);

// ── Tests ───────────────────────────────────────────────────────────

describe("EventLoopMonitor", () => {
  beforeEach(() => {
    testDb = createTestDb();
    logCalls.length = 0;
    mockWarningMs = 100;
    mockCriticalMs = 1000;
    fakeHistogram = createFakeHistogram({});
  });

  describe("constructor", () => {
    it("reads thresholds from config", () => {
      mockWarningMs = 200;
      mockCriticalMs = 2000;
      const monitor = new EventLoopMonitor();
      // Thresholds are private, but we can verify indirectly via tick behavior
      // For now, just verify construction doesn't throw
      assert.ok(monitor, "monitor should be created");
      monitor.stop();
    });
  });

  describe("start/stop lifecycle", () => {
    it("start() enables histogram monitoring", () => {
      const monitor = new EventLoopMonitor();
      monitor.start();

      assert.equal(
        fakeHistogram.enable.mock.callCount(),
        1,
        "histogram.enable() should be called once"
      );

      monitor.stop();
    });

    it("start() is idempotent — calling twice does not re-enable", () => {
      const monitor = new EventLoopMonitor();
      monitor.start();
      monitor.start(); // second call

      assert.equal(
        fakeHistogram.enable.mock.callCount(),
        1,
        "histogram.enable() should still be called only once"
      );

      monitor.stop();
    });

    it("stop() disables histogram", () => {
      const monitor = new EventLoopMonitor();
      monitor.start();
      monitor.stop();

      assert.equal(
        fakeHistogram.disable.mock.callCount(),
        1,
        "histogram.disable() should be called once"
      );
    });

    it("stop() clears interval and nullifies histogram", () => {
      const monitor = new EventLoopMonitor();
      monitor.start();
      monitor.stop();

      // After stop, getMetrics should return null
      const metrics = monitor.getMetrics();
      assert.equal(metrics, null, "getMetrics() should return null after stop");
    });

    it("start() logs info message", () => {
      const monitor = new EventLoopMonitor();
      monitor.start();

      const startLog = logCalls.find(
        (c) => c.level === "info" && c.msg.includes("started")
      );
      assert.ok(startLog, "should log start info message");

      monitor.stop();
    });

    it("stop() logs info message", () => {
      const monitor = new EventLoopMonitor();
      monitor.start();
      monitor.stop();

      const stopLog = logCalls.find(
        (c) => c.level === "info" && c.msg.includes("stopped")
      );
      assert.ok(stopLog, "should log stop info message");
    });
  });

  describe("getMetrics()", () => {
    it("returns null when monitor is not started", () => {
      const monitor = new EventLoopMonitor();
      assert.equal(
        monitor.getMetrics(),
        null,
        "should return null when not started"
      );
    });

    it("returns metrics with correct shape when running", () => {
      const monitor = new EventLoopMonitor();
      monitor.start();

      const metrics = monitor.getMetrics();
      assert.ok(metrics, "metrics should not be null");
      assert.ok("timestamp" in metrics, "should have timestamp");
      assert.ok("lagMs" in metrics, "should have lagMs");
      assert.ok("p50" in metrics, "should have p50");
      assert.ok("p95" in metrics, "should have p95");
      assert.ok("p99" in metrics, "should have p99");
      assert.ok("maxLag" in metrics, "should have maxLag");

      monitor.stop();
    });

    it("timestamp is a valid ISO string", () => {
      const monitor = new EventLoopMonitor();
      monitor.start();

      const metrics = monitor.getMetrics()!;
      const parsed = Date.parse(metrics.timestamp);
      assert.ok(!isNaN(parsed), "timestamp should be a valid date string");

      monitor.stop();
    });

    it("converts nanoseconds to milliseconds correctly", () => {
      fakeHistogram = createFakeHistogram({
        mean: 10_000_000, // 10ms
        max: 50_000_000, // 50ms
        percentiles: {
          50: 8_000_000, // 8ms
          95: 30_000_000, // 30ms
          99: 40_000_000, // 40ms
        },
      });

      const monitor = new EventLoopMonitor();
      monitor.start();

      const metrics = monitor.getMetrics()!;
      assert.equal(metrics.lagMs, 10, "lagMs should be 10ms");
      assert.equal(metrics.p50, 8, "p50 should be 8ms");
      assert.equal(metrics.p95, 30, "p95 should be 30ms");
      assert.equal(metrics.p99, 40, "p99 should be 40ms");
      assert.equal(metrics.maxLag, 50, "maxLag should be 50ms");

      monitor.stop();
    });

    it("all metric values are numbers", () => {
      const monitor = new EventLoopMonitor();
      monitor.start();

      const metrics = monitor.getMetrics()!;
      assert.equal(typeof metrics.lagMs, "number");
      assert.equal(typeof metrics.p50, "number");
      assert.equal(typeof metrics.p95, "number");
      assert.equal(typeof metrics.p99, "number");
      assert.equal(typeof metrics.maxLag, "number");

      monitor.stop();
    });
  });

  describe("config-driven thresholds", () => {
    it("uses warning threshold from config", () => {
      mockWarningMs = 50;
      mockCriticalMs = 500;

      // p99 at 60ms — above warning (50ms), below critical (500ms)
      fakeHistogram = createFakeHistogram({
        mean: 10_000_000,
        max: 80_000_000,
        percentiles: {
          50: 8_000_000,
          95: 40_000_000,
          99: 60_000_000, // 60ms
        },
      });

      const monitor = new EventLoopMonitor();
      monitor.start();

      // Manually call tick via the private method by accessing it
      // We can trigger it by calling the internal tick through the interval
      // Instead, let's test indirectly by checking persistMetrics works
      // We'll access the private tick method
      (monitor as any).tick();

      const warnLog = logCalls.find((c) => c.level === "warn" && c.msg.includes("WARNING"));
      assert.ok(warnLog, "should log warning when p99 exceeds warningMs");

      monitor.stop();
    });

    it("uses critical threshold from config", () => {
      mockWarningMs = 50;
      mockCriticalMs = 100;

      // p99 at 150ms — above critical (100ms)
      fakeHistogram = createFakeHistogram({
        mean: 50_000_000,
        max: 200_000_000,
        percentiles: {
          50: 30_000_000,
          95: 100_000_000,
          99: 150_000_000, // 150ms
        },
      });

      const monitor = new EventLoopMonitor();
      monitor.start();

      (monitor as any).tick();

      const errorLog = logCalls.find((c) => c.level === "error" && c.msg.includes("CRITICAL"));
      assert.ok(errorLog, "should log error when p99 exceeds criticalMs");

      monitor.stop();
    });

    it("does not log when below warning threshold", () => {
      mockWarningMs = 100;
      mockCriticalMs = 1000;

      // p99 at 5ms — well below warning
      fakeHistogram = createFakeHistogram({
        mean: 2_000_000,
        max: 8_000_000,
        percentiles: {
          50: 1_000_000,
          95: 3_000_000,
          99: 5_000_000, // 5ms
        },
      });

      const monitor = new EventLoopMonitor();
      monitor.start();

      logCalls.length = 0; // clear start log
      (monitor as any).tick();

      const warnOrError = logCalls.filter(
        (c) => c.level === "warn" || c.level === "error"
      );
      assert.equal(
        warnOrError.length,
        0,
        "should not log warnings when below threshold"
      );

      monitor.stop();
    });
  });

  describe("persistMetrics (DB recording)", () => {
    it("tick() writes metrics to event_loop_metrics table", () => {
      const monitor = new EventLoopMonitor();
      monitor.start();

      (monitor as any).tick();

      const rows = testDb
        .prepare("SELECT * FROM event_loop_metrics")
        .all() as any[];
      assert.equal(rows.length, 1, "should insert one row");
      assert.ok(rows[0].timestamp, "row should have timestamp");
      assert.equal(typeof rows[0].lag_ms, "number", "lag_ms should be a number");
      assert.equal(typeof rows[0].p50, "number", "p50 should be a number");
      assert.equal(typeof rows[0].p95, "number", "p95 should be a number");
      assert.equal(typeof rows[0].p99, "number", "p99 should be a number");
      assert.equal(typeof rows[0].max_lag, "number", "max_lag should be a number");

      monitor.stop();
    });

    it("tick() resets histogram after recording", () => {
      const monitor = new EventLoopMonitor();
      monitor.start();

      (monitor as any).tick();

      assert.equal(
        fakeHistogram.reset.mock.callCount(),
        1,
        "histogram.reset() should be called after tick"
      );

      monitor.stop();
    });

    it("handles DB errors gracefully", () => {
      const monitor = new EventLoopMonitor();
      monitor.start();

      // Drop the table to cause an error
      testDb.exec("DROP TABLE event_loop_metrics");

      // Should not throw
      assert.doesNotThrow(() => {
        (monitor as any).tick();
      }, "tick should handle DB errors gracefully");

      const warnLog = logCalls.find(
        (c) => c.level === "warn" && c.msg.includes("Failed to persist")
      );
      assert.ok(warnLog, "should log warning on DB error");

      monitor.stop();
    });
  });
});
