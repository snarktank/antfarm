import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { getDb } from "../db.js";

export interface UsageRecord {
  id?: string;
  runId?: string;
  stepId?: string;
  agentId: string;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  costUsd?: number;
  taskLabel?: string;
  createdAt?: string;
  sourceKey?: string;
}

export function insertUsage(record: UsageRecord): string {
  const db = getDb();
  const id = record.id ?? crypto.randomUUID();
  const createdAt = record.createdAt ?? new Date().toISOString();

  db.prepare(`
    INSERT INTO usage (
      id, run_id, step_id, agent_id, model,
      input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
      cost_usd, task_label, source_key, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    record.runId ?? null,
    record.stepId ?? null,
    record.agentId,
    record.model,
    record.inputTokens ?? null,
    record.outputTokens ?? null,
    record.cacheReadTokens ?? null,
    record.cacheWriteTokens ?? null,
    record.costUsd ?? null,
    record.taskLabel ?? null,
    record.sourceKey ?? null,
    createdAt,
  );

  return id;
}

export function getUsageLog(options: {
  limit?: number;
  offset?: number;
  fromDate?: string;
  toDate?: string;
  agentId?: string;
  model?: string;
} = {}) {
  const db = getDb();
  const limit = options.limit ?? 50;
  const offset = options.offset ?? 0;

  const whereClauses: string[] = [];
  const params: any[] = [];

  if (options.fromDate) {
    whereClauses.push("created_at >= ?");
    params.push(options.fromDate);
  }
  if (options.toDate) {
    whereClauses.push("created_at <= ?");
    params.push(options.toDate);
  }
  if (options.agentId) {
    whereClauses.push("agent_id = ?");
    params.push(options.agentId);
  }
  if (options.model) {
    whereClauses.push("model = ?");
    params.push(options.model);
  }

  const whereSQL = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

  const countRow = db.prepare(`SELECT COUNT(*) as total FROM usage ${whereSQL}`).get(...params) as { total: number };
  const total = countRow.total;

  const rows = db.prepare(`
    SELECT * FROM usage
    ${whereSQL}
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset) as Array<Record<string, unknown>>;

  return {
    records: rows.map(mapRowToUsageRecord),
    total,
    limit,
    offset,
  };
}

export function getAggregatedUsage(options: {
  fromDate?: string;
  toDate?: string;
  agentId?: string;
  model?: string;
  groupBy?: "agent" | "model" | "task" | "day";
}) {
  const db = getDb();
  const whereClauses: string[] = [];
  const params: any[] = [];

  if (options.fromDate) {
    whereClauses.push("created_at >= ?");
    params.push(options.fromDate);
  }
  if (options.toDate) {
    whereClauses.push("created_at <= ?");
    params.push(options.toDate);
  }
  if (options.agentId) {
    whereClauses.push("agent_id = ?");
    params.push(options.agentId);
  }
  if (options.model) {
    whereClauses.push("model = ?");
    params.push(options.model);
  }

  const whereSQL = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

  if (!options.groupBy) {
    const row = db.prepare(`
      SELECT
        COALESCE(SUM(input_tokens), 0) as total_input_tokens,
        COALESCE(SUM(output_tokens), 0) as total_output_tokens,
        COALESCE(SUM(cost_usd), 0) as total_cost_usd,
        COUNT(*) as record_count
      FROM usage
      ${whereSQL}
    `).get(...params) as {
      total_input_tokens: number;
      total_output_tokens: number;
      total_cost_usd: number;
      record_count: number;
    };

    return {
      totalInputTokens: row.total_input_tokens,
      totalOutputTokens: row.total_output_tokens,
      totalCostUsd: row.total_cost_usd,
      recordCount: row.record_count,
    };
  }

  let groupColumn: string;
  switch (options.groupBy) {
    case "agent":
      groupColumn = "agent_id";
      break;
    case "model":
      groupColumn = "model";
      break;
    case "task":
      groupColumn = "task_label";
      break;
    case "day":
      groupColumn = "DATE(created_at)";
      break;
    default:
      throw new Error(`Invalid group_by value: ${options.groupBy}`);
  }

  const rows = db.prepare(`
    SELECT
      ${groupColumn} as group_key,
      COALESCE(SUM(input_tokens), 0) as total_input_tokens,
      COALESCE(SUM(output_tokens), 0) as total_output_tokens,
      COALESCE(SUM(cost_usd), 0) as total_cost_usd,
      COUNT(*) as record_count
    FROM usage
    ${whereSQL}
    GROUP BY ${groupColumn}
    ORDER BY ${groupColumn}
  `).all(...params) as Array<{
    group_key: string | null;
    total_input_tokens: number;
    total_output_tokens: number;
    total_cost_usd: number;
    record_count: number;
  }>;

  return rows.map((row) => ({
    groupKey: row.group_key ?? "(none)",
    totalInputTokens: row.total_input_tokens,
    totalOutputTokens: row.total_output_tokens,
    totalCostUsd: row.total_cost_usd,
    recordCount: row.record_count,
  }));
}

