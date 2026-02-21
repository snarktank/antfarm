import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getDb } from "../db.js";
import { resolveBundledWorkflowsDir } from "../installer/paths.js";
import YAML from "yaml";

import type { RunInfo, StepInfo } from "../installer/status.js";
import { getEventsFilePath, getRunEvents, type AntfarmEvent } from "../installer/events.js";
import { getMedicStatus, getRecentMedicChecks } from "../medic/medic.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EVENTS_FILE = getEventsFilePath();
const EVENT_STREAM_POLL_MS = 750;
const EVENT_STREAM_HEARTBEAT_MS = 15_000;

interface SseClient {
  res: http.ServerResponse;
  workflowId?: string;
}

const sseClients = new Set<SseClient>();
let eventPollTimer: NodeJS.Timeout | null = null;
let eventHeartbeatTimer: NodeJS.Timeout | null = null;
let eventOffset = 0;
let eventRemainder = "";

interface WorkflowDef {
  id: string;
  name: string;
  steps: Array<{ id: string; agent: string }>;
}

function loadWorkflows(): WorkflowDef[] {
  const dir = resolveBundledWorkflowsDir();
  const results: WorkflowDef[] = [];
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const ymlPath = path.join(dir, entry.name, "workflow.yml");
      if (!fs.existsSync(ymlPath)) continue;
      const parsed = YAML.parse(fs.readFileSync(ymlPath, "utf-8"));
      results.push({
        id: parsed.id ?? entry.name,
        name: parsed.name ?? entry.name,
        steps: (parsed.steps ?? []).map((s: any) => ({ id: s.id, agent: s.agent })),
      });
    }
  } catch { /* empty */ }
  return results;
}

function getRuns(workflowId?: string): Array<RunInfo & { steps: StepInfo[] }> {
  const db = getDb();
  const runs = workflowId
    ? db.prepare("SELECT * FROM runs WHERE workflow_id = ? ORDER BY created_at DESC").all(workflowId) as RunInfo[]
    : db.prepare("SELECT * FROM runs ORDER BY created_at DESC").all() as RunInfo[];
  return runs.map((r) => {
    const steps = db.prepare("SELECT * FROM steps WHERE run_id = ? ORDER BY step_index ASC").all(r.id) as StepInfo[];
    return { ...r, steps };
  });
}

function getRunById(id: string): (RunInfo & { steps: StepInfo[] }) | null {
  const db = getDb();
  const run = db.prepare("SELECT * FROM runs WHERE id = ?").get(id) as RunInfo | undefined;
  if (!run) return null;
  const steps = db.prepare("SELECT * FROM steps WHERE run_id = ? ORDER BY step_index ASC").all(run.id) as StepInfo[];
  return { ...run, steps };
}

function json(res: http.ServerResponse, data: unknown, status = 200) {
  res.writeHead(status, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
  res.end(JSON.stringify(data));
}

function serveHTML(res: http.ServerResponse) {
  const htmlPath = path.join(__dirname, "index.html");
  // In dist, index.html won't exist—serve from src
  const srcHtmlPath = path.resolve(__dirname, "..", "..", "src", "server", "index.html");
  const filePath = fs.existsSync(htmlPath) ? htmlPath : srcHtmlPath;
  res.writeHead(200, { "Content-Type": "text/html" });
  res.end(fs.readFileSync(filePath, "utf-8"));
}

function matchesWorkflow(client: SseClient, evt: AntfarmEvent): boolean {
  if (!client.workflowId) return true;
  if (!evt.workflowId) return true;
  return evt.workflowId === client.workflowId;
}

function broadcastEvent(evt: AntfarmEvent): void {
  const payload = `data: ${JSON.stringify(evt)}\n\n`;
  for (const client of sseClients) {
    if (!matchesWorkflow(client, evt)) continue;
    try {
      client.res.write(payload);
    } catch {
      sseClients.delete(client);
    }
  }
}

function consumeNewEventLines(): void {
  try {
    if (!fs.existsSync(EVENTS_FILE)) return;
    const stat = fs.statSync(EVENTS_FILE);
    if (stat.size < eventOffset) {
      // File rotated/truncated: restart from beginning.
      eventOffset = 0;
      eventRemainder = "";
    }
    if (stat.size === eventOffset) return;

    const bytes = stat.size - eventOffset;
    const fd = fs.openSync(EVENTS_FILE, "r");
    try {
      const buf = Buffer.alloc(bytes);
      fs.readSync(fd, buf, 0, bytes, eventOffset);
      eventOffset = stat.size;
      const text = eventRemainder + buf.toString("utf-8");
      const lines = text.split("\n");
      eventRemainder = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          broadcastEvent(JSON.parse(trimmed) as AntfarmEvent);
        } catch {
          // ignore malformed line
        }
      }
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    // best-effort
  }
}

