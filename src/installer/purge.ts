/**
 * Purge helper module for building SQL WHERE clauses based on filter criteria.
 */

import { getDb } from "../db.js";

export interface PurgeFilters {
  status?: string;
  olderThanDays?: number;
}

/**
 * Build a SQL WHERE clause based on the provided filters.
 *
 * - {status: 'cancelled'} -> "WHERE status = 'cancelled'"
 * - {olderThanDays: 7} -> 'WHERE created_at < datetime("now", "-7 days")'
 * - {status: 'cancelled', olderThanDays: 7} -> combined with AND
 *
 * @param filters - Filter configuration
 * @returns SQL WHERE clause string
 * @throws Error if no filters provided or if status is 'running'
 */
export function buildPurgeFilter(filters: PurgeFilters): string {
  if (!filters.status && filters.olderThanDays === undefined) {
    throw new Error("No filters provided");
  }

  if (filters.status === "running") {
    throw new Error("Cannot delete runs with status 'running'");
  }

  const clauses: string[] = [];

  if (filters.status) {
    clauses.push(`status = '${filters.status}'`);
  }

  if (filters.olderThanDays !== undefined) {
    clauses.push(`created_at < datetime("now", "-${filters.olderThanDays} days")`);
  }

  if (clauses.length === 0) {
    throw new Error("No filters provided");
  }

  return `WHERE ${clauses.join(" AND ")}`;
}

export interface DeleteRunsResult {
  count: number;
  stepsDeleted: number;
  storiesDeleted: number;
}

/**
 * Delete runs and their associated steps/stories based on filters.
 *
 * @param filters - Filter criteria (status, olderThanDays)
 * @param dryRun - If true, count only without deleting
 * @returns Result with counts of deleted items
 * @throws Error if no filters provided or if status is 'running'
 */
export function deleteRuns(filters: PurgeFilters, dryRun: boolean = false): DeleteRunsResult {
  // Validate filters (this will throw if invalid)
  const whereClause = buildPurgeFilter(filters);

  const db = getDb();

  // Find matching run IDs
  const query = `SELECT id FROM runs ${whereClause}`;
  const runRows = db.prepare(query).all() as Array<{ id: string }>;
  const runIds = runRows.map((r) => r.id);

  if (runIds.length === 0) {
    return { count: 0, stepsDeleted: 0, storiesDeleted: 0 };
  }

  if (dryRun) {
    return {
      count: runIds.length,
      stepsDeleted: 0,
      storiesDeleted: 0,
    };
  }

  // Delete associated steps
  const placeholders = runIds.map(() => "?").join(",");
  const stepsDeleted = Number(db.prepare(`DELETE FROM steps WHERE run_id IN (${placeholders})`).run(...runIds).changes);
  const storiesDeleted = Number(db.prepare(`DELETE FROM stories WHERE run_id IN (${placeholders})`).run(...runIds).changes);

  // Delete the runs themselves
  const runsDeleted = Number(db.prepare(`DELETE FROM runs WHERE id IN (${placeholders})`).run(...runIds).changes);

  return {
    count: runsDeleted,
    stepsDeleted,
    storiesDeleted,
  };
}
