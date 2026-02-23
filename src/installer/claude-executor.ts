import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

const LOG_DIR = path.join(os.homedir(), ".openclaw", "antfarm", "agent-logs");

let cachedClaudeBinary: string | null = null;

/**
 * Locate the `claude` CLI binary.
 * Checks ANTFARM_CLAUDE_PATH env, then common install locations, then PATH.
 */
export async function findClaudeBinary(): Promise<string | null> {
  if (cachedClaudeBinary) return cachedClaudeBinary;

  // 1. Explicit env override
  const envPath = process.env.ANTFARM_CLAUDE_PATH?.trim();
  if (envPath) {
    try {
      fs.accessSync(envPath, fs.constants.X_OK);
      cachedClaudeBinary = envPath;
      return envPath;
    } catch {
      // env var set but binary not found — fall through
    }
  }

  // 2. Common install locations
  const candidates = [
    path.join(os.homedir(), ".local", "bin", "claude"),
    path.join(os.homedir(), ".claude", "local", "claude"),
    "/usr/local/bin/claude",
    "/opt/homebrew/bin/claude",
  ];

  for (const c of candidates) {
    try {
      fs.accessSync(c, fs.constants.X_OK);
      cachedClaudeBinary = c;
      return c;
    } catch { /* skip */ }
  }

  // 3. Check PATH via `which`
  const fromPath = await new Promise<string | null>((resolve) => {
    const proc = spawn("which", ["claude"], { stdio: ["ignore", "pipe", "ignore"] });
    let out = "";
    proc.stdout.on("data", (d: Buffer) => { out += d.toString(); });
    proc.on("close", (code) => {
      if (code === 0 && out.trim()) resolve(out.trim());
      else resolve(null);
    });
    proc.on("error", () => resolve(null));
  });

  if (fromPath) {
    cachedClaudeBinary = fromPath;
    return fromPath;
  }

  return null;
}

/** Reset cached binary (for testing). */
export function resetClaudeBinaryCache(): void {
  cachedClaudeBinary = null;
}

export interface ClaudeExecutionResult {
  ok: boolean;
  output: string;
  exitCode: number | null;
  timedOut: boolean;
}

/**
 * Execute a prompt via the Claude Code CLI.
 *
 * Spawns `claude -p --dangerously-skip-permissions` with the prompt piped via stdin
 * to avoid shell escaping issues. Clears CLAUDECODE env var to prevent nested-session
 * detection. Logs output to ~/.openclaw/antfarm/agent-logs/.
 */
export async function executeClaudePrompt(
  agentId: string,
  prompt: string,
): Promise<ClaudeExecutionResult> {
  const binary = await findClaudeBinary();
  if (!binary) {
    return {
      ok: false,
      output: "claude binary not found",
      exitCode: null,
      timedOut: false,
    };
  }

  fs.mkdirSync(LOG_DIR, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const safeAgentId = agentId.replace(/\//g, "__");
  const logFile = path.join(LOG_DIR, `${safeAgentId}_${timestamp}.log`);

  return new Promise<ClaudeExecutionResult>((resolve) => {
    // Strip env vars that cause nested-session detection
    const env = { ...process.env };
    delete env.CLAUDECODE;
    delete env.CLAUDE_CODE_SESSION;

    const proc = spawn(binary, ["-p", "--dangerously-skip-permissions"], {
      stdio: ["pipe", "pipe", "pipe"],
      env,
      timeout: TIMEOUT_MS,
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;

    const timer = setTimeout(() => {
      timedOut = true;
      proc.kill("SIGTERM");
      // Give it 5s to clean up, then force kill
      setTimeout(() => {
        if (!settled) proc.kill("SIGKILL");
      }, 5000);
    }, TIMEOUT_MS);

    proc.stdout.on("data", (d: Buffer) => { stdout += d.toString(); });
    proc.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });

    // Pipe prompt via stdin then close
    proc.stdin.write(prompt);
    proc.stdin.end();

    proc.on("close", (code) => {
      settled = true;
      clearTimeout(timer);

      const logContent = [
        `Agent: ${agentId}`,
        `Time: ${new Date().toISOString()}`,
        `Exit: ${code}`,
        `Timed out: ${timedOut}`,
        `--- STDOUT ---`,
        stdout,
        `--- STDERR ---`,
        stderr,
      ].join("\n");

      try {
        fs.writeFileSync(logFile, logContent);
      } catch {
        // best-effort logging
      }

      resolve({
        ok: code === 0,
        output: stdout,
        exitCode: code,
        timedOut,
      });
    });

    proc.on("error", (err) => {
      settled = true;
      clearTimeout(timer);
      resolve({
        ok: false,
        output: `spawn error: ${err.message}`,
        exitCode: null,
        timedOut: false,
      });
    });
  });
}