function mapRowToUsageRecord(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    runId: (row.run_id as string | null) ?? undefined,
    stepId: (row.step_id as string | null) ?? undefined,
    agentId: row.agent_id as string,
    model: row.model as string,
    inputTokens: (row.input_tokens as number | null) ?? undefined,
    outputTokens: (row.output_tokens as number | null) ?? undefined,
    cacheReadTokens: (row.cache_read_tokens as number | null) ?? undefined,
    cacheWriteTokens: (row.cache_write_tokens as number | null) ?? undefined,
    costUsd: (row.cost_usd as number | null) ?? undefined,
    taskLabel: (row.task_label as string | null) ?? undefined,
    sourceKey: (row.source_key as string | null) ?? undefined,
    createdAt: row.created_at as string,
  };
}

function resolveAgentsRootDir() {
  const env = process.env.OPENCLAW_AGENTS_DIR?.trim();
  if (env) return path.resolve(env);
  return path.join(os.homedir(), ".openclaw", "agents");
}

function inferAgentIdFromPath(sessionPath: string): string {
  const sessionsDir = path.dirname(sessionPath);
  const agentDir = path.dirname(sessionsDir);
  return path.basename(agentDir);
}

function inferSessionId(sessionPath: string): string {
  return path.basename(sessionPath, ".jsonl");
}

export function ingestUsageFromSessions(): { imported: number; filesScanned: number } {
  const db = getDb();
  const root = resolveAgentsRootDir();

  db.exec("DELETE FROM usage");

  if (!fs.existsSync(root)) {
    return { imported: 0, filesScanned: 0 };
  }

  let filesScanned = 0;
  let imported = 0;

  const agentEntries = fs.readdirSync(root, { withFileTypes: true });
  for (const agentEntry of agentEntries) {
    if (!agentEntry.isDirectory()) continue;

    const sessionsDir = path.join(root, agentEntry.name, "sessions");
    if (!fs.existsSync(sessionsDir)) continue;

    const sessionFiles = fs.readdirSync(sessionsDir, { withFileTypes: true });
    for (const file of sessionFiles) {
      if (!file.isFile() || !file.name.endsWith(".jsonl")) continue;
      filesScanned += 1;
      const fullPath = path.join(sessionsDir, file.name);

      const text = fs.readFileSync(fullPath, "utf-8");
      const lines = text.split(/\r?\n/);

      for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i]?.trim();
        if (!line) continue;

        let parsed: any;
        try {
          parsed = JSON.parse(line);
        } catch {
          continue;
        }

        if (parsed?.type !== "message") continue;
        if (!parsed?.usage || !parsed?.cost) continue;

        const usage = parsed.usage;
        const cost = parsed.cost;
        const totalCost = Number(cost.total);
        if (!Number.isFinite(totalCost)) continue;

        const model = typeof parsed.model === "string" && parsed.model.length > 0 ? parsed.model : "unknown";
        const agentId = typeof parsed.agentId === "string" && parsed.agentId.length > 0
          ? parsed.agentId
          : inferAgentIdFromPath(fullPath);

        const sessionId = inferSessionId(fullPath);
        const runId = typeof parsed.runId === "string" ? parsed.runId : sessionId;
        const stepId = typeof parsed.stepId === "string" ? parsed.stepId : undefined;
        const sourceKey = `${fullPath}:${i + 1}`;

        const createdAt = typeof parsed.timestamp === "string"
          ? parsed.timestamp
          : typeof parsed.created_at === "string"
            ? parsed.created_at
            : new Date().toISOString();

        const inputTokens = Number(usage.input_tokens ?? 0);
        const outputTokens = Number(usage.output_tokens ?? 0);
        const cacheReadTokens = Number(usage.cache_read_tokens ?? 0);
        const cacheWriteTokens = Number(usage.cache_write_tokens ?? 0);

        db.prepare(`
          INSERT OR IGNORE INTO usage (
            id, run_id, step_id, agent_id, model,
            input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
            cost_usd, task_label, source_key, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          crypto.randomUUID(),
          runId,
          stepId ?? null,
          agentId,
          model,
          Number.isFinite(inputTokens) ? inputTokens : null,
          Number.isFinite(outputTokens) ? outputTokens : null,
          Number.isFinite(cacheReadTokens) ? cacheReadTokens : null,
          Number.isFinite(cacheWriteTokens) ? cacheWriteTokens : null,
          totalCost,
          typeof parsed.taskLabel === "string" ? parsed.taskLabel : null,
          sourceKey,
          createdAt,
        );

        imported += 1;
      }
    }
  }

  return { imported, filesScanned };
}
