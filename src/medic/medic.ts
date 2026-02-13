/**
 * Medic — the antfarm health watchdog.
 *
 * Runs periodic health checks on workflow runs, detects stuck/stalled/dead state,
 * and takes corrective action where safe. Logs all findings to the medic_checks table.
 */
import { getDb } from "../db.js";
import { emitEvent, type EventType } from "../installer/events.js";
import { teardownWorkflowCronsIfIdle } from "../installer/agent-cron.js";
import { listCronJobs } from "../installer/gateway-api.js";
import {
  runSyncChecks,
  checkOrphanedCrons,
  type MedicFinding,
} from "./checks.js";
import crypto from "node:crypto";

// ── DB Migration ────────────────────────────────────────────────────

export function ensureMedicTables(): void {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS medic_checks (
      id TEXT PRIMARY KEY,
      checked_at TEXT NOT NULL,
      issues_found INTEGER DEFAULT 0,
      actions_taken INTEGER DEFAULT 0,
      summary TEXT,
      details TEXT
    )
  `);
}

// ── Remediation ─────────────────────────────────────────────────────

/**
 * Attempt to remediate a finding. Returns true if action was taken.
 */
async function remediate(finding: MedicFinding): Promise<boolean> {
  const db = getDb();

  switch (finding.action) {
    case "reset_step": {
      if (!finding.stepId) return false;
      // Reset the stuck step to pending so it can be reclaimed
      const step = db.prepare(
        "SELECT abandoned_count FROM steps WHERE id = ?"
      ).get(finding.stepId) as { abandoned_count: number } | undefined;
      if (!step) return false;

      const newCount = (step.abandoned_count ?? 0) + 1;
      // Don't auto-reset if already abandoned too many times — let cleanupAbandonedSteps handle final failure
      if (newCount >= 5) {
        db.prepare(
          "UPDATE steps SET status = 'failed', output = 'Medic: abandoned too many times', abandoned_count = ?, updated_at = datetime('now') WHERE id = ?"
        ).run(newCount, finding.stepId);
        if (finding.runId) {
          db.prepare(
            "UPDATE runs SET status = 'failed', updated_at = datetime('now') WHERE id = ?"
          ).run(finding.runId);
          emitEvent({
            ts: new Date().toISOString(),
            event: "run.failed" as EventType,
            runId: finding.runId,
            detail: "Medic: step abandoned too many times",
          });
        }
        return true;
      }

      db.prepare(
        "UPDATE steps SET status = 'pending', abandoned_count = ?, updated_at = datetime('now') WHERE id = ?"
      ).run(newCount, finding.stepId);
      if (finding.runId) {
        emitEvent({
          ts: new Date().toISOString(),
          event: "step.timeout" as EventType,
          runId: finding.runId,
          stepId: finding.stepId,
          detail: `Medic: reset stuck step (abandon ${newCount}/5)`,
        });
      }
      return true;
    }

    case "fail_run": {
      if (!finding.runId) return false;
      const run = db.prepare("SELECT status, workflow_id FROM runs WHERE id = ?").get(finding.runId) as { status: string; workflow_id: string } | undefined;
      if (!run || run.status !== "running") return false;

      db.prepare(
        "UPDATE runs SET status = 'failed', updated_at = datetime('now') WHERE id = ?"
      ).run(finding.runId);
      // Also fail any non-terminal steps
      db.prepare(
        "UPDATE steps SET status = 'failed', output = 'Medic: run marked as dead', updated_at = datetime('now') WHERE run_id = ? AND status IN ('waiting', 'pending', 'running')"
      ).run(finding.runId);
      emitEvent({
        ts: new Date().toISOString(),
        event: "run.failed" as EventType,
        runId: finding.runId,
        workflowId: run.workflow_id,
        detail: "Medic: zombie run — all steps terminal but run still marked running",
      });
      // Try to clean up crons
      try { await teardownWorkflowCronsIfIdle(run.workflow_id); } catch {}
      return true;
    }

    case "teardown_crons": {
      // Extract workflow ID from the message (format: "... for workflow "xyz" ...")
      const match = finding.message.match(/workflow "([^"]+)"/);
      if (!match) return false;
      try {
        await teardownWorkflowCronsIfIdle(match[1]);
        return true;
      } catch {
        return false;
      }
    }

    case "none":
    default:
      return false;
  }
}

// ── Main Check Runner ───────────────────────────────────────────────

export interface MedicCheckResult {
  id: string;
  checkedAt: string;
  issuesFound: number;
  actionsTaken: number;
  summary: string;
  findings: MedicFinding[];
}

/**
 * Run all medic checks, remediate what we can, and log results.
 */
export async function runMedicCheck(): Promise<MedicCheckResult> {
  ensureMedicTables();

  // Gather all findings
  const findings: MedicFinding[] = runSyncChecks();

  // Async check: orphaned crons
  try {
    const cronResult = await listCronJobs();
    if (cronResult.ok && cronResult.jobs) {
      const antfarmCrons = cronResult.jobs.filter(j => j.name.startsWith("antfarm/"));
      findings.push(...checkOrphanedCrons(antfarmCrons));
    }
  } catch {
    // Can't check crons — skip this check
  }

  // Remediate
  let actionsTaken = 0;
  for (const finding of findings) {
    if (finding.action !== "none") {
      const success = await remediate(finding);
      if (success) {
        finding.remediated = true;
        actionsTaken++;
      }
    }
  }

  // Build summary
  const parts: string[] = [];
  if (findings.length === 0) {
    parts.push("All clear — no issues found");
  } else {
    const critical = findings.filter(f => f.severity === "critical").length;
    const warnings = findings.filter(f => f.severity === "warning").length;
    if (critical > 0) parts.push(`${critical} critical`);
    if (warnings > 0) parts.push(`${warnings} warning(s)`);
    if (actionsTaken > 0) parts.push(`${actionsTaken} auto-fixed`);
  }
  const summary = parts.join(", ");

  // Log to DB
  const checkId = crypto.randomUUID();
  const checkedAt = new Date().toISOString();
  const db = getDb();
  db.prepare(
    "INSERT INTO medic_checks (id, checked_at, issues_found, actions_taken, summary, details) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(checkId, checkedAt, findings.length, actionsTaken, summary, JSON.stringify(findings));

  // Prune old checks (keep last 500)
  db.prepare(`
    DELETE FROM medic_checks WHERE id NOT IN (
      SELECT id FROM medic_checks ORDER BY checked_at DESC LIMIT 500
    )
  `).run();

  return {
    id: checkId,
    checkedAt,
    issuesFound: findings.length,
    actionsTaken,
    summary,
    findings,
  };
}

// ── Query Helpers ───────────────────────────────────────────────────

export interface MedicStatus {
  installed: boolean;
  lastCheck: { checkedAt: string; summary: string; issuesFound: number; actionsTaken: number } | null;
  recentChecks: number; // checks in last 24h
  recentIssues: number; // issues found in last 24h
  recentActions: number; // actions taken in last 24h
}

export function getMedicStatus(): MedicStatus {
  try {
    ensureMedicTables();
    const db = getDb();

    const last = db.prepare(
      "SELECT checked_at, summary, issues_found, actions_taken FROM medic_checks ORDER BY checked_at DESC LIMIT 1"
    ).get() as { checked_at: string; summary: string; issues_found: number; actions_taken: number } | undefined;

    const stats = db.prepare(`
      SELECT COUNT(*) as checks, COALESCE(SUM(issues_found), 0) as issues, COALESCE(SUM(actions_taken), 0) as actions
      FROM medic_checks
      WHERE checked_at > datetime('now', '-24 hours')
    `).get() as { checks: number; issues: number; actions: number };

    return {
      installed: true,
      lastCheck: last ? {
        checkedAt: last.checked_at,
        summary: last.summary,
        issuesFound: last.issues_found,
        actionsTaken: last.actions_taken,
      } : null,
      recentChecks: stats.checks,
      recentIssues: stats.issues,
      recentActions: stats.actions,
    };
  } catch {
    return { installed: false, lastCheck: null, recentChecks: 0, recentIssues: 0, recentActions: 0 };
  }
}

export function getRecentMedicChecks(limit = 20): Array<{
  id: string;
  checkedAt: string;
  issuesFound: number;
  actionsTaken: number;
  summary: string;
  details: MedicFinding[];
}> {
  try {
    ensureMedicTables();
    const db = getDb();
    const rows = db.prepare(
      "SELECT * FROM medic_checks ORDER BY checked_at DESC LIMIT ?"
    ).all(limit) as Array<{
      id: string; checked_at: string; issues_found: number;
      actions_taken: number; summary: string; details: string;
    }>;

    return rows.map(r => ({
      id: r.id,
      checkedAt: r.checked_at,
      issuesFound: r.issues_found,
      actionsTaken: r.actions_taken,
      summary: r.summary,
      details: JSON.parse(r.details ?? "[]"),
    }));
  } catch {
    return [];
  }
}
