import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { execFile } from "node:child_process";

interface GatewayConfig {
  url: string;
  token?: string;
  /** Unified auth secret — the value to send in the Bearer header.
   *  Resolves to `token` when auth mode is "token", or `password` when auth mode is "password". */
  secret?: string;
}

/**
 * Resolve ${ENV_VAR} placeholders the way the gateway does when it loads its own
 * config. openclaw.json may store secrets as "${OPENCLAW_GATEWAY_TOKEN}"; the gateway
 * interpolates these at startup, but a plain JSON.parse here does not — which would
 * send the literal placeholder as the Bearer token and get a 401.
 */
function resolveEnvPlaceholders(value: string | undefined): string | undefined {
  if (typeof value !== "string") return value;
  return value.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (match, name) => {
    const resolved = process.env[name];
    return resolved !== undefined ? resolved : match;
  });
}

async function readOpenClawConfig(): Promise<{
  port?: number;
  token?: string;
  authMode?: "token" | "password";
  password?: string;
}> {
  const configPath = path.join(os.homedir(), ".openclaw", "openclaw.json");
  try {
    const content = await fs.readFile(configPath, "utf-8");
    const config = JSON.parse(content);
    return {
      port: config.gateway?.port,
      token: resolveEnvPlaceholders(config.gateway?.auth?.token),
      authMode: config.gateway?.auth?.mode as "token" | "password" | undefined,
      password:
        process.env.OPENCLAW_GATEWAY_PASSWORD ??
        resolveEnvPlaceholders(config.gateway?.auth?.password),
    };
  } catch {
    return {};
  }
}

async function getGatewayConfig(): Promise<GatewayConfig> {
  const config = await readOpenClawConfig();
  const port = config.port ?? 18789;

  // Compute a unified secret: use password when mode is "password", otherwise use token.
  // The gateway accepts Bearer <secret> for both modes — it just compares against the
  // configured token or password depending on the auth mode.
  let secret: string | undefined;
  if (config.authMode === "password") {
    secret = config.password;
  } else {
    secret = config.token;
  }

  return {
    url: `http://127.0.0.1:${port}`,
    token: config.token,
    secret,
  };
}

// ---------------------------------------------------------------------------
// OpenClaw CLI fallback helpers
// ---------------------------------------------------------------------------

let cachedBinary: string | null = null;
// On Windows this holds the openclaw.mjs path; runCli spawns it via `node <mjs>`.
let cachedWinMjs: string | null = null;

/** Locate the openclaw binary. Checks PATH, then ~/.npm-global/bin, then npx. */
async function findOpenclawBinary(): Promise<string> {
  if (cachedBinary) return cachedBinary;

  // On Windows the PATH launcher is `openclaw.cmd`, but invoking it (directly or via
  // `cmd.exe /c`) corrupts multi-line arguments — cron prompts contain newlines, and
  // the shell layer drops trailing flags like `--no-deliver`. The .cmd is just a thin
  // wrapper around `node node_modules/openclaw/openclaw.mjs %*`, so locate that .mjs and
  // run it directly with `node` (see runCli) for a clean argv array, no shell involved.
  if (process.platform === "win32") {
    const mjsCandidates = [
      path.join(process.env.APPDATA ?? "", "npm", "node_modules", "openclaw", "openclaw.mjs"),
      path.join(os.homedir(), "AppData", "Roaming", "npm", "node_modules", "openclaw", "openclaw.mjs"),
    ];
    for (const c of mjsCandidates) {
      try { await fs.access(c); cachedWinMjs = c; cachedBinary = c; return cachedBinary; } catch { /* skip */ }
    }
    cachedBinary = "openclaw.cmd"; // last resort
    return cachedBinary;
  }

  // 1. Check PATH via `which`
  const fromPath = await new Promise<string | null>((resolve) => {
    execFile("which", ["openclaw"], (err, stdout) => {
      if (!err && stdout.trim()) resolve(stdout.trim());
      else resolve(null);
    });
  });
  if (fromPath) { cachedBinary = fromPath; return fromPath; }

  // 2. Check common global install locations
  const candidates = [
    path.join(os.homedir(), ".npm-global", "bin", "openclaw"),
    "/usr/local/bin/openclaw",
    "/opt/homebrew/bin/openclaw",
  ];
  for (const c of candidates) {
    try {
      await fs.access(c, 0o1 /* fs.constants.X_OK */);
      cachedBinary = c;
      return c;
    } catch { /* skip */ }
  }

  // 3. Fall back to npx
  cachedBinary = "npx";
  return "npx";
}

