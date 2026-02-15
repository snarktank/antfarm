/**
 * Purge helper module for building SQL WHERE clauses based on filter criteria.
 */

export interface PurgeFilters {
  status?: string;
  olderThanDays?: number;
}

/**
 * Build a SQL WHERE clause based on the provided filters.
 *
 * - {status: 'cancelled'} -> "WHERE status = ?"
 * - {olderThanDays: 7} -> 'WHERE created_at < datetime("now", "-7 days")'
 * - {status: 'cancelled', olderThanDays: 7} -> combined with AND
 * - {} -> "" (empty string)
 *
 * @param filters - Filter configuration
 * @returns SQL WHERE clause string (without WHERE prefix if empty)
 */
export function buildPurgeFilter(filters: PurgeFilters): string {
  const clauses: string[] = [];

  if (filters.status) {
    clauses.push(`status = ?`);
  }

  if (filters.olderThanDays !== undefined) {
    clauses.push(`created_at < datetime("now", "-${filters.olderThanDays} days")`);
  }

  if (clauses.length === 0) {
    return "";
  }

  return `WHERE ${clauses.join(" AND ")}`;
}
