/**
 * Shared types for the Linear → Antfarm integration.
 *
 * These describe the shape of:
 *   - on-disk config (~/.openclaw/antfarm/linear.json)
 *   - Linear GraphQL issue payloads
 *   - linear_issue_links DB rows
 *   - sync loop results
 *
 * Keep this file type-only. No runtime imports.
 */

// ── Config ──────────────────────────────────────────────────────────

/**
 * State transitions applied to a Linear issue as an Antfarm run moves
 * through its lifecycle. Each value is a Linear workflow state id.
 *
 * Keep the set small for MVP: running, done, failed. The "ready" state
 * is what the sync loop polls to find eligible issues.
 */
export interface LinearStateMap {
  /**
   * Readiness selector: a Linear workflow state id. Issues in this
   * state are eligible for launch. Exactly one of `readyStateId` or
   * `readyLabelId` must be set.
   */
  readyStateId?: string;
  /**
   * Readiness selector: a Linear label id. Issues carrying this label
   * are eligible for launch. Exactly one of `readyStateId` or
   * `readyLabelId` must be set.
   */
  readyLabelId?: string;
  /** Applied once the Antfarm run has started. */
  runningStateId: string;
  /** Applied when the run completes successfully (done or review). */
  doneStateId: string;
  /** Applied when the run fails or is cancelled. */
  failedStateId: string;
}

/**
 * MVP config shape. Loaded from ~/.openclaw/antfarm/linear.json.
 * API token is read separately from LINEAR_API_TOKEN.
 */
export interface LinearConfig {
  /** Team to poll. MVP supports one team. */
  teamId: string;
  /** Workflow to launch for each eligible issue. MVP: "feature-dev". */
  workflowId: string;
  /** Default repo path used when the issue does not specify one. */
  defaultRepoPath: string;
  /** State id map. */
  states: LinearStateMap;
}

// ── Linear API payloads ─────────────────────────────────────────────

/** Minimal shape of a Linear workflow state returned via GraphQL. */
export interface LinearState {
  id: string;
  name: string;
  type?: string;
}

/** Minimal shape of a Linear label returned via GraphQL. */
export interface LinearLabel {
  id: string;
  name: string;
}

/** Minimal shape of a Linear user returned via GraphQL. */
export interface LinearUser {
  id: string;
  name: string;
  email?: string;
}

/**
 * Linear issue payload. Only the fields Antfarm actually uses for sync
 * and task rendering. The client maps GraphQL responses onto this.
 */
export interface LinearIssue {
  id: string;
  identifier: string;
  title: string;
  description: string | null;
  url: string;
  updatedAt: string;
  state: LinearState;
  team: { id: string; key: string };
  labels: LinearLabel[];
  assignee?: LinearUser | null;
  priority?: number;
  estimate?: number | null;
}

// ── DB row ──────────────────────────────────────────────────────────

/**
 * Sync status lifecycle for a single Linear issue link.
 *
 *   pending   issue is eligible but no run has been created yet
 *   launched  Antfarm run created, start-comment not yet posted
 *   running   start-comment posted, Linear moved to runningStateId
 *   done      run completed, completion-comment posted
 *   failed    run failed/cancelled, failure-comment posted
 */
export type LinearSyncStatus =
  | "pending"
  | "launched"
  | "running"
  | "done"
  | "failed";

/**
 * Row shape of the linear_issue_links table. Mirrors the schema in
 * src/db.ts exactly. All timestamps are ISO-8601 strings.
 */
export interface LinearIssueLinkRow {
  linear_issue_id: string;
  linear_identifier: string;
  linear_url: string;
  linear_title: string;
  team_id: string;
  workflow_id: string;
  repo_path: string;
  run_id: string | null;
  sync_status: LinearSyncStatus;
  last_linear_updated_at: string | null;
  last_synced_run_status: string | null;
  last_synced_step_id: string | null;
  last_comment_hash: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

// ── Sync loop results ───────────────────────────────────────────────

/** Per-issue outcome returned by a single sync pass. */
export interface LinearSyncIssueResult {
  linearIssueId: string;
  linearIdentifier: string;
  action:
    | "launched"
    | "started"
    | "completed"
    | "failed"
    | "skipped"
    | "noop"
    | "error";
  runId?: string;
  message?: string;
  error?: string;
}

/** Aggregate result of one sync pass across all eligible issues. */
export interface LinearSyncResult {
  scanned: number;
  launched: number;
  reconciled: number;
  errors: number;
  issues: LinearSyncIssueResult[];
}
