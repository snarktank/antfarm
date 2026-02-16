import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getDb } from "../db.js";
import { resolveBundledWorkflowsDir, resolveWorkflowDir } from "../installer/paths.js";
import YAML from "yaml";

import type { RunInfo, StepInfo } from "../installer/status.js";
import { stopWorkflow } from "../installer/status.js";
import { getRunEvents } from "../installer/events.js";
import { getMedicStatus, getRecentMedicChecks } from "../medic/medic.js";
import { runWorkflow } from "../installer/run.js";
import { resumeWorkflowRun } from "../installer/resume.js";
import { loadWorkflowSpec } from "../installer/workflow-spec.js";
import { removeAgentCrons, setupAgentCrons } from "../installer/agent-cron.js";

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
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(JSON.stringify(data));
}

function readJsonBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      try {
        const text = Buffer.concat(chunks).toString("utf-8");
        resolve(text ? JSON.parse(text) : {});
      } catch { resolve({}); }
    });
    req.on("error", reject);
  });
}

function serveHTML(res: http.ServerResponse) {
  const htmlPath = path.join(__dirname, "index.html");
  // In dist, index.html won't exist—serve from src
  const srcHtmlPath = path.resolve(__dirname, "..", "..", "src", "server", "index.html");
  const filePath = fs.existsSync(htmlPath) ? htmlPath : srcHtmlPath;
  res.writeHead(200, { "Content-Type": "text/html" });
  res.end(fs.readFileSync(filePath, "utf-8"));
}

export function startDashboard(port = 3333): http.Server {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://localhost:${port}`);
    const p = url.pathname;

    if (p === "/api/workflows") {
      return json(res, loadWorkflows());
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

    // ── CORS preflight ───────────────────────────────────────────
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      });
      return res.end();
    }

    // ── POST: Start a run ───────────────────────────────────────
    const runCreateMatch = p.match(/^\/api\/workflows\/([^/]+)\/runs$/);
    if (runCreateMatch && req.method === "POST") {
      const body = await readJsonBody(req);
      const workflowId = runCreateMatch[1];
      const task = String(body.task ?? "").trim();
      if (!task) return json(res, { ok: false, error: "Missing task" }, 400);
      try {
        const run = await runWorkflow({ workflowId, taskTitle: task, notifyUrl: body.notifyUrl as string | undefined });
        return json(res, { ok: true, ...run });
      } catch (err) {
        return json(res, { ok: false, error: err instanceof Error ? err.message : String(err) }, 500);
      }
    }

    // ── POST: Stop a run ────────────────────────────────────────
    const stopMatch = p.match(/^\/api\/runs\/([^/]+)\/stop$/);
    if (stopMatch && req.method === "POST") {
      try {
        const result = await stopWorkflow(stopMatch[1]);
        if (result.status === "not_found") return json(res, { ok: false, error: result.message }, 404);
        if (result.status === "already_done") return json(res, { ok: false, error: result.message }, 409);
        return json(res, { ok: true, ...result });
      } catch (err) {
        return json(res, { ok: false, error: err instanceof Error ? err.message : String(err) }, 500);
      }
    }

    // ── POST: Resume a run ──────────────────────────────────────
    const resumeMatch = p.match(/^\/api\/runs\/([^/]+)\/resume$/);
    if (resumeMatch && req.method === "POST") {
      try {
        const result = await resumeWorkflowRun(resumeMatch[1]);
        if (result.status === "not_found") return json(res, { ok: false, error: result.message }, 404);
        if (result.status === "not_resumable") return json(res, { ok: false, error: result.message }, 409);
        return json(res, { ok: true, runId: result.runId, message: result.message });
      } catch (err) {
        return json(res, { ok: false, error: err instanceof Error ? err.message : String(err) }, 500);
      }
    }

    // ── POST: Ensure crons ──────────────────────────────────────
    const cronMatch = p.match(/^\/api\/workflows\/([^/]+)\/ensure-crons$/);
    if (cronMatch && req.method === "POST") {
      const workflowId = cronMatch[1];
      try {
        const workflowDir = resolveWorkflowDir(workflowId);
        const workflow = await loadWorkflowSpec(workflowDir);
        await removeAgentCrons(workflowId);
        await setupAgentCrons(workflow);
        return json(res, { ok: true, message: `Recreated agent crons for "${workflowId}".` });
      } catch (err) {
        return json(res, { ok: false, error: err instanceof Error ? err.message : String(err) }, 500);
      }
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
