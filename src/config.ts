import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { logger } from "./lib/logger.js";

const CONFIG_DIR = path.join(os.homedir(), ".openclaw");
const CONFIG_PATH = path.join(CONFIG_DIR, "antfarm.json");

export interface PollingSettings {
  intervalMs: number;
  timeoutSeconds: number;
}

export interface WorkerSettings {
  timeoutSeconds: number;
  heartbeatEnabled: boolean;
  typingRefreshIntervalMs: number;
  progressUpdateIntervalMs: number;
  typingTtlMs: number;
}

export interface ConcurrencySettings {
  opus: number;
  sonnet: number;
  haiku: number;
}

export interface ResourceLimits {
  cpuQuota: string;
  memoryMax: string;
  nice: number;
  ioWeight: number;
}

export interface MonitoringSettings {
  eventLoopLagWarningMs: number;
  eventLoopLagCriticalMs: number;
}

export interface AntfarmConfig {
  polling: PollingSettings;
  worker: WorkerSettings;
  concurrency: ConcurrencySettings;
  resourceLimits: ResourceLimits;
  monitoring: MonitoringSettings;
}

export function getDefaultConfig(): AntfarmConfig {
  return {
    polling: {
      intervalMs: 300_000,
      timeoutSeconds: 120,
    },
    worker: {
      timeoutSeconds: 1800,
      heartbeatEnabled: true,
      typingRefreshIntervalMs: 30_000,
      progressUpdateIntervalMs: 90_000,
      typingTtlMs: 120_000,
    },
    concurrency: {
      opus: 2,
      sonnet: 4,
      haiku: 8,
    },
    resourceLimits: {
      cpuQuota: "50%",
      memoryMax: "2G",
      nice: 10,
      ioWeight: 10,
    },
    monitoring: {
      eventLoopLagWarningMs: 100,
      eventLoopLagCriticalMs: 1000,
    },
  };
}

function applyEnvOverrides(config: AntfarmConfig): AntfarmConfig {
  const envMap: Array<[string, (val: string) => void]> = [
    ["ANTFARM_POLLING_INTERVAL_MS", (v) => { config.polling.intervalMs = parseInt(v, 10); }],
    ["ANTFARM_POLLING_TIMEOUT_SECONDS", (v) => { config.polling.timeoutSeconds = parseInt(v, 10); }],
    ["ANTFARM_WORKER_TIMEOUT_SECONDS", (v) => { config.worker.timeoutSeconds = parseInt(v, 10); }],
    ["ANTFARM_WORKER_HEARTBEAT_ENABLED", (v) => { config.worker.heartbeatEnabled = v === "true" || v === "1"; }],
    ["ANTFARM_CONCURRENCY_OPUS", (v) => { config.concurrency.opus = parseInt(v, 10); }],
    ["ANTFARM_CONCURRENCY_SONNET", (v) => { config.concurrency.sonnet = parseInt(v, 10); }],
    ["ANTFARM_CONCURRENCY_HAIKU", (v) => { config.concurrency.haiku = parseInt(v, 10); }],
    ["ANTFARM_RESOURCE_CPU_QUOTA", (v) => { config.resourceLimits.cpuQuota = v; }],
    ["ANTFARM_RESOURCE_MEMORY_MAX", (v) => { config.resourceLimits.memoryMax = v; }],
    ["ANTFARM_MONITORING_LAG_WARNING_MS", (v) => { config.monitoring.eventLoopLagWarningMs = parseInt(v, 10); }],
    ["ANTFARM_MONITORING_LAG_CRITICAL_MS", (v) => { config.monitoring.eventLoopLagCriticalMs = parseInt(v, 10); }],
  ];

  for (const [envKey, setter] of envMap) {
    const val = process.env[envKey]?.trim();
    if (val) {
      setter(val);
    }
  }

  return config;
}

export function loadConfig(): AntfarmConfig {
  const defaults = getDefaultConfig();

  try {
    const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
    const parsed = JSON.parse(raw) as Partial<AntfarmConfig>;

    const merged: AntfarmConfig = {
      polling: { ...defaults.polling, ...parsed.polling },
      worker: { ...defaults.worker, ...parsed.worker },
      concurrency: { ...defaults.concurrency, ...parsed.concurrency },
      resourceLimits: { ...defaults.resourceLimits, ...parsed.resourceLimits },
      monitoring: { ...defaults.monitoring, ...parsed.monitoring },
    };

    return applyEnvOverrides(merged);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      logger.info("No antfarm.json found, using defaults");
    } else {
      logger.warn(`Failed to parse antfarm.json, using defaults: ${err instanceof Error ? err.message : String(err)}`);
    }
    return applyEnvOverrides(defaults);
  }
}

export function saveConfig(config: Partial<AntfarmConfig>): void {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });

  let existing: Partial<AntfarmConfig> = {};
  try {
    const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
    existing = JSON.parse(raw) as Partial<AntfarmConfig>;
  } catch {
    // No existing config or invalid JSON — start fresh
  }

  const merged = {
    ...existing,
    ...config,
  };

  fs.writeFileSync(CONFIG_PATH, JSON.stringify(merged, null, 2) + "\n", "utf-8");
}

export function getConfigPath(): string {
  return CONFIG_PATH;
}
