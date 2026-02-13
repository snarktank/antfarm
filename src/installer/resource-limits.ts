import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFile } from "node:child_process";
import { logger } from "../lib/logger.js";
import { loadConfig, saveConfig, type ResourceLimits } from "../config.js";

const SYSTEMD_USER_DIR = path.join(os.homedir(), ".config", "systemd", "user");
const SLICE_NAME = "antfarm-worker.slice";
const SLICE_PATH = path.join(SYSTEMD_USER_DIR, SLICE_NAME);

/**
 * Detect hardware capabilities and return appropriate resource limits.
 * Calculates CPU quota based on available cores (default: 50% of total).
 */
export function detectHardwareLimits(): ResourceLimits {
  const cpus = os.cpus().length;
  // 50% of total CPU — on a 4-core machine this means 200% systemd CPUQuota
  // but we cap per-worker at 50% to leave headroom for the gateway
  const cpuQuota = `${Math.max(25, Math.floor((cpus / 2) * 100 / cpus))}%`;
  const totalMemMb = Math.floor(os.totalmem() / (1024 * 1024));
  // Cap worker memory at 2G or 50% of total RAM, whichever is smaller
  const memLimitMb = Math.min(2048, Math.floor(totalMemMb * 0.5));
  const memoryMax = memLimitMb >= 1024 ? `${(memLimitMb / 1024).toFixed(0)}G` : `${memLimitMb}M`;

  return {
    cpuQuota,
    memoryMax,
    nice: 10,
    ioWeight: 10,
  };
}

/**
 * Check if systemd is available (user-level).
 */
export function isSystemdAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    execFile("systemctl", ["--user", "--version"], { timeout: 5000 }, (err) => {
      resolve(!err);
    });
  });
}

/**
 * Generate the systemd slice file content from resource limits.
 */
export function generateSliceContent(limits: ResourceLimits): string {
  return `[Unit]
Description=Antfarm Worker Process Isolation
Before=slices.target

[Slice]
CPUQuota=${limits.cpuQuota}
MemoryMax=${limits.memoryMax}
IOWeight=${limits.ioWeight}
`;
}

/**
 * Create the antfarm-worker.slice systemd unit file.
 * Returns the path to the created slice file, or null if creation failed.
 */
export async function createWorkerSlice(limits?: ResourceLimits): Promise<string | null> {
  const systemdAvailable = await isSystemdAvailable();
  if (!systemdAvailable) {
    logger.warn("systemd not available — worker slice not created. Workers will use nohup fallback (no resource limits).");
    return null;
  }

  const effectiveLimits = limits ?? loadConfig().resourceLimits;
  const content = generateSliceContent(effectiveLimits);

  try {
    fs.mkdirSync(SYSTEMD_USER_DIR, { recursive: true });
    fs.writeFileSync(SLICE_PATH, content, "utf-8");
    logger.info(`Created systemd worker slice: ${SLICE_PATH}`);
  } catch (err) {
    logger.error(`Failed to write systemd slice file: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }

  // Reload systemd to pick up new slice
  try {
    await reloadSystemdDaemon();
    logger.info("systemd daemon reloaded");
  } catch (err) {
    logger.warn(`Failed to reload systemd daemon: ${err instanceof Error ? err.message : String(err)}`);
    // Slice was written — it will be picked up on next systemd reload
  }

  return SLICE_PATH;
}

/**
 * Reload the systemd user daemon to pick up new/changed unit files.
 */
function reloadSystemdDaemon(): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile("systemctl", ["--user", "daemon-reload"], { timeout: 10_000 }, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

/**
 * Apply resource limits: detect hardware, save to config, and create systemd slice.
 * This is the main entry point called during installation.
 */
export async function applyResourceLimits(): Promise<void> {
  const detected = detectHardwareLimits();
  const config = loadConfig();

  // Merge detected limits with any user-configured overrides
  const limits: ResourceLimits = {
    ...detected,
    ...config.resourceLimits,
  };

  // Persist detected limits to config (user can override later)
  saveConfig({ resourceLimits: limits });
  logger.info(`Resource limits configured: CPU=${limits.cpuQuota}, Memory=${limits.memoryMax}, Nice=${limits.nice}, IOWeight=${limits.ioWeight}`);

  // Create systemd slice (falls back gracefully if systemd unavailable)
  await createWorkerSlice(limits);
}

export function getSlicePath(): string {
  return SLICE_PATH;
}

export function getSliceName(): string {
  return SLICE_NAME;
}
