import { getDb } from "../db.js";
import { logger } from "../lib/logger.js";

export interface PurgeFilter {
  runId?: string;
  status?: string;
  workflowId?: string;
  before?: string; // ISO timestamp
}

/**
 * Build and validate a purge filter.
 * Enforces guards:
 * - Filter cannot be empty (must have at least one condition)
 * - Cannot delete 'running' status workflows
 */
export function buildPurgeFilter(filter: PurgeFilter): PurgeFilter {
  // Guard 1: Reject empty filter objects
  if (Object.keys(filter).length === 0) {
    throw new Error("Filter cannot be empty. Specify at least one purge condition (runId, status, workflowId, before).");
  }

  // Guard 2: Prevent deletion of 'running' status workflows
  if (filter.status === "running") {
    throw new Error("Cannot delete runs with status 'running'. Complete or stop the workflow first.");
  }

  return filter;
}

/**
 * Delete runs and their associated steps/stories based on filter.
 * Uses parameterized queries to prevent SQL injection.
 * Returns count of deleted runs.
 */
export function deleteRuns(filter: PurgeFilter): number {
  // Validate filter
  buildPurgeFilter(filter);

  const db = getDb();
  const whereClauses: string[] = [];
  const params: any[] = [];

  if (filter.runId) {
    whereClauses.push("id = ?");
    params.push(filter.runId);
  }
  if (filter.status) {
    whereClauses.push("status != ?");
    params.push("running");
    whereClauses.push("status = ?");
    params.push(filter.status);
  }
  if (filter.workflowId) {
    whereClauses.push("workflow_id = ?");
    params.push(filter.workflowId);
  }
  if (filter.before) {
    whereClauses.push("created_at < ?");
    params.push(filter.before);
  }

  const whereClause = whereClauses.join(" AND ");

  try {
    // Get list of run IDs to delete
    const stmt = db.prepare(`SELECT id FROM runs WHERE ${whereClause}`);
    const runs = stmt.all(...params) as Array<{ id: string }>;

    if (runs.length === 0) {
      logger.info(`Purge: No runs matched filter, nothing deleted.`);
      return 0;
    }

    const runIds = runs.map((r) => r.id);

    // Delete in transaction
    db.exec("BEGIN");
    try {
      // Delete stories for matched runs
      const storyStmt = db.prepare("DELETE FROM stories WHERE run_id = ?");
      for (const runId of runIds) {
        storyStmt.run(runId);
      }

      // Delete steps for matched runs
      const stepStmt = db.prepare("DELETE FROM steps WHERE run_id = ?");
      for (const runId of runIds) {
        stepStmt.run(runId);
      }

      // Delete runs themselves
      const runStmt = db.prepare(`DELETE FROM runs WHERE ${whereClause}`);
      runStmt.run(...params);

      db.exec("COMMIT");
      logger.info(`Purge: Deleted ${runIds.length} runs and their associated steps/stories.`);
      return runIds.length;
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  } catch (err) {
    logger.error(`Purge failed: ${err}`);
    throw err;
  }
}

/**
 * Get count of runs that would be deleted by a filter (dry-run).
 */
export function countPurgeMatches(filter: PurgeFilter): number {
  // Validate filter
  buildPurgeFilter(filter);

  const db = getDb();
  const whereClauses: string[] = [];
  const params: any[] = [];

  if (filter.runId) {
    whereClauses.push("id = ?");
    params.push(filter.runId);
  }
  if (filter.status) {
    whereClauses.push("status != ?");
    params.push("running");
    whereClauses.push("status = ?");
    params.push(filter.status);
  }
  if (filter.workflowId) {
    whereClauses.push("workflow_id = ?");
    params.push(filter.workflowId);
  }
  if (filter.before) {
    whereClauses.push("created_at < ?");
    params.push(filter.before);
  }

  const whereClause = whereClauses.join(" AND ");
  const row = db.prepare(`SELECT COUNT(*) AS cnt FROM runs WHERE ${whereClause}`).get(...params) as { cnt: number };
  return row.cnt;
}
