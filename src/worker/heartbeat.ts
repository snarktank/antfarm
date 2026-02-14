import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { getDb } from "../db.js";
import { loadConfig } from "../config.js";
import { logger } from "../lib/logger.js";

const LOCK_DIR = "/tmp/antfarm";

export interface HeartbeatOptions {
  stepId: string;
  runId: string;
  gatewayUrl?: string;
  gatewayToken?: string;
}

/**
 * Get the gateway configuration from openclaw.json.
 */
function getGatewayConfig(): { url: string; token?: string } {
  const configPath = path.join(os.homedir(), ".openclaw", "openclaw.json");
  try {
    const content = fs.readFileSync(configPath, "utf-8");
    const config = JSON.parse(content);
    const port = config.gateway?.port ?? 18789;
    return {
      url: `http://127.0.0.1:${port}`,
      token: config.gateway?.auth?.token,
    };
  } catch {
    return { url: "http://127.0.0.1:18789" };
  }
}

/**
 * Get the chat ID associated with a run from OpenClaw config.
 * The notify_url may contain a Telegram chat reference, or we can
 * use the gateway's announce API to send messages to the originating chat.
 */
function getRunChatInfo(runId: string): { notifyUrl: string | null } {
  try {
    const db = getDb();
    const row = db.prepare(
      "SELECT notify_url FROM runs WHERE id = ?"
    ).get(runId) as { notify_url: string | null } | undefined;
    return { notifyUrl: row?.notify_url ?? null };
  } catch {
    return { notifyUrl: null };
  }
}

/**
 * Check whether a step is still in progress (running status).
 */
function isStepRunning(stepId: string): boolean {
  try {
    const db = getDb();
    const row = db.prepare(
      "SELECT status FROM steps WHERE id = ?"
    ).get(stepId) as { status: string } | undefined;
    return row?.status === "running";
  } catch {
    return false;
  }
}

/**
 * Send a typing indicator via the OpenClaw gateway.
 * Uses the gateway's announce mechanism to refresh the typing indicator.
 */
async function sendTypingIndicator(gateway: { url: string; token?: string }): Promise<boolean> {
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (gateway.token) headers["Authorization"] = `Bearer ${gateway.token}`;

    // Use the gateway's tools/invoke endpoint to trigger a typing action
    // The gateway's "announce" tool can send typing indicators
    const response = await fetch(`${gateway.url}/tools/invoke`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        tool: "announce",
        args: { action: "typing" },
        sessionKey: "agent:main:main",
      }),
      signal: AbortSignal.timeout(5000),
    });

    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Send a progress message via the OpenClaw gateway.
 */
async function sendProgressMessage(
  gateway: { url: string; token?: string },
  message: string,
  notifyUrl: string | null
): Promise<boolean> {
  // Try notify_url webhook first (direct Telegram delivery)
  if (notifyUrl) {
    try {
      let url = notifyUrl;
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      const hashIdx = url.indexOf("#auth=");
      if (hashIdx !== -1) {
        headers["Authorization"] = decodeURIComponent(url.slice(hashIdx + 6));
        url = url.slice(0, hashIdx);
      }
      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({
          ts: new Date().toISOString(),
          event: "heartbeat.progress",
          detail: message,
        }),
        signal: AbortSignal.timeout(5000),
      });
      if (response.ok) return true;
    } catch {
      // Fall through to gateway attempt
    }
  }

  // Fallback: try gateway announce
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (gateway.token) headers["Authorization"] = `Bearer ${gateway.token}`;

    const response = await fetch(`${gateway.url}/tools/invoke`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        tool: "announce",
        args: { action: "send", message },
        sessionKey: "agent:main:main",
      }),
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Format elapsed time as a human-readable string.
 */
function formatElapsed(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (minutes === 0) return `${secs}s`;
  return `${minutes}m ${secs}s`;
}

/**
 * Get the lock file path for a heartbeat process.
 */
export function getHeartbeatLockFile(stepId: string): string {
  return path.join(LOCK_DIR, `heartbeat-${stepId}.lock`);
}

/**
 * Check if a heartbeat process is already running for a step.
 */
export function isHeartbeatRunning(stepId: string): boolean {
  const lockFile = getHeartbeatLockFile(stepId);
  try {
    const pid = parseInt(fs.readFileSync(lockFile, "utf-8").trim(), 10);
    process.kill(pid, 0); // Check if process alive
    return true;
  } catch {
    return false;
  }
}

