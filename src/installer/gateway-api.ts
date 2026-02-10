import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

interface GatewayConfig {
  url: string;
  token?: string;
}

async function readOpenClawConfig(): Promise<{ port?: number; token?: string }> {
  const configPath = path.join(os.homedir(), ".openclaw", "openclaw.json");
  try {
    const content = await fs.readFile(configPath, "utf-8");
    const config = JSON.parse(content);
    return {
      port: config.gateway?.port,
      token: config.gateway?.auth?.token,
    };
  } catch {
    return {};
  }
}

async function getGatewayConfig(): Promise<GatewayConfig> {
  const config = await readOpenClawConfig();
  const port = config.port ?? 18789;
  return {
    url: `http://127.0.0.1:${port}`,
    token: config.token,
  };
}

export async function createAgentCronJob(job: {
  name: string;
  schedule: { kind: string; everyMs?: number; anchorMs?: number };
  sessionTarget: string;
  agentId: string;
  payload: { kind: string; message: string };
  enabled: boolean;
}): Promise<{ ok: boolean; error?: string; id?: string }> {
  const gateway = await getGatewayConfig();

  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (gateway.token) headers["Authorization"] = `Bearer ${gateway.token}`;

    const response = await fetch(`${gateway.url}/tools/invoke`, {
      method: "POST",
      headers,
      body: JSON.stringify({ tool: "cron", args: { action: "add", job }, sessionKey: "global" }),
    });

    if (!response.ok) {
      const text = await response.text();
      if (response.status === 404) {
        return {
          ok: false,
          error: `The 'cron' tool is not available via the OpenClaw HTTP API (404). `
            + `This usually means your tool policy restricts access. `
            + `Check your tools.profile or tools.allow configuration in openclaw.json.`,
        };
      }
      return { ok: false, error: `Gateway returned ${response.status}: ${text}` };
    }

    const result = await response.json();
    if (!result.ok) {
      return { ok: false, error: result.error?.message ?? "Unknown error" };
    }
    return { ok: true, id: result.result?.id };
  } catch (err) {
    return { ok: false, error: `Failed to call gateway: ${err}` };
  }
}

/**
 * Preflight check: verify the cron tool is accessible via /tools/invoke.
 * Returns { ok: true } if accessible, or { ok: false, error } with a helpful message.
 */
export async function checkCronToolAvailable(): Promise<{ ok: boolean; error?: string }> {
  const gateway = await getGatewayConfig();
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (gateway.token) headers["Authorization"] = `Bearer ${gateway.token}`;

    const response = await fetch(`${gateway.url}/tools/invoke`, {
      method: "POST",
      headers,
      body: JSON.stringify({ tool: "cron", args: { action: "list" } }),
    });

    if (response.status === 404) {
      return {
        ok: false,
        error: `Cannot create cron jobs: the 'cron' tool is not available via the OpenClaw HTTP API. `
          + `Check your tools.profile or tools.allow configuration in openclaw.json.`,
      };
    }

    if (!response.ok) {
      const text = await response.text();
      return { ok: false, error: `Gateway returned ${response.status}: ${text}` };
    }

    return { ok: true };
  } catch (err) {
    return { ok: false, error: `Cannot reach OpenClaw gateway: ${err}` };
  }
}

export async function listCronJobs(): Promise<{ ok: boolean; jobs?: Array<{ id: string; name: string }>; error?: string }> {
  const gateway = await getGatewayConfig();

  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (gateway.token) headers["Authorization"] = `Bearer ${gateway.token}`;

    const response = await fetch(`${gateway.url}/tools/invoke`, {
      method: "POST",
      headers,
      body: JSON.stringify({ tool: "cron", args: { action: "list" }, sessionKey: "global" }),
    });

    if (!response.ok) {
      return { ok: false, error: `Gateway returned ${response.status}` };
    }

    const result = await response.json();
    if (!result.ok) {
      return { ok: false, error: result.error?.message ?? "Unknown error" };
    }
    // Gateway returns tool-call format: result.content[0].text is a JSON string
    let jobs: Array<{ id: string; name: string }> = [];
    const content = result.result?.content;
    if (Array.isArray(content) && content[0]?.text) {
      try {
        const parsed = JSON.parse(content[0].text);
        jobs = parsed.jobs ?? [];
      } catch {
        // fallback
      }
    }
    if (jobs.length === 0) {
      jobs = result.result?.jobs ?? result.jobs ?? [];
    }
    return { ok: true, jobs };
  } catch (err) {
    return { ok: false, error: `Failed to call gateway: ${err}` };
  }
}

export async function deleteCronJob(jobId: string): Promise<{ ok: boolean; error?: string }> {
  const gateway = await getGatewayConfig();

  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (gateway.token) headers["Authorization"] = `Bearer ${gateway.token}`;

    const response = await fetch(`${gateway.url}/tools/invoke`, {
      method: "POST",
      headers,
      body: JSON.stringify({ tool: "cron", args: { action: "remove", id: jobId }, sessionKey: "global" }),
    });

    if (!response.ok) {
      return { ok: false, error: `Gateway returned ${response.status}` };
    }

    const result = await response.json();
    return result.ok ? { ok: true } : { ok: false, error: result.error?.message ?? "Unknown error" };
  } catch (err) {
    return { ok: false, error: `Failed to call gateway: ${err}` };
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
