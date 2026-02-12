import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { getDb } from "../db.js";
import { resolveBundledWorkflowsDir } from "../installer/paths.js";
import { runWorkflow } from "../installer/run.js";
import { teardownWorkflowCronsIfIdle } from "../installer/agent-cron.js";
import { emitEvent } from "../installer/events.js";
import { createImmediateHandoffHandler } from "../installer/immediate-handoff.js";
import YAML from "yaml";

import type { RunInfo, StepInfo } from "../installer/status.js";
import { getRunEvents } from "../installer/events.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const immediateHandoff = createImmediateHandoffHandler();

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

function ensureRtsTables(db = getDb()): void {
  db.exec(
    "CREATE TABLE IF NOT EXISTS rts_state (" +
    "id INTEGER PRIMARY KEY CHECK (id = 1), " +
    "state_json TEXT NOT NULL DEFAULT '{}', " +
    "updated_at TEXT NOT NULL DEFAULT (datetime('now'))" +
    ")"
  );
  db.exec(
    "CREATE TABLE IF NOT EXISTS rts_layout_entities (" +
    "id TEXT PRIMARY KEY, " +
    "entity_type TEXT NOT NULL, " +
    "run_id TEXT, " +
    "repo_path TEXT, " +
    "worktree_path TEXT, " +
    "x REAL NOT NULL DEFAULT 0, " +
    "y REAL NOT NULL DEFAULT 0, " +
    "payload_json TEXT NOT NULL DEFAULT '{}', " +
    "updated_at TEXT NOT NULL" +
    ")"
  );
}

function normalizePathKey(raw: string): string {
  return String(raw || "").trim().replace(/\\/g, "/").replace(/\/+$/, "");
}

function absolutizePath(pathValue: string, repoPath: string): string {
  const key = normalizePathKey(pathValue);
  if (!key) return "";
  if (key.startsWith("/")) return key;
  if (/^[A-Za-z]:\//.test(key)) return key;
  const base = normalizePathKey(repoPath);
  if (!base) return key;
  const stack = base.split("/");
  for (const part of key.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (stack.length > 1) stack.pop();
      continue;
    }
    stack.push(part);
  }
  return stack.join("/");
}

