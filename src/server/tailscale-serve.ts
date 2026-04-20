import { execFile } from "node:child_process";

export const DEFAULT_DASHBOARD_PORT = 3333;
export const DEFAULT_TAILSCALE_HTTPS_PORT = 4443;

function execFileAsync(command: string, args: string[], timeout = 15_000): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    execFile(command, args, { timeout }, (error, stdout, stderr) => {
      if (error) {
        const anyErr = error as NodeJS.ErrnoException & { code?: number | string };
        const exitCode = typeof anyErr.code === "number" ? anyErr.code : 1;
        reject(new Error(stderr?.trim() || stdout?.trim() || error.message || `Command failed: ${command}`));
        return;
      }
      resolve({ stdout, stderr, exitCode: 0 });
    });
  });
}

function hasExpectedProxy(status: any, localPort: number, httpsPort: number): boolean {
  const expected = `http://127.0.0.1:${localPort}`;
  const web = status?.Web;
  if (!web || typeof web !== "object") return false;

  for (const [hostPort, config] of Object.entries(web as Record<string, any>)) {
    if (!hostPort.endsWith(`:${httpsPort}`)) continue;
    const proxy = config?.Handlers?.["/"]?.Proxy;
    if (proxy === expected) return true;
  }

  return false;
}

export async function getDashboardServeStatus(localPort = DEFAULT_DASHBOARD_PORT, httpsPort = DEFAULT_TAILSCALE_HTTPS_PORT): Promise<{
  configured: boolean;
  url?: string;
  error?: string;
}> {
  try {
    const { stdout } = await execFileAsync("tailscale", ["serve", "status", "--json"]);
    const parsed = JSON.parse(stdout);
    const configured = hasExpectedProxy(parsed, localPort, httpsPort);
    const url = configured
      ? Object.keys(parsed?.Web ?? {}).find((hostPort) => hostPort.endsWith(`:${httpsPort}`))
      : undefined;
    return { configured, url: url ? `https://${url}` : undefined };
  } catch (error) {
    return { configured: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function ensureDashboardServe(localPort = DEFAULT_DASHBOARD_PORT, httpsPort = DEFAULT_TAILSCALE_HTTPS_PORT): Promise<{
  ok: boolean;
  changed: boolean;
  error?: string;
}> {
  const existing = await getDashboardServeStatus(localPort, httpsPort);
  if (existing.configured) {
    return { ok: true, changed: false };
  }

  try {
    await execFileAsync("tailscale", ["serve", "--bg", `--https=${httpsPort}`, `127.0.0.1:${localPort}`], 20_000);
  } catch (error) {
    return { ok: false, changed: false, error: error instanceof Error ? error.message : String(error) };
  }

  const after = await getDashboardServeStatus(localPort, httpsPort);
  if (after.configured) {
    return { ok: true, changed: true };
  }

  return { ok: false, changed: true, error: after.error ?? `tailscale serve did not attach :${httpsPort} -> 127.0.0.1:${localPort}` };
}