function ensureEventStreamingLoop(): void {
  if (eventPollTimer && eventHeartbeatTimer) return;
  try {
    eventOffset = fs.existsSync(EVENTS_FILE) ? fs.statSync(EVENTS_FILE).size : 0;
  } catch {
    eventOffset = 0;
  }
  eventRemainder = "";

  eventPollTimer = setInterval(consumeNewEventLines, EVENT_STREAM_POLL_MS);
  eventHeartbeatTimer = setInterval(() => {
    for (const client of sseClients) {
      try {
        client.res.write(": keepalive\n\n");
      } catch {
        sseClients.delete(client);
      }
    }
  }, EVENT_STREAM_HEARTBEAT_MS);
}

function maybeStopEventStreamingLoop(): void {
  if (sseClients.size > 0) return;
  if (eventPollTimer) {
    clearInterval(eventPollTimer);
    eventPollTimer = null;
  }
  if (eventHeartbeatTimer) {
    clearInterval(eventHeartbeatTimer);
    eventHeartbeatTimer = null;
  }
}

function handleEventStream(req: http.IncomingMessage, res: http.ServerResponse, workflowId?: string): void {
  const client: SseClient = { res, workflowId };
  sseClients.add(client);
  ensureEventStreamingLoop();

  req.socket.setTimeout(0);
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
    "Access-Control-Allow-Origin": "*",
  });
  res.write(`retry: 2000\n\n`);

  req.on("close", () => {
    sseClients.delete(client);
    maybeStopEventStreamingLoop();
  });
}

export function startDashboard(port = 3333): http.Server {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", `http://localhost:${port}`);
    const p = url.pathname;

    if (p === "/api/workflows") {
      return json(res, loadWorkflows());
    }

    if (p === "/api/events/stream") {
      const workflowId = url.searchParams.get("workflow") ?? undefined;
      return handleEventStream(req, res, workflowId);
    }

    const eventsMatch = p.match(/^\/api\/runs\/([^/]+)\/events$/);
    if (eventsMatch) {
      return json(res, getRunEvents(eventsMatch[1]));
    }

    const storiesMatch = p.match(/^\/api\/runs\/([^/]+)\/stories$/);
    if (storiesMatch) {
      const db = getDb();
      const stories = db.prepare(
        "SELECT * FROM stories WHERE run_id = ? ORDER BY story_index ASC"
      ).all(storiesMatch[1]);
      return json(res, stories);
    }

    const runMatch = p.match(/^\/api\/runs\/(.+)$/);
    if (runMatch) {
      const run = getRunById(runMatch[1]);
      return run ? json(res, run) : json(res, { error: "not found" }, 404);
    }

    if (p === "/api/runs") {
      const wf = url.searchParams.get("workflow") ?? undefined;
      return json(res, getRuns(wf));
    }

    // Medic API
    if (p === "/api/medic/status") {
      return json(res, getMedicStatus());
    }

    if (p === "/api/medic/checks") {
      const limit = parseInt(url.searchParams.get("limit") ?? "20", 10);
      return json(res, getRecentMedicChecks(limit));
    }

    // Serve fonts
    if (p.startsWith("/fonts/")) {
      const fontName = path.basename(p);
      const fontPath = path.resolve(__dirname, "..", "..", "assets", "fonts", fontName);
      const srcFontPath = path.resolve(__dirname, "..", "..", "src", "..", "assets", "fonts", fontName);
      const resolvedFont = fs.existsSync(fontPath) ? fontPath : srcFontPath;
      if (fs.existsSync(resolvedFont)) {
        res.writeHead(200, { "Content-Type": "font/woff2", "Cache-Control": "public, max-age=31536000", "Access-Control-Allow-Origin": "*" });
        return res.end(fs.readFileSync(resolvedFont));
      }
    }

    // Serve logo
    if (p === "/logo.jpeg") {
      const logoPath = path.resolve(__dirname, "..", "..", "assets", "logo.jpeg");
      const srcLogoPath = path.resolve(__dirname, "..", "..", "src", "..", "assets", "logo.jpeg");
      const resolvedLogo = fs.existsSync(logoPath) ? logoPath : srcLogoPath;
      if (fs.existsSync(resolvedLogo)) {
        res.writeHead(200, { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=86400" });
        return res.end(fs.readFileSync(resolvedLogo));
      }
    }

    // Serve frontend
    serveHTML(res);
  });

  server.listen(port, () => {
    console.log(`Antfarm Dashboard: http://localhost:${port}`);
  });

  return server;
}
