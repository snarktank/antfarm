/**
 * Mission Control integration module.
 * Fail-safe, opt-in reporting of lifecycle events to the Mission Control Convex backend.
 * If MISSION_CONTROL_URL is not set, all functions are silent no-ops.
 */

const BYTE_LIMIT = 2048;
const MESSAGE_CHAR_LIMIT = 500;

/** Minimal inline sanitizer (mirrors mission-control/src/sanitize.ts) */
export function sanitize(text: string): string {
  if (!text) return text;
  let s = text;
  s = s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");
  s = s.replace(/-----BEGIN\s[\w\s]+PRIVATE KEY-----[\s\S]*?-----END\s[\w\s]+PRIVATE KEY-----/g, "[PRIVATE_KEY]");
  s = s.replace(/\b(sk-[a-zA-Z0-9]{20,}|ghp_[a-zA-Z0-9]{36,}|gho_[a-zA-Z0-9]{36,}|ghs_[a-zA-Z0-9]{36,}|ghr_[a-zA-Z0-9]{36,}|xoxb-[a-zA-Z0-9\-]+|xoxp-[a-zA-Z0-9\-]+|AKIA[A-Z0-9]{16})\b/g, "[REDACTED]");
  s = s.replace(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g, "[EMAIL]");
  s = s.replace(/(\+?1[\s\-.]?)?\(?\d{3}\)?[\s\-.]?\d{3}[\s\-.]?\d{4}/g, "[PHONE]");
  s = s.replace(/(?:\/Users\/|\/home\/|C:\\Users\\)[^\s'",;)}\]]+/g, "[REDACTED_PATH]");
  s = s.replace(/(https?:\/\/[^\s?#]+)\?[^\s#]*/g, "$1");
  const encoder = new TextEncoder();
  let bytes = encoder.encode(s);
  if (bytes.length > BYTE_LIMIT) {
    const suffix = "[truncated]";
    const suffixBytes = encoder.encode(suffix);
    const truncated = bytes.slice(0, BYTE_LIMIT - suffixBytes.length);
    s = new TextDecoder().decode(truncated) + suffix;
  }
  if (s.length > MESSAGE_CHAR_LIMIT) {
    s = s.slice(0, MESSAGE_CHAR_LIMIT - 11) + "[truncated]";
  }
  return s;
}

function getUrl(): string | undefined {
  return process.env.MISSION_CONTROL_URL;
}

async function post(endpoint: string, body: Record<string, unknown>): Promise<void> {
  const url = getUrl();
  if (!url) return;
  try {
    const resp = await fetch(`${url.replace(/\/$/, "")}/${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    });
    if (!resp.ok) {
      console.warn(`[mission-control] ${endpoint} returned ${resp.status}: ${await resp.text().catch(() => "")}`);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[mission-control] Failed to POST ${endpoint}: ${msg}`);
  }
}

export interface ReportEventParams {
  actorId: string;
  actorName: string;
  eventType: string;
  message: string;
  workflowId?: string;
  runId?: string;
  stepId?: string;
  storyId?: string;
  metadata?: Record<string, unknown>;
  durationMs?: number;
}

export async function reportEvent(params: ReportEventParams): Promise<void> {
  await post("reportEvent", {
    ...params,
    message: sanitize(params.message),
  });
}

export interface RunStartParams {
  runId: string;
  workflowId: string;
  task: string;
}

export async function reportRunStart(params: RunStartParams): Promise<void> {
  await post("updateRun", {
    runId: params.runId,
    workflowId: params.workflowId,
    task: sanitize(params.task),
    status: "running",
    startedAt: Date.now(),
  });
}

export interface RunCompleteParams {
  runId: string;
  pr?: string;
}

export async function reportRunComplete(params: RunCompleteParams): Promise<void> {
  await post("updateRun", {
    runId: params.runId,
    status: "completed",
    completedAt: Date.now(),
    ...(params.pr ? { pr: params.pr } : {}),
  });
}

export interface RunFailParams {
  runId: string;
}

export async function reportRunFail(params: RunFailParams): Promise<void> {
  await post("updateRun", {
    runId: params.runId,
    status: "failed",
    completedAt: Date.now(),
  });
}
