import { getDb } from "../db.js";

interface StuckStep {
  id: string;
  run_id: string;
  step_id: string;
  agent_id: string;
  status: string;
  updated_at: string;
}

/**
 * Find steps that have been in "running" status for longer than the threshold.
 */
export function findStuckSteps(thresholdMinutes = 30): StuckStep[] {
  const db = getDb();
  return db.prepare(
    `SELECT id, run_id, step_id, agent_id, status, updated_at
     FROM steps
     WHERE status = 'running'
       AND (julianday('now') - julianday(updated_at)) * 24 * 60 > ?
     ORDER BY updated_at ASC`
  ).all(thresholdMinutes) as unknown as StuckStep[];
}

/**
 * Reset stuck steps back to "pending" so they can be re-claimed.
 * Returns the number of steps recovered.
 */
export function recoverStuckSteps(thresholdMinutes = 30): number {
  const db = getDb();
  const stuck = findStuckSteps(thresholdMinutes);
  if (stuck.length === 0) return 0;

  for (const step of stuck) {
    db.prepare(
      "UPDATE steps SET status = 'pending', current_story_id = NULL, updated_at = datetime('now') WHERE id = ?"
    ).run(step.id);

    // If this was a loop step with a running story, reset the story too
    const runningStory = db.prepare(
      "SELECT id FROM stories WHERE run_id = ? AND status = 'running' LIMIT 1"
    ).get(step.run_id) as { id: string } | undefined;
    if (runningStory) {
      db.prepare(
        "UPDATE stories SET status = 'pending', updated_at = datetime('now') WHERE id = ?"
      ).run(runningStory.id);
    }
  }

  return stuck.length;
}
