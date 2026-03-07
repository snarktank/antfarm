import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolveAntfarmDashboardLogPath, resolveAntfarmDashboardPidPath } from "../installer/paths.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function getPidFile(): string {
  return resolveAntfarmDashboardPidPath();
}

export function getLogFile(): string {
  return resolveAntfarmDashboardLogPath();
}

export function isRunning(): { running: true; pid: number } | { running: false } {
  const pidFile = getPidFile();
  if (!fs.existsSync(pidFile)) return { running: false };
  const pid = parseInt(fs.readFileSync(pidFile, "utf-8").trim(), 10);
  if (isNaN(pid)) return { running: false };
  try {
    process.kill(pid, 0);
    return { running: true, pid };
  } catch {
    // Stale PID file
    try { fs.unlinkSync(pidFile); } catch {}
    return { running: false };
  }
}

export async function startDaemon(port = 3333): Promise<{ pid: number; port: number }> {
  const status = isRunning();
  if (status.running) {
    return { pid: status.pid, port };
  }

  const logFile = getLogFile();
  const pidDir = path.dirname(getPidFile());
  fs.mkdirSync(pidDir, { recursive: true });

  const out = fs.openSync(logFile, "a");
  const err = fs.openSync(logFile, "a");

  const daemonScript = path.resolve(__dirname, "daemon.js");
  const child = spawn("node", [daemonScript, String(port)], {
    detached: true,
    stdio: ["ignore", out, err],
  });
  child.unref();

  // Wait 1s then confirm
  await new Promise((r) => setTimeout(r, 1000));

  const check = isRunning();
  if (!check.running) {
    throw new Error("Daemon failed to start. Check " + logFile);
  }
  return { pid: check.pid, port };
}

export function stopDaemon(): boolean {
  const status = isRunning();
  if (!status.running) return false;
  try {
    process.kill(status.pid, "SIGTERM");
  } catch {}
  try { fs.unlinkSync(getPidFile()); } catch {}
  return true;
}

export function getDaemonStatus(): { running: boolean; pid?: number; port?: number } | null {
  const status = isRunning();
  if (!status.running) return { running: false };
  return { running: true, pid: status.pid };
}
