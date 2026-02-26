import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getDb } from "../db.js";
import { resolveBundledWorkflowsDir } from "../installer/paths.js";
import YAML from "yaml";

import type { RunInfo, StepInfo } from "../installer/status.js";
import { getRunEvents } from "../installer/events.js";
import { getMedicStatus, getRecentMedicChecks } from "../medic/medic.js";
import { createLinkStore } from "./link-storage.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const linkStore = createLinkStore();

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

function serveLinksHTML(res: http.ServerResponse) {
  const htmlPath = path.join(__dirname, "links.html");
  const srcHtmlPath = path.resolve(__dirname, "..", "..", "src", "server", "links.html");
  const filePath = fs.existsSync(htmlPath) ? htmlPath : srcHtmlPath;
  if (!fs.existsSync(filePath)) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
    return;
  }
  res.writeHead(200, { "Content-Type": "text/html" });
  res.end(fs.readFileSync(filePath, "utf-8"));
}

async function parseJsonBody(req: http.IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    if (chunk) chunks.push(chunk);
  }
  const payload = Buffer.concat(chunks).toString("utf-8").trim();
  if (!payload) return {};
  try {
    return JSON.parse(payload);
  } catch {
    throw new Error("Invalid JSON payload");
  }
}

export function startDashboard(port = 3333): http.Server {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://localhost:${port}`);
    const p = url.pathname;

    if (p === "/links" || p === "/links/") {
      return serveLinksHTML(res);
    }

    if (p === "/api/workflows") {
      return json(res, loadWorkflows());
    }

    if (p === "/api/links") {
      if (req.method === "GET") {
        const links = linkStore.listLinks({
          query: url.searchParams.get("q") ?? undefined,
          category: url.searchParams.get("category") ?? undefined,
        });
        return json(res, {
          links,
          categories: linkStore.listCategories(),
        });
      }

      if (req.method === "POST") {
        try {
          const payload = await parseJsonBody(req);
          const entry = linkStore.addLink({
            url: payload?.url ?? "",
            title: payload?.title,
            category: payload?.category,
            notes: payload?.notes,
          });
          return json(res, entry, 201);
        } catch (err) {
          return json(res, { error: err instanceof Error ? err.message : "Invalid payload" }, 400);
        }
      }

      if (req.method === "OPTIONS") {
        res.writeHead(204, {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        });
        return res.end();
      }

      return json(res, { error: "method not allowed" }, 405);
    }

    const linkDetailMatch = p.match(/^\/api\/links\/([^/]+)$/);
    if (linkDetailMatch) {
      if (req.method !== "GET") {
        return json(res, { error: "method not allowed" }, 405);
      }
      const entry = linkStore.getLink(linkDetailMatch[1]);
      return entry ? json(res, entry) : json(res, { error: "not found" }, 404);
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