function getRtsState(): Record<string, unknown> {
  // RTS consistency invariant:
  // UI state must reflect authoritative Antfarm runtime state on this machine.
  // Any layout/state rows that reference missing runs are reconciled away here.
  const db = getDb();
  ensureRtsTables(db);
  const row = db.prepare("SELECT state_json FROM rts_state WHERE id = 1").get() as { state_json: string } | undefined;
  let state: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(row?.state_json || "{}");
    if (parsed && typeof parsed === "object") state = parsed as Record<string, unknown>;
  } catch {
    state = {};
  }
  const rows = db.prepare(
    "SELECT id, entity_type, run_id, repo_path, worktree_path, x, y, payload_json FROM rts_layout_entities ORDER BY updated_at DESC"
  ).all() as Array<{
    id: string;
    entity_type: string;
    run_id: string | null;
    repo_path: string | null;
    worktree_path: string | null;
    x: number;
    y: number;
    payload_json: string | null;
  }>;
  const customBases: Array<Record<string, unknown>> = [];
  const featureBuildings: Array<Record<string, unknown>> = [];
  const runLayoutOverrides: Record<string, { x: number; y: number }> = {};
  const runs = db.prepare("SELECT id, status, context FROM runs").all() as Array<{ id: string; status: string; context: string }>;
  const runIdSet = new Set(runs.map((r) => r.id));
  const runByWorktree = new Map<string, { id: string; status: string; worktree: string }>();
  const runByWorktreeBase = new Map<string, { id: string; status: string; worktree: string }>();
  for (const run of runs) {
    let ctx: Record<string, unknown> = {};
    try {
      const parsed = JSON.parse(run.context || "{}");
      if (parsed && typeof parsed === "object") ctx = parsed as Record<string, unknown>;
    } catch {}
    const baseRepo = String(ctx.baseRepoPath || ctx.repoPath || ctx.repo || "");
    const wt = absolutizePath(String(ctx.worktreePath || ""), baseRepo);
    if (wt) {
      runByWorktree.set(wt, { id: run.id, status: run.status, worktree: wt });
      const bn = path.basename(wt);
      if (bn && !runByWorktreeBase.has(bn)) runByWorktreeBase.set(bn, { id: run.id, status: run.status, worktree: wt });
    }
  }
  const seenFeatureKeys = new Set<string>();
  for (const r of rows) {
    let payload: Record<string, unknown> = {};
    try {
      const parsed = JSON.parse(r.payload_json || "{}");
      if (parsed && typeof parsed === "object") payload = parsed as Record<string, unknown>;
    } catch {}
    if (r.entity_type === "base") {
      customBases.push({
        ...payload,
        id: payload.id ?? r.id,
        x: Number(r.x),
        y: Number(r.y),
        repo: r.repo_path ?? payload.repo ?? "",
        source: "custom",
      });
      continue;
    }
    if (r.entity_type === "feature") {
      const repoPath = String(r.repo_path ?? payload.repo ?? "");
      const worktreePath = absolutizePath(String(r.worktree_path ?? payload.worktreePath ?? ""), repoPath);
      let resolvedRunId = (r.run_id ?? payload.runId ?? null) as string | null;
      let resolvedStatus: string | null = null;
      if (resolvedRunId && !runIdSet.has(resolvedRunId)) {
        // Layout pointed at a deleted run: heal to draft mode immediately.
        resolvedRunId = null;
        try {
          db.prepare("UPDATE rts_layout_entities SET run_id = NULL, updated_at = ? WHERE id = ?")
            .run(new Date().toISOString(), r.id);
        } catch {}
      }
      if (!resolvedRunId && worktreePath) {
        const inferred = runByWorktree.get(worktreePath) || runByWorktreeBase.get(path.basename(worktreePath));
        if (inferred) {
          resolvedRunId = inferred.id;
          resolvedStatus = inferred.status;
          const canonicalWorktreePath = inferred.worktree || worktreePath;
          // Heal stale layout row directly in DB when we can infer the run id.
          try {
            db.prepare("UPDATE rts_layout_entities SET run_id = ?, worktree_path = ?, updated_at = ? WHERE id = ?")
              .run(inferred.id, canonicalWorktreePath, new Date().toISOString(), r.id);
          } catch {}
        }
      }
      const dedupeKey = resolvedRunId ? `run:${resolvedRunId}` : `draft:${worktreePath || r.id}`;
      if (seenFeatureKeys.has(dedupeKey)) continue;
      seenFeatureKeys.add(dedupeKey);
      featureBuildings.push({
        ...payload,
        id: payload.id ?? r.id,
        kind: "feature",
        x: Number(r.x),
        y: Number(r.y),
        repo: repoPath,
        worktreePath: worktreePath || String(r.worktree_path ?? payload.worktreePath ?? ""),
        runId: resolvedRunId,
        committed: resolvedRunId ? true : payload.committed,
        phase: resolvedStatus || payload.phase || (resolvedRunId ? "running" : "draft"),
      });
      continue;
    }
    if (r.entity_type === "run") {
      const runId = r.run_id || (String(r.id || "").startsWith("run:") ? String(r.id).slice(4) : String(r.id || ""));
      if (!runId) continue;
      if (!runIdSet.has(runId)) {
        try { db.prepare("DELETE FROM rts_layout_entities WHERE id = ?").run(r.id); } catch {}
        continue;
      }
      runLayoutOverrides[runId] = { x: Number(r.x), y: Number(r.y) };
    }
  }
  return { ...state, customBases, featureBuildings, runLayoutOverrides };
}