/** Run an openclaw CLI command and return stdout. */
function runCli(args: string[]): Promise<string> {
  return new Promise(async (resolve, reject) => {
    const bin = await findOpenclawBinary();
    const finalArgs = bin === "npx" ? ["openclaw", ...args] : args;

    // Windows: spawn the openclaw.mjs entrypoint directly with `node` and an argv array
    // so multi-line cron prompts and trailing flags survive (no shell / no .cmd wrapper
    // to mangle them — a shell string splits on the newlines in cron prompts and drops
    // flags like --no-deliver).
    if (process.platform === "win32" && cachedWinMjs) {
      execFile(
        process.execPath, // the node binary currently running
        [cachedWinMjs, ...finalArgs],
        { timeout: 30_000, maxBuffer: 10 * 1024 * 1024 },
        (err, stdout, stderr) => {
          if (err) reject(new Error(stderr || err.message));
          else resolve(stdout);
        },
      );
      return;
    }

    execFile(bin, finalArgs, { timeout: 30_000 }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr || err.message));
      else resolve(stdout);
    });
  });
}

const UPDATE_HINT =
  `This may be fixed by updating OpenClaw: npm update -g openclaw`;

function isTransientGatewayFailure(status: number | undefined): boolean {
  if (status === undefined) return true;
  return status === 404 || status >= 500;
}

// ---------------------------------------------------------------------------
// Cron operations — HTTP first, CLI fallback
// ---------------------------------------------------------------------------

export async function createAgentCronJob(job: {
  name: string;
  schedule: { kind: string; everyMs?: number; anchorMs?: number };
  sessionTarget: string;
  agentId: string;
  payload: { kind: string; message: string; model?: string; timeoutSeconds?: number };
  delivery?: { mode: "none" | "announce"; channel?: string; to?: string };
  enabled: boolean;
}): Promise<{ ok: boolean; error?: string; id?: string }> {
  // --- Try HTTP first ---
  const httpResult = await createAgentCronJobHTTP(job);
  if (httpResult !== null) return httpResult;

  // --- Fallback to CLI ---
  try {
    const args = ["cron", "add", "--json", "--name", job.name];

    if (job.schedule.kind === "every" && job.schedule.everyMs) {
      args.push("--every", `${job.schedule.everyMs}ms`);
    }

    args.push("--session", job.sessionTarget === "isolated" ? "isolated" : "main");

    if (job.agentId) {
      args.push("--agent", job.agentId);
    }

    if (job.payload?.message) {
      args.push("--message", job.payload.message);
    }

    // NOTE: do NOT pass payload.timeoutSeconds as `--timeout`. For `cron add`,
    // `--timeout` is the gateway *connect* timeout in MILLISECONDS, not the agent-turn
    // timeout in seconds. Passing e.g. 120 made the CLI abort with
    // "gateway timeout after 120ms", so the cron was never created. The agent-turn
    // timeout is part of the job payload itself, not a CLI connect option.

    if (job.payload?.model) {
      args.push("--model", job.payload.model);
    }

    // The openclaw CLI defaults to announce+last-channel when no delivery flag is
    // given. For antfarm polling crons (mode "none") that means it tries to announce
    // to the last channel (e.g. Telegram) WITHOUT a chatId, which makes every cron
    // run fail ("Delivering to Telegram requires target <chatId>") and stalls the
    // pipeline. Explicitly disable delivery when mode is not "announce".
    if (job.delivery?.mode === "announce") {
      args.push("--announce");
    } else {
      args.push("--no-deliver");
    }

    if (!job.enabled) {
      args.push("--disabled");
    }

    const stdout = await runCli(args);
    // Try to parse JSON output for the job id
    try {
      const parsed = JSON.parse(stdout);
      return { ok: true, id: parsed.id ?? parsed.jobId };
    } catch {
      // CLI succeeded but output wasn't JSON — still ok
      return { ok: true };
    }
  } catch (err) {
    return { ok: false, error: `CLI fallback failed: ${err}. ${UPDATE_HINT}` };
  }
}

