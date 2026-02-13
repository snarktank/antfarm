import { execFile, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { logger } from "../lib/logger.js";
import { getDb } from "../db.js";
import { loadConfig } from "../config.js";
import { isSystemdAvailable, getSliceName } from "../installer/resource-limits.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface WorkerSpawnOptions {
  agentId: string;
  stepId: string;
  model: string;
  workPromptFile: string;
  logFile: string;
}

export interface WorkerHandle {
  pid: number;
  agentId: string;
  stepId: string;
  model: string;
  spawnedAt: Date;
  unitName: string | null;
  spawnMethod: "systemd" | "nohup";
}

/**
 * Resolve the path to the spawn-worker-systemd.sh script.
 * From dist/worker/process-manager.js -> ../../scripts/spawn-worker-systemd.sh
 */
function resolveSpawnScript(): string {
  return path.resolve(__dirname, "..", "..", "scripts", "spawn-worker-systemd.sh");
}

/**
 * Resolve the claude CLI path.
 */
function resolveClaudeCli(): string {
  return process.env.CLAUDE_CLI ?? "/home/motobot/.local/bin/claude";
}

/**
 * Manages worker process spawning, tracking, and lifecycle.
 * Workers are spawned via systemd-run when available for resource isolation,
 * falling back to nohup when systemd is unavailable.
 */
export class WorkerProcessManager {
  /**
   * Spawn a worker process with resource isolation.
   * Uses systemd-run when available, falls back to nohup.
   */
  async spawnWorker(opts: WorkerSpawnOptions): Promise<WorkerHandle> {
    const { agentId, stepId, model, workPromptFile, logFile } = opts;

    try {
      const handle = await this.spawnViaSystemd(opts);
      this.recordWorker(handle);
      logger.info(`Worker spawned via systemd: PID=${handle.pid} step=${stepId} agent=${agentId}`);
      return handle;
    } catch (err) {
      logger.warn(`systemd-run spawn failed, falling back to nohup: ${err instanceof Error ? err.message : String(err)}`);
      const handle = await this.spawnViaNohup(opts);
      this.recordWorker(handle);
      logger.info(`Worker spawned via nohup: PID=${handle.pid} step=${stepId} agent=${agentId}`);
      return handle;
    }
  }

  /**
   * Spawn worker via systemd-run with cgroup resource limits.
   */
  private async spawnViaSystemd(opts: WorkerSpawnOptions): Promise<WorkerHandle> {
    const systemdAvailable = await isSystemdAvailable();
    if (!systemdAvailable) {
      throw new Error("systemd not available");
    }

    const { agentId, stepId, model, workPromptFile, logFile } = opts;
    const claudeCli = resolveClaudeCli();
    const sliceName = getSliceName();
    const config = loadConfig();
    const unitName = `antfarm-worker-${stepId}`;

    const workPrompt = fs.readFileSync(workPromptFile, "utf-8");

    return new Promise<WorkerHandle>((resolve, reject) => {
      // Unset CLAUDECODE to allow nested sessions
      const env = { ...process.env };
      delete env.CLAUDECODE;

      const logStream = fs.openSync(logFile, "w");

      const child = spawn("systemd-run", [
        "--user", "--scope",
        `--unit=${unitName}`,
        `--slice=${sliceName}`,
        `-p`, `Nice=${config.resourceLimits.nice}`,
        "--",
        claudeCli, "-p",
        "--model", model,
        "--output-format", "json",
        "--dangerously-skip-permissions",
        workPrompt,
      ], {
        detached: true,
        stdio: ["ignore", logStream, logStream],
        env,
      });

      if (!child.pid) {
        fs.closeSync(logStream);
        reject(new Error("Failed to get PID from systemd-run spawn"));
        return;
      }

      const handle: WorkerHandle = {
        pid: child.pid,
        agentId,
        stepId,
        model,
        spawnedAt: new Date(),
        unitName,
        spawnMethod: "systemd",
      };

      child.unref();
      fs.closeSync(logStream);
      resolve(handle);
    });
  }

  /**
   * Spawn worker via nohup (fallback when systemd unavailable).
   */
  private async spawnViaNohup(opts: WorkerSpawnOptions): Promise<WorkerHandle> {
    const { agentId, stepId, model, workPromptFile, logFile } = opts;
    const claudeCli = resolveClaudeCli();

    const workPrompt = fs.readFileSync(workPromptFile, "utf-8");

    return new Promise<WorkerHandle>((resolve, reject) => {
      const env = { ...process.env };
      delete env.CLAUDECODE;

      const logStream = fs.openSync(logFile, "w");

      const child = spawn(claudeCli, [
        "-p",
        "--model", model,
        "--output-format", "json",
        "--dangerously-skip-permissions",
        workPrompt,
      ], {
        detached: true,
        stdio: ["ignore", logStream, logStream],
        env,
      });

      if (!child.pid) {
        fs.closeSync(logStream);
        reject(new Error("Failed to get PID from nohup spawn"));
        return;
      }

      const handle: WorkerHandle = {
        pid: child.pid,
        agentId,
        stepId,
        model,
        spawnedAt: new Date(),
        unitName: null,
        spawnMethod: "nohup",
      };

      child.unref();
      fs.closeSync(logStream);
      resolve(handle);
    });
  }