function upsertLayoutEntitiesFromState(nextState: Record<string, unknown>): void {
  const db = getDb();
  ensureRtsTables(db);
  const now = new Date().toISOString();
  const upsert = db.prepare(
    "INSERT INTO rts_layout_entities (id, entity_type, run_id, repo_path, worktree_path, x, y, payload_json, updated_at) " +
    "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) " +
    "ON CONFLICT(id) DO UPDATE SET " +
    "entity_type = excluded.entity_type, run_id = excluded.run_id, repo_path = excluded.repo_path, worktree_path = excluded.worktree_path, " +
    "x = excluded.x, y = excluded.y, payload_json = excluded.payload_json, updated_at = excluded.updated_at"
  );
  const deleteById = db.prepare("DELETE FROM rts_layout_entities WHERE id = ?");
  const customBases = Array.isArray(nextState.customBases) ? nextState.customBases as Array<Record<string, unknown>> : [];
  const featureBuildings = Array.isArray(nextState.featureBuildings) ? nextState.featureBuildings as Array<Record<string, unknown>> : [];
  const runLayoutOverrides = (nextState.runLayoutOverrides && typeof nextState.runLayoutOverrides === "object")
    ? nextState.runLayoutOverrides as Record<string, { x?: number; y?: number }>
    : {};
  const seenBaseIds = new Set<string>();
  const seenFeatureIds = new Set<string>();
  const seenRunIds = new Set<string>();
  const runs = db.prepare("SELECT id, context FROM runs").all() as Array<{ id: string; context: string }>;
  const runIdSet = new Set(runs.map((r) => r.id));
  const runByWorktree = new Map<string, string>();
  const runByWorktreeBase = new Map<string, string>();
  const existingPosById = new Map<string, { x: number; y: number }>();
  const existingRunPosByRunId = new Map<string, { x: number; y: number }>();
  const existingRows = db.prepare(
    "SELECT id, entity_type, run_id, x, y FROM rts_layout_entities"
  ).all() as Array<{ id: string; entity_type: string; run_id: string | null; x: number; y: number }>;
  for (const row of existingRows) {
    existingPosById.set(String(row.id), { x: Number(row.x), y: Number(row.y) });
    if (row.entity_type === "run" && row.run_id) {
      existingRunPosByRunId.set(String(row.run_id), { x: Number(row.x), y: Number(row.y) });
    }
  }
  for (const run of runs) {
    let ctx: Record<string, unknown> = {};
    try {
      const parsed = JSON.parse(run.context || "{}");
      if (parsed && typeof parsed === "object") ctx = parsed as Record<string, unknown>;
    } catch {}
    const repo = String(ctx.baseRepoPath || ctx.repoPath || ctx.repo || "");
    const wt = absolutizePath(String(ctx.worktreePath || ""), repo);
    if (wt) {
      runByWorktree.set(wt, run.id);
      const bn = path.basename(wt);
      if (bn && !runByWorktreeBase.has(bn)) runByWorktreeBase.set(bn, run.id);
    }
  }
  db.exec("BEGIN");
  try {
    for (const base of customBases) {
      const id = String(base?.id ?? "");
      if (!id) continue;
      seenBaseIds.add(id);
      const repoPath = String(base?.repo ?? "");
      const incomingX = Number(base?.x ?? 0);
      const incomingY = Number(base?.y ?? 0);
      const existing = existingPosById.get(id);
      const x = Number.isFinite(existing?.x) ? Number(existing!.x) : (Number.isFinite(incomingX) ? incomingX : 0);
      const y = Number.isFinite(existing?.y) ? Number(existing!.y) : (Number.isFinite(incomingY) ? incomingY : 0);
      const payload = { ...base, x, y };
      upsert.run(id, "base", null, repoPath || null, null, x, y, JSON.stringify(payload), now);
    }
    for (const feature of featureBuildings) {
      const id = String(feature?.id ?? "");
      if (!id) continue;
      // Snapshot writes cannot create feature layout rows. Creation must come
      // from explicit actions (/api/rts/layout/position or /api/rts/feature/run).
      if (!existingPosById.has(id)) continue;
      const repoPath = String(feature?.repo ?? "");
      const worktreePath = absolutizePath(String(feature?.worktreePath ?? ""), repoPath) || String(feature?.worktreePath ?? "");
      const runIdRaw = feature?.runId;
      let runId = (runIdRaw === null || runIdRaw === undefined || String(runIdRaw).trim() === "") ? null : String(runIdRaw);
      if (runId && !runIdSet.has(runId)) runId = null;
      if (!runId) {
        const absWt = absolutizePath(worktreePath, repoPath);
        const inferred = runByWorktree.get(absWt) || runByWorktreeBase.get(path.basename(absWt || worktreePath));
        if (inferred) runId = inferred;
      }
      const committedRaw = feature?.committed;
      const committed = committedRaw === true || String(committedRaw || "").toLowerCase() === "true";
      // Prevent stale "launched" ghosts (dead runId but committed=true) from being reinserted.
      if (!runId && committed) continue;
      // Run-backed feature rows are positioned via /api/rts/layout/position and
      // launch reconciliation; ignore state snapshot x/y for them to avoid drift.
      if (runId) continue;
      seenFeatureIds.add(id);
      const incomingX = Number(feature?.x ?? 0);
      const incomingY = Number(feature?.y ?? 0);
      const existing = existingPosById.get(id);
      const x = Number.isFinite(existing?.x) ? Number(existing!.x) : (Number.isFinite(incomingX) ? incomingX : 0);
      const y = Number.isFinite(existing?.y) ? Number(existing!.y) : (Number.isFinite(incomingY) ? incomingY : 0);
      const payload = {
        ...feature,
        runId: runId ?? feature.runId ?? null,
        committed: runId ? true : feature.committed,
        worktreePath,
        x,
        y,
      };
      upsert.run(id, "feature", runId, repoPath || null, worktreePath || null, x, y, JSON.stringify(payload), now);
    }
    for (const [runId, pos] of Object.entries(runLayoutOverrides)) {
      if (!runId) continue;
      seenRunIds.add(runId);
      const id = `run:${runId}`;
      // Snapshot writes cannot create run layout rows.
      if (!existingRunPosByRunId.has(runId) && !existingPosById.has(id)) continue;
      const incomingX = Number(pos?.x ?? 0);
      const incomingY = Number(pos?.y ?? 0);
      const existing = existingRunPosByRunId.get(runId) || existingPosById.get(id);
      const x = Number.isFinite(existing?.x) ? Number(existing!.x) : (Number.isFinite(incomingX) ? incomingX : 0);
      const y = Number.isFinite(existing?.y) ? Number(existing!.y) : (Number.isFinite(incomingY) ? incomingY : 0);
      upsert.run(id, "run", runId, null, null, x, y, JSON.stringify({ runId, x, y }), now);
    }
    const baseRows = db.prepare("SELECT id FROM rts_layout_entities WHERE entity_type = 'base'").all() as Array<{ id: string }>;
    for (const row2 of baseRows) if (!seenBaseIds.has(row2.id)) deleteById.run(row2.id);
    const featureRows = db.prepare("SELECT id, run_id FROM rts_layout_entities WHERE entity_type = 'feature'").all() as Array<{ id: string; run_id: string | null }>;
    for (const row2 of featureRows) {
      if (seenFeatureIds.has(row2.id)) continue;
      // Keep run-backed feature rows even if the latest state snapshot omitted them.
      if (row2.run_id && runIdSet.has(row2.run_id)) continue;
      deleteById.run(row2.id);
    }
    const runRows = db.prepare("SELECT id, run_id FROM rts_layout_entities WHERE entity_type = 'run'").all() as Array<{ id: string; run_id: string | null }>;
    for (const row2 of runRows) {
      const id = row2.run_id || (String(row2.id || "").startsWith("run:") ? String(row2.id).slice(4) : "");
      if (!id || !seenRunIds.has(id)) deleteById.run(row2.id);
    }
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

function saveRtsState(nextState: unknown): Record<string, unknown> {
  const db = getDb();
  ensureRtsTables(db);
  const safe = (nextState && typeof nextState === "object") ? nextState as Record<string, unknown> : {};
  const nonLayoutState: Record<string, unknown> = { ...safe };
  delete nonLayoutState.customBases;
  delete nonLayoutState.featureBuildings;
  delete nonLayoutState.runLayoutOverrides;
  upsertLayoutEntitiesFromState(safe);
  const derived = getRtsState();
  const canonical = {
    ...nonLayoutState,
    customBases: Array.isArray(derived.customBases) ? derived.customBases : [],
    featureBuildings: Array.isArray(derived.featureBuildings) ? derived.featureBuildings : [],
    runLayoutOverrides: (derived.runLayoutOverrides && typeof derived.runLayoutOverrides === "object")
      ? derived.runLayoutOverrides
      : {},
  };
  const now = new Date().toISOString();
  db.prepare(
    "INSERT INTO rts_state (id, state_json, updated_at) VALUES (1, ?, ?) " +
    "ON CONFLICT(id) DO UPDATE SET state_json = excluded.state_json, updated_at = excluded.updated_at"
  ).run(JSON.stringify(canonical), now);
  return canonical;
}

function getRtsLiveStatus(): Record<string, unknown> {
  const workerTotal = (() => {
    try {
      const jobsPath = path.join(os.homedir(), ".openclaw", "cron", "jobs.json");
      if (!fs.existsSync(jobsPath)) return 0;
      const raw = JSON.parse(fs.readFileSync(jobsPath, "utf-8")) as { jobs?: Array<{ name?: string; enabled?: boolean }> };
      const jobs = Array.isArray(raw.jobs) ? raw.jobs : [];
      return jobs.filter((j) => j.enabled !== false && String(j.name || "").startsWith("antfarm/")).length;
    } catch {
      return 0;
    }
  })();

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
    workerTotal,
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

function parseRunContext(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function normalizeRepoPath(rawPath: string): string {
  const trimmed = rawPath.trim();
  return path.isAbsolute(trimmed) ? path.normalize(trimmed) : path.resolve(process.cwd(), trimmed);
}

function resolveWorktreePath(baseRepoPath: string, worktreePath: string): string {
  const trimmed = worktreePath.trim();
  if (!trimmed) return path.resolve(path.dirname(baseRepoPath), `${path.basename(baseRepoPath)}-feature-${Date.now().toString().slice(-4)}`);
  return path.isAbsolute(trimmed) ? path.normalize(trimmed) : path.resolve(baseRepoPath, trimmed);
}

function branchExists(baseRepoPath: string, branchName: string): boolean {
  const trimmed = String(branchName || "").trim();
  if (!trimmed) return false;
  try {
    execFileSync("git", ["-C", baseRepoPath, "rev-parse", "--verify", "--quiet", `refs/heads/${trimmed}`], { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

function resolveRunRecord(runIdOrPrefix: string): { id: string; status: string; workflow_id: string; context: string } | null {
  const db = getDb();
  const exact = db.prepare("SELECT id, status, workflow_id, context FROM runs WHERE id = ?").get(runIdOrPrefix) as { id: string; status: string; workflow_id: string; context: string } | undefined;
  if (exact) return exact;
  const rows = db.prepare("SELECT id, status, workflow_id, context FROM runs WHERE id LIKE ? ORDER BY updated_at DESC LIMIT 2").all(`${runIdOrPrefix}%`) as Array<{ id: string; status: string; workflow_id: string; context: string }>;
  if (rows.length === 1) return rows[0];
  return null;
}

function pruneRunEvents(runId: string): void {
  try {
    const eventsFile = path.join(os.homedir(), ".openclaw", "antfarm", "events.jsonl");
    if (!fs.existsSync(eventsFile)) return;
    const content = fs.readFileSync(eventsFile, "utf-8");
    const kept = content
      .split("\n")
      .filter(Boolean)
      .filter((line) => {
        try {
          const evt = JSON.parse(line) as { runId?: string };
          return evt.runId !== runId;
        } catch {
          return true;
        }
      })
      .join("\n");
    fs.writeFileSync(eventsFile, kept ? `${kept}\n` : "");
  } catch {
    // best-effort cleanup
  }
}

function removeRunWorktree(context: Record<string, unknown>): { removed: boolean; path?: string } {
  const wtRaw = String(context.worktreePath ?? "").trim();
  if (!wtRaw) return { removed: false };
  const baseRaw = String(context.baseRepoPath ?? context.repoPath ?? "").trim();
  const worktreePath = path.isAbsolute(wtRaw) ? path.normalize(wtRaw) : path.resolve(process.cwd(), wtRaw);
  const baseRepoPath = baseRaw ? (path.isAbsolute(baseRaw) ? path.normalize(baseRaw) : path.resolve(process.cwd(), baseRaw)) : "";
  if (baseRepoPath && worktreePath === baseRepoPath) return { removed: false, path: worktreePath };
  if (!fs.existsSync(worktreePath)) return { removed: false, path: worktreePath };
  try {
    const gitBase = baseRepoPath || path.dirname(worktreePath);
    execFileSync("git", ["-C", gitBase, "worktree", "remove", "--force", worktreePath], { stdio: "pipe" });
    return { removed: true, path: worktreePath };
  } catch {
    try {
      fs.rmSync(worktreePath, { recursive: true, force: true });
      return { removed: true, path: worktreePath };
    } catch {
      return { removed: false, path: worktreePath };
    }
  }
}

function purgeRtsArtifactsForRunId(runId: string): { purged: boolean } {
  const db = getDb();
  ensureRtsTables(db);
  let purged = false;
  const byRun = db.prepare("DELETE FROM rts_layout_entities WHERE run_id = ?").run(runId);
  const byId = db.prepare("DELETE FROM rts_layout_entities WHERE id = ?").run(`run:${runId}`);
  purged = Number(byRun.changes || 0) > 0 || Number(byId.changes || 0) > 0;

  const stateRow = db.prepare("SELECT state_json FROM rts_state WHERE id = 1").get() as { state_json: string } | undefined;
  if (stateRow?.state_json) {
    let stateJson: Record<string, unknown> = {};
    try { stateJson = JSON.parse(stateRow.state_json) as Record<string, unknown>; } catch { stateJson = {}; }
    const beforeCount = Array.isArray(stateJson.featureBuildings) ? stateJson.featureBuildings.length : 0;
    const featureBuildings = Array.isArray(stateJson.featureBuildings)
      ? (stateJson.featureBuildings as Array<Record<string, unknown>>).filter((b) => String(b?.runId ?? "") !== runId)
      : [];
    const runLayoutOverrides = (stateJson.runLayoutOverrides && typeof stateJson.runLayoutOverrides === "object")
      ? { ...(stateJson.runLayoutOverrides as Record<string, unknown>) }
      : {};
    const hadOverride = Object.prototype.hasOwnProperty.call(runLayoutOverrides, runId);
    delete runLayoutOverrides[runId];

    const selected = (stateJson.selected && typeof stateJson.selected === "object")
      ? stateJson.selected as Record<string, unknown>
      : null;
    const selectedData = selected && typeof selected.data === "object" ? selected.data as Record<string, unknown> : null;
    const selectedRunId = selectedData ? String(selectedData.runId ?? selectedData.id ?? "") : "";
    const nextSelected = selectedRunId === runId ? null : selected;
    const nextState = { ...stateJson, featureBuildings, runLayoutOverrides, ...(nextSelected ? { selected: nextSelected } : { selected: null }) };
    const afterCount = Array.isArray(nextState.featureBuildings) ? nextState.featureBuildings.length : 0;
    if (beforeCount !== afterCount || hadOverride || (selected && !nextSelected)) purged = true;
    db.prepare("UPDATE rts_state SET state_json = ?, updated_at = ? WHERE id = 1").run(JSON.stringify(nextState), new Date().toISOString());
  }
  return { purged };
}

function deleteRunWithArtifacts(runIdOrPrefix: string): { deleted: boolean; status?: string; runId?: string; worktreeRemoved?: boolean; worktreePath?: string } {
  const db = getDb();
  ensureRtsTables(db);
  const run = resolveRunRecord(runIdOrPrefix);
  if (!run) {
    const idGuess = runIdOrPrefix.trim();
    if (!idGuess) return { deleted: false };
    const purged = purgeRtsArtifactsForRunId(idGuess);
    return purged.purged ? { deleted: true, runId: idGuess } : { deleted: false };
  }
  const runId = run.id;
  let context: Record<string, unknown> = {};
  try { context = JSON.parse(run.context || "{}") as Record<string, unknown>; } catch { context = {}; }

  db.exec("BEGIN");
  try {
    const stateRow = db.prepare("SELECT state_json FROM rts_state WHERE id = 1").get() as { state_json: string } | undefined;
    if (stateRow?.state_json) {
      let stateJson: Record<string, unknown> = {};
      try { stateJson = JSON.parse(stateRow.state_json) as Record<string, unknown>; } catch { stateJson = {}; }
      const featureBuildings = Array.isArray(stateJson.featureBuildings)
        ? (stateJson.featureBuildings as Array<Record<string, unknown>>).filter((b) => String(b?.runId ?? "") !== runId)
        : [];
      const runLayoutOverrides = (stateJson.runLayoutOverrides && typeof stateJson.runLayoutOverrides === "object")
        ? { ...(stateJson.runLayoutOverrides as Record<string, unknown>) }
        : {};
      delete runLayoutOverrides[runId];
      const selected = (stateJson.selected && typeof stateJson.selected === "object")
        ? stateJson.selected as Record<string, unknown>
        : null;
      const selectedData = selected && typeof selected.data === "object" ? selected.data as Record<string, unknown> : null;
      const selectedRunId = selectedData ? String(selectedData.runId ?? selectedData.id ?? "") : "";
      const nextSelected = selectedRunId === runId ? null : selected;
      const nextState = { ...stateJson, featureBuildings, runLayoutOverrides, ...(nextSelected ? { selected: nextSelected } : { selected: null }) };
      db.prepare("UPDATE rts_state SET state_json = ?, updated_at = ? WHERE id = 1").run(JSON.stringify(nextState), new Date().toISOString());
    }

    db.prepare("DELETE FROM stories WHERE run_id = ?").run(runId);
    db.prepare("DELETE FROM steps WHERE run_id = ?").run(runId);
    db.prepare("DELETE FROM runs WHERE id = ?").run(runId);
    db.prepare("DELETE FROM rts_layout_entities WHERE run_id = ?").run(runId);
    db.prepare("DELETE FROM rts_layout_entities WHERE id = ?").run(`run:${runId}`);
    db.exec("COMMIT");
    pruneRunEvents(runId);
    const wt = removeRunWorktree(context);
    teardownWorkflowCronsIfIdle(run.workflow_id).catch(() => {});
    return { deleted: true, status: run.status, runId, worktreeRemoved: wt.removed, worktreePath: wt.path };
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

function upsertLayoutPosition(input: {
  entityType: "base" | "feature" | "run";
  entityId?: string;
  runId?: string | null;
  repoPath?: string | null;
  worktreePath?: string | null;
  x: number;
  y: number;
  allowCreate?: boolean;
}): { id: string; entityType: string; runId: string | null } {
  const db = getDb();
  ensureRtsTables(db);
  const now = new Date().toISOString();
  const entityType = input.entityType;
  const x = Number.isFinite(input.x) ? input.x : 0;
  const y = Number.isFinite(input.y) ? input.y : 0;
  const repoPath = input.repoPath ? String(input.repoPath) : null;
  const worktreePath = input.worktreePath ? absolutizePath(String(input.worktreePath), String(input.repoPath || "")) : null;
  let runId = input.runId ? String(input.runId) : null;
  let id = String(input.entityId || "").trim();

  if (entityType === "run") {
    if (!runId) runId = id || null;
    if (!runId) throw new Error("runId is required for run layout");
    id = `run:${runId}`;
  } else if (entityType === "feature") {
    if (runId) {
      const byRun = db.prepare("SELECT id FROM rts_layout_entities WHERE entity_type = 'feature' AND run_id = ? LIMIT 1").get(runId) as { id: string } | undefined;
      if (byRun?.id) id = byRun.id;
    }
    if (!id || id.startsWith("feature-run-")) id = runId ? `feature-${runId}` : `feature-${Date.now()}`;
    if (!runId) {
      const exists = db.prepare("SELECT 1 as ok FROM rts_layout_entities WHERE id = ? LIMIT 1").get(id) as { ok: number } | undefined;
      if (!exists && !input.allowCreate) {
        throw new Error("feature_layout_create_not_allowed");
      }
    }
  } else {
    if (!id) throw new Error("entityId is required for base layout");
  }

  const current = db.prepare("SELECT payload_json FROM rts_layout_entities WHERE id = ?").get(id) as { payload_json: string } | undefined;
  let payload: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(current?.payload_json || "{}");
    if (parsed && typeof parsed === "object") payload = parsed as Record<string, unknown>;
  } catch {}
  const nextPayload: Record<string, unknown> = { ...payload, id, x, y };
  if (runId) nextPayload.runId = runId;
  if (repoPath) nextPayload.repo = repoPath;
  if (worktreePath) nextPayload.worktreePath = worktreePath;

  db.prepare(
    "INSERT INTO rts_layout_entities (id, entity_type, run_id, repo_path, worktree_path, x, y, payload_json, updated_at) " +
    "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) " +
    "ON CONFLICT(id) DO UPDATE SET " +
    "entity_type = excluded.entity_type, run_id = excluded.run_id, repo_path = excluded.repo_path, worktree_path = excluded.worktree_path, " +
    "x = excluded.x, y = excluded.y, payload_json = excluded.payload_json, updated_at = excluded.updated_at"
  ).run(id, entityType, runId, repoPath, worktreePath, x, y, JSON.stringify(nextPayload), now);

  return { id, entityType, runId };
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

    if (p === "/api/rts/runtime" && method === "GET") {
      return json(res, {
        ok: true,
        runtime: {
          cwd: process.cwd(),
          port,
          startedAt: new Date().toISOString(),
        },
      });
    }

    if (p === "/api/rts/feature/run" && method === "POST") {
      try {
        const body = JSON.parse(await readBody(req)) as {
          workflowId?: string;
          taskTitle?: string;
          prompt?: string;
          baseRepoPath?: string;
          worktreePath?: string;
          branchName?: string;
          draftId?: string;
          draftX?: number;
          draftY?: number;
          draftPort?: number;
        };
        const workflowId = (body.workflowId || "feature-dev").trim();
        const taskTitle = (body.taskTitle || body.prompt || "Feature request").trim();
        const baseRepoPath = normalizeRepoPath(String(body.baseRepoPath || ""));
        const worktreePath = resolveWorktreePath(baseRepoPath, String(body.worktreePath || ""));
        const branchName = String(body.branchName || `feature/task-${Date.now().toString().slice(-5)}`).trim();

        if (!baseRepoPath || !fs.existsSync(baseRepoPath)) {
          return json(res, { ok: false, error: `Base repo path not found: ${baseRepoPath || "(empty)"}` }, 400);
        }
        if (!fs.existsSync(path.join(baseRepoPath, ".git"))) {
          return json(res, { ok: false, error: `Not a git repo: ${baseRepoPath}` }, 400);
        }

        if (!fs.existsSync(worktreePath)) {
          const args = ["-C", baseRepoPath, "worktree", "add"];
          if (branchName) {
            if (branchExists(baseRepoPath, branchName)) {
              args.push(worktreePath, branchName);
            } else {
              args.push("-b", branchName, worktreePath);
            }
          } else {
            args.push(worktreePath);
          }
          execFileSync("git", args, { stdio: "pipe" });
        }

        const run = await runWorkflow({ workflowId, taskTitle, deferInitialKick: true });
        const db = getDb();
        const row = db.prepare("SELECT context FROM runs WHERE id = ?").get(run.id) as { context: string } | undefined;
        const context = parseRunContext(row?.context ?? "{}");
        const nextContext = {
          ...context,
          prompt: body.prompt || taskTitle,
          task: taskTitle,
          baseRepoPath,
          repoPath: baseRepoPath,
          worktreePath,
          branchName,
        };
        db.prepare("UPDATE runs SET context = ?, updated_at = ? WHERE id = ?").run(
          JSON.stringify(nextContext),
          new Date().toISOString(),
          run.id
        );

        const firstStep = db.prepare(
          "SELECT id FROM steps WHERE run_id = ? AND step_index = 0 AND status = 'pending' LIMIT 1"
        ).get(run.id) as { id: string } | undefined;
        let layout: { id: string; entityType: string; runId: string | null } | null = null;
        const draftId = String(body.draftId || "").trim();
        const draftX = Number(body.draftX);
        const draftY = Number(body.draftY);
        const draftPort = Number(body.draftPort);
        const layoutId = draftId || `feature-${run.id}`;
        layout = upsertLayoutPosition({
          entityType: "feature",
          entityId: layoutId,
          runId: run.id,
          repoPath: baseRepoPath,
          worktreePath,
          x: Number.isFinite(draftX) ? draftX : 0,
          y: Number.isFinite(draftY) ? draftY : 0,
        });
        try {
          const row2 = db.prepare("SELECT payload_json FROM rts_layout_entities WHERE id = ?").get(layout.id) as { payload_json: string } | undefined;
          let payload: Record<string, unknown> = {};
          try {
            const parsed = JSON.parse(row2?.payload_json || "{}");
            if (parsed && typeof parsed === "object") payload = parsed as Record<string, unknown>;
          } catch {}
          const nextPayload: Record<string, unknown> = {
            ...payload,
            id: layout.id,
            kind: "feature",
            repo: baseRepoPath,
            worktreePath,
            runId: run.id,
            committed: true,
            phase: "running",
            x: Number.isFinite(draftX) ? draftX : Number(payload.x || 0),
            y: Number.isFinite(draftY) ? draftY : Number(payload.y || 0),
          };
          if (Number.isFinite(draftPort) && draftPort > 0) nextPayload.port = draftPort;
          db.prepare(
            "UPDATE rts_layout_entities SET payload_json = ?, updated_at = ? WHERE id = ?"
          ).run(JSON.stringify(nextPayload), new Date().toISOString(), layout.id);
        } catch {}
        try {
          db.prepare(
            "DELETE FROM rts_layout_entities WHERE entity_type = 'feature' AND id <> ? AND (run_id = ? OR worktree_path = ?)"
          ).run(layout.id, run.id, worktreePath);
        } catch {}
        if (firstStep?.id) {
          const evt = { ts: new Date().toISOString(), event: "step.pending" as const, runId: run.id, workflowId, stepId: firstStep.id };
          emitEvent(evt);
          try {
            await immediateHandoff(evt);
          } catch {}
        }

        return json(res, { ok: true, run: getRunById(run.id), worktreePath, branchName, layout });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return json(res, { ok: false, error: message }, 500);
      }
    }

    if (p === "/api/rts/building/delete" && method === "POST") {
      try {
        const body = JSON.parse(await readBody(req)) as { runId?: string };
        const runId = String(body?.runId ?? "").trim();
        if (!runId) return json(res, { ok: false, error: "runId is required" }, 400);
        const result = deleteRunWithArtifacts(runId);
        if (!result.deleted) return json(res, { ok: true, runId, deleted: false, alreadyAbsent: true });
        return json(res, {
          ok: true,
          runId: result.runId || runId,
          deleted: true,
          previousStatus: result.status,
          worktreeRemoved: !!result.worktreeRemoved,
          worktreePath: result.worktreePath || null,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return json(res, { ok: false, error: message }, 500);
      }
    }

    if (p === "/api/rts/layout/position" && method === "POST") {
      try {
        const body = JSON.parse(await readBody(req)) as {
          entityType?: "base" | "feature" | "run";
          entityId?: string;
          runId?: string | null;
          repoPath?: string | null;
          worktreePath?: string | null;
          x?: number;
          y?: number;
          allowCreate?: boolean;
        };
        const entityType = body.entityType;
        if (entityType !== "base" && entityType !== "feature" && entityType !== "run") {
          return json(res, { ok: false, error: "entityType must be base|feature|run" }, 400);
        }
        const result = upsertLayoutPosition({
          entityType,
          entityId: body.entityId,
          runId: body.runId ?? null,
          repoPath: body.repoPath ?? null,
          worktreePath: body.worktreePath ?? null,
          x: Number(body.x ?? 0),
          y: Number(body.y ?? 0),
          allowCreate: body.allowCreate === true,
        });
        return json(res, { ok: true, ...result });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return json(res, { ok: false, error: message }, 500);
      }
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

    if (p.startsWith("/api/")) {
      return json(res, { ok: false, error: `not_found:${p}` }, 404);
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
