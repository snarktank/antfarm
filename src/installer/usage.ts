import { getDb } from "../db.js";
import type { UsageRecord } from "./types.js";
import crypto from "node:crypto";

/**
 * Insert a usage record into the database.
 * If no id is provided, one will be generated.
 * Returns the id of the inserted record.
 */
export function insertUsage(record: Omit<UsageRecord, "id" | "createdAt"> & { id?: string; createdAt?: string }): string {
  const db = getDb();
  const id = record.id ?? crypto.randomUUID();
  const createdAt = record.createdAt ?? new Date().toISOString();

  db.prepare(`
    INSERT INTO usage (id, run_id, step_id, agent_id, model, input_tokens, output_tokens, cost_usd, task_label, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    record.runId ?? null,
    record.stepId ?? null,
    record.agentId,
    record.model,
    record.inputTokens ?? null,
    record.outputTokens ?? null,
    record.costUsd ?? null,
    record.taskLabel ?? null,
    createdAt
  );

  return id;
}

/**
 * Get all usage records for a given run ID.
 */
export function getUsageByRunId(runId: string): UsageRecord[] {
  const db = getDb();
  const rows = db.prepare(
    "SELECT * FROM usage WHERE run_id = ? ORDER BY created_at ASC"
  ).all(runId) as any[];

  return rows.map(mapRowToUsageRecord);
}

/**
 * Get all usage records for a given agent ID.
 */
export function getUsageByAgentId(agentId: string): UsageRecord[] {
  const db = getDb();
  const rows = db.prepare(
    "SELECT * FROM usage WHERE agent_id = ? ORDER BY created_at ASC"
  ).all(agentId) as any[];

  return rows.map(mapRowToUsageRecord);
}

/**
 * Map a database row to a UsageRecord object.
 */
function mapRowToUsageRecord(row: any): UsageRecord {
  return {
    id: row.id,
    runId: row.run_id ?? undefined,
    stepId: row.step_id ?? undefined,
    agentId: row.agent_id,
    model: row.model,
    inputTokens: row.input_tokens ?? undefined,
    outputTokens: row.output_tokens ?? undefined,
    costUsd: row.cost_usd ?? undefined,
    taskLabel: row.task_label ?? undefined,
    createdAt: row.created_at,
  };
}

export type UsageAggregate = {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
  recordCount: number;
};

export type GroupedUsageAggregate = UsageAggregate & {
  groupKey: string;
};

export type AggregateQueryOptions = {
  groupBy?: "agent" | "model" | "task" | "day";
  fromDate?: string;
  toDate?: string;
  agentId?: string;
  model?: string;
};

/**
 * Get aggregated usage data with optional grouping and filtering.
 * 
 * When groupBy is not specified, returns a single UsageAggregate with totals.
 * When groupBy is specified, returns an array of GroupedUsageAggregate.
 */
export type UsageLogOptions = {
  limit?: number;
  offset?: number;
  fromDate?: string;
  toDate?: string;
  agentId?: string;
  model?: string;
};

export type UsageLogResult = {
  records: UsageRecord[];
  total: number;
  limit: number;
  offset: number;
};

/**
 * Get paginated raw usage records with optional filtering.
 * Returns records ordered by created_at DESC (newest first).
 */
export function getUsageLog(options: UsageLogOptions = {}): UsageLogResult {
  const db = getDb();
  const limit = options.limit ?? 50;
  const offset = options.offset ?? 0;
  const whereClauses: string[] = [];
  const params: (string | number)[] = [];

  // Build WHERE clauses for filters
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

  // Get total count
  const countRow = db.prepare(`SELECT COUNT(*) as total FROM usage ${whereSQL}`).get(...params) as { total: number };
  const total = countRow.total;

  // Get paginated records
  const rows = db.prepare(`
    SELECT * FROM usage
    ${whereSQL}
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset) as any[];

  return {
    records: rows.map(mapRowToUsageRecord),
    total,
    limit,
    offset,
  };
}

export function getAggregatedUsage(options: AggregateQueryOptions): UsageAggregate | GroupedUsageAggregate[] {
  const db = getDb();
  const whereClauses: string[] = [];
  const params: (string | number)[] = [];

  // Build WHERE clauses for filters
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
    // Return single aggregate totals
    const row = db.prepare(`
      SELECT 
        COALESCE(SUM(input_tokens), 0) as total_input_tokens,
        COALESCE(SUM(output_tokens), 0) as total_output_tokens,
        COALESCE(SUM(cost_usd), 0) as total_cost_usd,
        COUNT(*) as record_count
      FROM usage
      ${whereSQL}
    `).get(...params) as any;

    return {
      totalInputTokens: row.total_input_tokens,
      totalOutputTokens: row.total_output_tokens,
      totalCostUsd: row.total_cost_usd,
      recordCount: row.record_count,
    };
  }

  // Determine the GROUP BY column
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
      // Extract date portion from ISO timestamp
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
  `).all(...params) as any[];

  return rows.map(row => ({
    groupKey: row.group_key ?? "(none)",
    totalInputTokens: row.total_input_tokens,
    totalOutputTokens: row.total_output_tokens,
    totalCostUsd: row.total_cost_usd,
    recordCount: row.record_count,
  }));
}
