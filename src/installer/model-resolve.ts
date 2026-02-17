import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

export type OpenClawConfigModels = {
  agents?: {
    defaults?: {
      model?: {
        primary?: string;
        fallbacks?: string[];
      };
    };
  };
};

async function readOpenClawConfig(): Promise<OpenClawConfigModels | null> {
  const configPath = path.join(os.homedir(), ".openclaw", "openclaw.json");
  try {
    const raw = await fs.readFile(configPath, "utf-8");
    return JSON.parse(raw) as OpenClawConfigModels;
  } catch {
    return null;
  }
}

export async function getDefaultPrimaryModelId(): Promise<string | undefined> {
  const cfg = await readOpenClawConfig();
  return cfg?.agents?.defaults?.model?.primary;
}

export async function getDefaultFallbackModelId(): Promise<string | undefined> {
  const cfg = await readOpenClawConfig();
  const fallbacks = cfg?.agents?.defaults?.model?.fallbacks;
  return Array.isArray(fallbacks) && fallbacks.length > 0 ? fallbacks[0] : undefined;
}

/**
 * Resolve a model id coming from workflow config.
 *
 * If input is undefined/empty/"default", translate it to a real configured model id.
 * If we can't read config, return undefined to let OpenClaw defaults handle it.
 */
export async function resolveModelId(input?: string, opts?: { preferFallback?: boolean }): Promise<string | undefined> {
  const normalized = (input ?? "").trim();
  const isDefault = normalized === "" || normalized.toLowerCase() === "default";
  if (!isDefault) return input;

  if (opts?.preferFallback) {
    return (await getDefaultFallbackModelId()) ?? (await getDefaultPrimaryModelId());
  }
  return (await getDefaultPrimaryModelId()) ?? (await getDefaultFallbackModelId());
}
