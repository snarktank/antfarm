import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getDb } from "../db.js";
import { resolveBundledWorkflowsDir } from "../installer/paths.js";
import YAML from "yaml";

import type { RunInfo, StepInfo } from "../installer/status.js";
import { getRunEvents } from "../installer/events.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

async function readBody(req: http.IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf-8");
}

function getRtsState(): Record<string, unknown> {
  const db = getDb();
  const row = db.prepare("SELECT state_json FROM rts_state WHERE id = 1").get() as { state_json: string } | undefined;
  if (!row?.state_json) return {};
  try {
    const parsed = JSON.parse(row.state_json);
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function saveRtsState(nextState: unknown): Record<string, unknown> {
  const db = getDb();
  const safe = (nextState && typeof nextState === "object") ? nextState as Record<string, unknown> : {};
  const now = new Date().toISOString();
  db.prepare(
    "INSERT INTO rts_state (id, state_json, updated_at) VALUES (1, ?, ?) " +
    "ON CONFLICT(id) DO UPDATE SET state_json = excluded.state_json, updated_at = excluded.updated_at"
  ).run(JSON.stringify(safe), now);
  return safe;
}

function getRtsLiveStatus(): Record<string, unknown> {
  const db = getDb();
  const runningAgentCount = Number((db.prepare("SELECT COUNT(*) AS c FROM steps WHERE status = 'running'").get() as { c: number }).c || 0);
  const activeRunCount = Number((db.prepare("SELECT COUNT(*) AS c FROM runs WHERE status = 'running'").get() as { c: number }).c || 0);
  const pendingRunCount = Number((db.prepare("SELECT COUNT(*) AS c FROM runs WHERE status IN ('pending','running')").get() as { c: number }).c || 0);
  const rows = db.prepare(
    "SELECT run_id, agent_id, step_id, updated_at FROM steps WHERE status = 'running' ORDER BY updated_at DESC LIMIT 200"
  ).all() as Array<{ run_id: string; agent_id: string; step_id: string; updated_at: string }>;
  return {
    ts: new Date().toISOString(),
    runningAgentCount,
    activeRunCount,
    pendingRunCount,
    activeAgents: rows.map((r) => ({
      runId: r.run_id,
      agentId: r.agent_id,
      stepId: r.step_id,
      stale: false,
      ageSec: 0,
    })),
  };
}

function serveHTML(res: http.ServerResponse, fileName = "index.html") {
  const htmlPath = path.join(__dirname, fileName);
  // In dist, html may not exist—serve from src
  const srcHtmlPath = path.resolve(__dirname, "..", "..", "src", "server", fileName);
  const filePath = fs.existsSync(htmlPath) ? htmlPath : srcHtmlPath;
  res.writeHead(200, { "Content-Type": "text/html" });
  res.end(fs.readFileSync(filePath, "utf-8"));
}

function guessMime(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".svg") return "image/svg+xml";
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  return "application/octet-stream";
}

export function startDashboard(port = 3333): http.Server {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://localhost:${port}`);
    const p = url.pathname;
    const method = req.method ?? "GET";

    if (method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      });
      return res.end();
    }

    if (p === "/api/workflows") {
      return json(res, loadWorkflows());
    }

    if (p === "/api/local-repos") {
      return json(res, []);
    }

    if (p === "/api/rts/state" && method === "GET") {
      return json(res, { ok: true, state: getRtsState() });
    }

    if (p === "/api/rts/state" && method === "POST") {
      try {
        const body = JSON.parse(await readBody(req));
        const saved = saveRtsState(body?.state ?? body);
        return json(res, { ok: true, state: saved });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return json(res, { ok: false, error: message }, 400);
      }
    }

    if (p === "/api/rts/live" && method === "GET") {
      return json(res, { ok: true, live: getRtsLiveStatus() });
    }

    if (p === "/api/rts/live/stream" && method === "GET") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "Access-Control-Allow-Origin": "*",
      });
      const send = () => {
        try {
          const live = getRtsLiveStatus();
          res.write("event: live\n");
          res.write(`data: ${JSON.stringify(live)}\n\n`);
        } catch {}
      };
      send();
      const timer = setInterval(send, 1000);
      req.on("close", () => {
        clearInterval(timer);
        try { res.end(); } catch {}
      });
      return;
    }

    if (p === "/api/rts/diag" && method === "GET") {
      return json(res, {
        ok: true,
        diag: {
          workflowId: url.searchParams.get("workflow") ?? null,
          cron: { matchingCount: 0 },
          likelyBlockedReason: "",
        },
      });
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

    // Serve RTS sprite assets
    if (p.startsWith("/rts-sprites/")) {
      const spriteName = path.basename(p);
      const spritePath = path.resolve(__dirname, "rts-sprites", spriteName);
      const srcSpritePath = path.resolve(__dirname, "..", "..", "src", "server", "rts-sprites", spriteName);
      const resolvedSprite = fs.existsSync(spritePath) ? spritePath : srcSpritePath;
      if (fs.existsSync(resolvedSprite)) {
        res.writeHead(200, {
          "Content-Type": guessMime(resolvedSprite),
          "Cache-Control": "public, max-age=86400",
          "Access-Control-Allow-Origin": "*",
        });
        return res.end(fs.readFileSync(resolvedSprite));
      }
      res.writeHead(404);
      return res.end("not found");
    }

    // Serve frontend
    if (p === "/" || p === "/rts" || p === "/rts/") {
      return serveHTML(res, "rts.html");
    }
    if (p === "/classic" || p === "/index" || p === "/index.html") {
      return serveHTML(res, "index.html");
    }
    return serveHTML(res, "rts.html");
  });

  server.listen(port, () => {
    console.log(`Antfarm Dashboard: http://localhost:${port}`);
  });

  return server;
}
