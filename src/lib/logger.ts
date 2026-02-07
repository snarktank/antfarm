import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const LOG_DIR = path.join(os.homedir(), ".openclaw", "antfarm", "logs");
const LOG_FILE = path.join(LOG_DIR, "workflow.log");
const MAX_LOG_SIZE = 5 * 1024 * 1024; // 5MB

export type LogLevel = "info" | "warn" | "error" | "debug";

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  workflowId?: string;
  runId?: string;
  stepId?: string;
  message: string;
}

async function ensureLogDir(): Promise<void> {
  await fs.mkdir(LOG_DIR, { recursive: true });
}

async function rotateIfNeeded(): Promise<void> {
  try {
    const stats = await fs.stat(LOG_FILE);
    if (stats.size > MAX_LOG_SIZE) {
      const rotatedPath = `${LOG_FILE}.1`;
      await fs.rename(LOG_FILE, rotatedPath);
    }
  } catch {
    // File doesn't exist yet, no rotation needed
  }
}

function formatEntry(entry: LogEntry): string {
  const parts = [entry.timestamp, `[${entry.level.toUpperCase()}]`];
  
  if (entry.workflowId) {
    parts.push(`[${entry.workflowId}]`);
  }
  if (entry.runId) {
    parts.push(`[${entry.runId.slice(0, 8)}]`);
  }
  if (entry.stepId) {
    parts.push(`[${entry.stepId}]`);
  }
  
  parts.push(entry.message);
  return parts.join(" ");
}

export async function log(
  level: LogLevel,
  message: string,
  context?: { workflowId?: string; runId?: string; stepId?: string }
): Promise<void> {
  await ensureLogDir();
  await rotateIfNeeded();
  
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...context,
  };
  
  const line = formatEntry(entry) + "\n";
  await fs.appendFile(LOG_FILE, line, "utf-8");
}

export const logger = {
  info: (msg: string, ctx?: { workflowId?: string; runId?: string; stepId?: string }) => 
    log("info", msg, ctx),
  warn: (msg: string, ctx?: { workflowId?: string; runId?: string; stepId?: string }) => 
    log("warn", msg, ctx),
  error: (msg: string, ctx?: { workflowId?: string; runId?: string; stepId?: string }) => 
    log("error", msg, ctx),
  debug: (msg: string, ctx?: { workflowId?: string; runId?: string; stepId?: string }) => 
    log("debug", msg, ctx),
};

export async function readRecentLogs(lines: number = 50): Promise<string[]> {
  try {
    const content = await fs.readFile(LOG_FILE, "utf-8");
    const allLines = content.trim().split("\n");
    return allLines.slice(-lines);
  } catch {
    return [];
  }
}