/** HTTP-only attempt. Returns null on 404 (signals: use CLI fallback). */
async function createAgentCronJobHTTP(job: {
  name: string;
  schedule: { kind: string; everyMs?: number; anchorMs?: number };
  sessionTarget: string;
  agentId: string;
  payload: { kind: string; message: string; model?: string; timeoutSeconds?: number };
  delivery?: { mode: "none" | "announce"; channel?: string; to?: string };
  enabled: boolean;
}): Promise<{ ok: boolean; error?: string; id?: string } | null> {
  const gateway = await getGatewayConfig();
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (gateway.secret) headers["Authorization"] = `Bearer ${gateway.secret}`;

    const response = await fetch(`${gateway.url}/tools/invoke`, {
      method: "POST",
      headers,
      body: JSON.stringify({ tool: "cron", args: { action: "add", job }, sessionKey: "agent:main:main" }),
    });

    if (isTransientGatewayFailure(response.status)) return null; // signal CLI fallback

    if (!response.ok) {
      const text = await response.text();
      return { ok: false, error: `Gateway returned ${response.status}: ${text}` };
    }

    const result = await response.json();
    if (!result.ok) {
      return { ok: false, error: result.error?.message ?? "Unknown error" };
    }
    return { ok: true, id: result.result?.id };
  } catch {
    return null; // network error → try CLI
  }
}

/**
 * Preflight check: verify cron is accessible (HTTP or CLI).
 */
export async function checkCronToolAvailable(): Promise<{ ok: boolean; error?: string }> {
  // Try HTTP
  const gateway = await getGatewayConfig();
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (gateway.secret) headers["Authorization"] = `Bearer ${gateway.secret}`;

    const response = await fetch(`${gateway.url}/tools/invoke`, {
      method: "POST",
      headers,
      body: JSON.stringify({ tool: "cron", args: { action: "list" } }),
    });

    if (response.ok) return { ok: true };

    if (isTransientGatewayFailure(response.status)) {
      // fall through to CLI fallback
    } else {
      const text = await response.text();
      return { ok: false, error: `Gateway returned ${response.status}: ${text}` };
    }
  } catch {
    // network error — fall through to CLI check
  }

  // Try CLI fallback
  try {
    await runCli(["cron", "list", "--json"]);
    return { ok: true };
  } catch {
    return {
      ok: false,
      error: `Cannot access cron: neither the /tools/invoke HTTP endpoint nor the openclaw CLI are available. ${UPDATE_HINT}`,
    };
  }
}

export async function listCronJobs(): Promise<{ ok: boolean; jobs?: Array<{ id: string; name: string }>; error?: string }> {
  // --- Try HTTP first ---
  const httpResult = await listCronJobsHTTP();
  if (httpResult !== null) return httpResult;

  // --- CLI fallback ---
  try {
    const stdout = await runCli(["cron", "list", "--json", "--all"]);
    const parsed = JSON.parse(stdout);
    const jobs: Array<{ id: string; name: string }> = parsed.jobs ?? parsed ?? [];
    return { ok: true, jobs };
  } catch (err) {
    return { ok: false, error: `CLI fallback failed: ${err}. ${UPDATE_HINT}` };
  }
}

