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