/**
 * Stop a running heartbeat process for a step.
 */
export function stopHeartbeat(stepId: string): boolean {
  const lockFile = getHeartbeatLockFile(stepId);
  try {
    const pid = parseInt(fs.readFileSync(lockFile, "utf-8").trim(), 10);
    process.kill(pid, "SIGTERM");
    try { fs.unlinkSync(lockFile); } catch {}
    logger.info(`Heartbeat stopped for step=${stepId} PID=${pid}`);
    return true;
  } catch {
    // Process already dead or lock file missing
    try { fs.unlinkSync(lockFile); } catch {}
    return false;
  }
}

/**
 * Start a heartbeat loop for a step. This is designed to be called from
 * the CLI as a long-running process. It will:
 * 1. Refresh typing indicator every typingRefreshIntervalMs (default 30s)
 * 2. Send progress message every progressUpdateIntervalMs (default 90s)
 * 3. Exit when the step completes, fails, or a hard timeout is reached.
 *
 * This function does NOT return until the heartbeat loop ends.
 */
export async function startHeartbeatLoop(opts: HeartbeatOptions): Promise<void> {
  const { stepId, runId } = opts;
  const config = loadConfig();

  if (!config.worker.heartbeatEnabled) {
    logger.info(`Heartbeat disabled in config, skipping for step=${stepId}`);
    return;
  }

  const gateway = opts.gatewayUrl
    ? { url: opts.gatewayUrl, token: opts.gatewayToken }
    : getGatewayConfig();

  const chatInfo = getRunChatInfo(runId);
  const typingIntervalMs = config.worker.typingRefreshIntervalMs;
  let progressIntervalMs = config.worker.progressUpdateIntervalMs;
  const hardTimeoutMs = config.worker.timeoutSeconds * 1000;

  // Write lock file
  const lockFile = getHeartbeatLockFile(stepId);
  fs.mkdirSync(LOCK_DIR, { recursive: true });
  fs.writeFileSync(lockFile, String(process.pid));

  // Cleanup on exit
  const cleanup = () => {
    try { fs.unlinkSync(lockFile); } catch {}
  };
  process.on("SIGTERM", () => { cleanup(); process.exit(0); });
  process.on("SIGINT", () => { cleanup(); process.exit(0); });

  const startTime = Date.now();
  let lastTypingTime = 0;
  let lastProgressTime = 0;
  let progressCount = 0;

  logger.info(`Heartbeat started for step=${stepId} run=${runId} (typing=${typingIntervalMs}ms, progress=${progressIntervalMs}ms)`);

  // Main heartbeat loop
  while (true) {
    const now = Date.now();
    const elapsed = now - startTime;

    // Hard timeout check
    if (elapsed >= hardTimeoutMs) {
      logger.warn(`Heartbeat hard timeout reached for step=${stepId} after ${formatElapsed(elapsed)}`);
      break;
    }

    // Check if step is still running
    if (!isStepRunning(stepId)) {
      logger.info(`Heartbeat stopping: step=${stepId} no longer running after ${formatElapsed(elapsed)}`);
      break;
    }

    // Send typing indicator
    if (now - lastTypingTime >= typingIntervalMs) {
      const sent = await sendTypingIndicator(gateway);
      if (sent) {
        lastTypingTime = now;
      } else {
        logger.debug(`Typing indicator failed for step=${stepId}`);
      }
    }

    // Send progress message
    if (now - lastProgressTime >= progressIntervalMs) {
      progressCount++;
      const message = `\u23f3 Working on task... (elapsed: ${formatElapsed(elapsed)})`;
      const sent = await sendProgressMessage(gateway, message, chatInfo.notifyUrl);
      if (sent) {
        lastProgressTime = now;
        logger.info(`Progress update #${progressCount} sent for step=${stepId} (${formatElapsed(elapsed)})`);
      } else {
        // Possible rate limit — back off by doubling the interval
        progressIntervalMs = Math.min(progressIntervalMs * 2, 600_000); // max 10 minutes
        logger.warn(`Progress message failed for step=${stepId}, increasing interval to ${progressIntervalMs}ms`);
      }
    }

    // Sleep for a short interval before next check
    await sleep(5_000);
  }

  cleanup();
  logger.info(`Heartbeat exited for step=${stepId} after ${formatElapsed(Date.now() - startTime)}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