/** HTTP-only list. Returns null on 404/network error. */
async function listCronJobsHTTP(): Promise<{ ok: boolean; jobs?: Array<{ id: string; name: string }>; error?: string } | null> {
  const gateway = await getGatewayConfig();
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (gateway.secret) headers["Authorization"] = `Bearer ${gateway.secret}`;

    const response = await fetch(`${gateway.url}/tools/invoke`, {
      method: "POST",
      headers,
      body: JSON.stringify({ tool: "cron", args: { action: "list" }, sessionKey: "agent:main:main" }),
    });

    if (isTransientGatewayFailure(response.status)) return null;

    if (!response.ok) {
      return { ok: false, error: `Gateway returned ${response.status}` };
    }

    const result = await response.json();
    if (!result.ok) {
      return { ok: false, error: result.error?.message ?? "Unknown error" };
    }

    let jobs: Array<{ id: string; name: string }> = [];
    const content = result.result?.content;
    if (Array.isArray(content) && content[0]?.text) {
      try {
        const parsed = JSON.parse(content[0].text);
        jobs = parsed.jobs ?? [];
      } catch { /* fallback */ }
    }
    if (jobs.length === 0) {
      jobs = result.result?.jobs ?? result.jobs ?? [];
    }
    return { ok: true, jobs };
  } catch {
    return null;
  }
}

export async function deleteCronJob(jobId: string): Promise<{ ok: boolean; error?: string }> {
  // --- Try HTTP first ---
  const httpResult = await deleteCronJobHTTP(jobId);
  if (httpResult !== null) return httpResult;

  // --- CLI fallback ---
  try {
    await runCli(["cron", "rm", jobId, "--json"]);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: `CLI fallback failed: ${err}. ${UPDATE_HINT}` };
  }
}

/** HTTP-only delete. Returns null on 404/network error. */
async function deleteCronJobHTTP(jobId: string): Promise<{ ok: boolean; error?: string } | null> {
  const gateway = await getGatewayConfig();
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (gateway.secret) headers["Authorization"] = `Bearer ${gateway.secret}`;

    const response = await fetch(`${gateway.url}/tools/invoke`, {
      method: "POST",
      headers,
      body: JSON.stringify({ tool: "cron", args: { action: "remove", id: jobId }, sessionKey: "agent:main:main" }),
    });

    if (isTransientGatewayFailure(response.status)) return null;

    if (!response.ok) {
      return { ok: false, error: `Gateway returned ${response.status}` };
    }

    const result = await response.json();
    return result.ok ? { ok: true } : { ok: false, error: result.error?.message ?? "Unknown error" };
  } catch {
    return null;
  }
}

export async function deleteAgentCronJobs(namePrefix: string): Promise<void> {
  const listResult = await listCronJobs();
  if (!listResult.ok || !listResult.jobs) return;

  for (const job of listResult.jobs) {
    if (job.name.startsWith(namePrefix)) {
      await deleteCronJob(job.id);
    }
  }
}

export async function sendSessionMessage(params: { sessionKey: string; message: string }): Promise<{ ok: boolean; error?: string }> {
  const payload = {
    tool: "sessions_send",
    args: {
      action: "send",
      message: params.message,
      sessionKey: params.sessionKey,
    },
    sessionKey: params.sessionKey,
  };

  // --- Try HTTP first ---
  const gateway = await getGatewayConfig();
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (gateway.secret) headers["Authorization"] = `Bearer ${gateway.secret}`;

    const response = await fetch(`${gateway.url}/tools/invoke`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      const result = await response.json();
      return result.ok ? { ok: true } : { ok: false, error: result.error?.message ?? "Unknown error" };
    }

    if (isTransientGatewayFailure(response.status)) {
      // fallback to CLI
    } else {
      const text = await response.text();
      return { ok: false, error: `Gateway returned ${response.status}: ${text}` };
    }
  } catch {
    // fallback to CLI
  }

  // --- Fallback to CLI ---
  try {
    await runCli([
      "tool",
      "run",
      "--tool",
      "sessions_send",
      "--session",
      params.sessionKey,
      "--json",
      "--message",
      params.message,
    ]);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: `CLI fallback failed: ${err}. ${UPDATE_HINT}` };
  }
}