  /**
   * Record a spawned worker in the database.
   */
  private recordWorker(handle: WorkerHandle): void {
    try {
      const db = getDb();
      db.prepare(
        `INSERT INTO workers (pid, agent_id, step_id, model, unit_name, status, spawned_at)
         VALUES (?, ?, ?, ?, ?, 'running', ?)`
      ).run(
        handle.pid,
        handle.agentId,
        handle.stepId,
        handle.model,
        handle.unitName,
        handle.spawnedAt.toISOString(),
      );
    } catch (err) {
      logger.warn(`Failed to record worker in DB: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * Kill a worker process by PID.
   * If spawned via systemd, stops the systemd scope unit.
   * Otherwise sends SIGTERM, then SIGKILL after 5 seconds.
   */
  async killWorker(pid: number): Promise<void> {
    const worker = this.getWorkerByPid(pid);

    if (worker?.unit_name) {
      // Try systemd stop first
      try {
        await this.systemctlStop(worker.unit_name);
        logger.info(`Killed worker via systemctl stop: PID=${pid} unit=${worker.unit_name}`);
      } catch (err) {
        logger.warn(`systemctl stop failed, sending SIGTERM: ${err instanceof Error ? err.message : String(err)}`);
        this.signalKill(pid);
      }
    } else {
      this.signalKill(pid);
    }

    this.markWorkerCompleted(pid, "killed");
  }

  /**
   * Stop a systemd scope unit.
   */
  private systemctlStop(unitName: string): Promise<void> {
    return new Promise((resolve, reject) => {
      execFile("systemctl", ["--user", "stop", `${unitName}.scope`], { timeout: 10_000 }, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  /**
   * Kill a process via signals (SIGTERM, then SIGKILL after 5s).
   */
  private signalKill(pid: number): void {
    try {
      process.kill(pid, "SIGTERM");
      logger.info(`Sent SIGTERM to worker PID=${pid}`);

      // Schedule SIGKILL as backup
      setTimeout(() => {
        try {
          process.kill(pid, 0); // check if still alive
          process.kill(pid, "SIGKILL");
          logger.info(`Sent SIGKILL to worker PID=${pid}`);
        } catch {
          // Process already dead — good
        }
      }, 5000);
    } catch {
      // Process already dead or permission denied
    }
  }

  /**
   * Get all active (running) workers from the database.
   */
  async getActiveWorkers(): Promise<WorkerHandle[]> {
    try {
      const db = getDb();
      const rows = db.prepare(
        "SELECT pid, agent_id, step_id, model, unit_name, spawned_at FROM workers WHERE status = 'running'"
      ).all() as Array<{
        pid: number;
        agent_id: string;
        step_id: string;
        model: string;
        unit_name: string | null;
        spawned_at: string;
      }>;

      return rows.map((row) => ({
        pid: row.pid,
        agentId: row.agent_id,
        stepId: row.step_id,
        model: row.model,
        spawnedAt: new Date(row.spawned_at),
        unitName: row.unit_name,
        spawnMethod: (row.unit_name ? "systemd" : "nohup") as "systemd" | "nohup",
      }));
    } catch (err) {
      logger.warn(`Failed to get active workers: ${err instanceof Error ? err.message : String(err)}`);
      return [];
    }
  }

  /**
   * Check if a worker process is still alive.
   */
  isWorkerAlive(pid: number): boolean {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get a worker record by PID from the database.
   */
  private getWorkerByPid(pid: number): { unit_name: string | null; step_id: string } | null {
    try {
      const db = getDb();
      return db.prepare(
        "SELECT unit_name, step_id FROM workers WHERE pid = ? AND status = 'running'"
      ).get(pid) as { unit_name: string | null; step_id: string } | undefined ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Mark a worker as completed (or killed/failed) in the database.
   */
  markWorkerCompleted(pid: number, status: "completed" | "killed" | "failed" = "completed"): void {
    try {
      const db = getDb();
      db.prepare(
        "UPDATE workers SET status = ?, completed_at = ? WHERE pid = ? AND status = 'running'"
      ).run(status, new Date().toISOString(), pid);
    } catch (err) {
      logger.warn(`Failed to mark worker completed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * Clean up stale worker records (processes that are no longer running).
   */
  async cleanupStaleWorkers(): Promise<number> {
    const activeWorkers = await this.getActiveWorkers();
    let cleaned = 0;

    for (const worker of activeWorkers) {
      if (!this.isWorkerAlive(worker.pid)) {
        this.markWorkerCompleted(worker.pid, "failed");
        cleaned++;
        logger.info(`Cleaned stale worker: PID=${worker.pid} step=${worker.stepId}`);
      }
    }

    return cleaned;
  }
}
