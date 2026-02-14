import { monitorEventLoopDelay, IntervalHistogram } from "node:perf_hooks";
import { getDb } from "../db.js";
import { loadConfig } from "../config.js";
import { logger } from "../lib/logger.js";

export interface EventLoopMetrics {
  timestamp: string;
  lagMs: number;
  p50: number;
  p95: number;
  p99: number;
  maxLag: number;
}

const MEASURE_INTERVAL_MS = 10_000; // Measure every 10 seconds
const HISTOGRAM_RESOLUTION_NS = 20; // 20ns resolution for histogram

export class EventLoopMonitor {
  private histogram: IntervalHistogram | null = null;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private warningMs: number;
  private criticalMs: number;

  constructor() {
    const config = loadConfig();
    this.warningMs = config.monitoring.eventLoopLagWarningMs;
    this.criticalMs = config.monitoring.eventLoopLagCriticalMs;
  }

  start(): void {
    if (this.histogram) return; // Already running

    this.histogram = monitorEventLoopDelay({ resolution: HISTOGRAM_RESOLUTION_NS });
    this.histogram.enable();

    this.intervalId = setInterval(() => {
      this.tick();
    }, MEASURE_INTERVAL_MS);

    // Don't prevent process exit
    if (this.intervalId && typeof this.intervalId === "object" && "unref" in this.intervalId) {
      this.intervalId.unref();
    }

    logger.info("Event loop lag monitor started");
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (this.histogram) {
      this.histogram.disable();
      this.histogram = null;
    }
    logger.info("Event loop lag monitor stopped");
  }

  getMetrics(): EventLoopMetrics | null {
    if (!this.histogram) return null;

    const nsToMs = (ns: number) => ns / 1_000_000;

    return {
      timestamp: new Date().toISOString(),
      lagMs: nsToMs(this.histogram.mean),
      p50: nsToMs(this.histogram.percentile(50)),
      p95: nsToMs(this.histogram.percentile(95)),
      p99: nsToMs(this.histogram.percentile(99)),
      maxLag: nsToMs(this.histogram.max),
    };
  }

  private tick(): void {
    const metrics = this.getMetrics();
    if (!metrics) return;

    // Log warnings/critical based on p99 lag
    if (metrics.p99 >= this.criticalMs) {
      logger.error(
        `Event loop lag CRITICAL: p99=${metrics.p99.toFixed(1)}ms max=${metrics.maxLag.toFixed(1)}ms`
      );
    } else if (metrics.p99 >= this.warningMs) {
      logger.warn(
        `Event loop lag WARNING: p99=${metrics.p99.toFixed(1)}ms max=${metrics.maxLag.toFixed(1)}ms`
      );
    }

    this.persistMetrics(metrics);

    // Reset histogram for next interval
    this.histogram?.reset();
  }

  private persistMetrics(metrics: EventLoopMetrics): void {
    try {
      const db = getDb();
      db.prepare(
        `INSERT INTO event_loop_metrics (timestamp, lag_ms, p50, p95, p99, max_lag)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(
        metrics.timestamp,
        metrics.lagMs,
        metrics.p50,
        metrics.p95,
        metrics.p99,
        metrics.maxLag
      );
    } catch (err) {
      logger.warn(`Failed to persist event loop metrics: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

let _instance: EventLoopMonitor | null = null;

export function getEventLoopMonitor(): EventLoopMonitor {
  if (!_instance) {
    _instance = new EventLoopMonitor();
  }
  return _instance;
}
