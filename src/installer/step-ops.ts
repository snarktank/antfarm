import { getDb } from "../db.js";

/**
 * Resolve {{key}} placeholders in a template against a context object.
 */
export function resolveTemplate(template: string, context: Record<string, string>): string {
  return template.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (_match, key: string) => {
    // Support dotted keys like context.plan by checking flat key first
    if (key in context) return context[key];
    // Try lowercase
    const lower = key.toLowerCase();
    if (lower in context) return context[lower];
    return `[missing: ${key}]`;
  });
}

interface ClaimResult {
  found: boolean;
  stepId?: string;
  runId?: string;
  resolvedInput?: string;
}

/**
 * Find and claim a pending step for an agent, returning the resolved input.
 */
export function claimStep(agentId: string): ClaimResult {
  const db = getDb();

  const step = db.prepare(
    "SELECT id, run_id, input_template FROM steps WHERE agent_id = ? AND status = 'pending' LIMIT 1"
  ).get(agentId) as { id: string; run_id: string; input_template: string } | undefined;

  if (!step) return { found: false };

  // Claim it
  db.prepare(
    "UPDATE steps SET status = 'running', updated_at = datetime('now') WHERE id = ? AND status = 'pending'"
  ).run(step.id);

  // Get run context
  const run = db.prepare("SELECT context FROM runs WHERE id = ?").get(step.run_id) as { context: string } | undefined;
  const context: Record<string, string> = run ? JSON.parse(run.context) : {};

  const resolvedInput = resolveTemplate(step.input_template, context);

  return {
    found: true,
    stepId: step.id,
    runId: step.run_id,
    resolvedInput,
  };
}

/**
 * Complete a step: save output, merge context, advance pipeline.
 */
export function completeStep(stepId: string, output: string): { advanced: boolean; runCompleted: boolean } {
  const db = getDb();

  const step = db.prepare(
    "SELECT run_id, step_index FROM steps WHERE id = ?"
  ).get(stepId) as { run_id: string; step_index: number } | undefined;

  if (!step) throw new Error(`Step not found: ${stepId}`);

  // Save output
  db.prepare(
    "UPDATE steps SET status = 'done', output = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(output, stepId);

  // Merge KEY: value lines into run context
  const run = db.prepare("SELECT context FROM runs WHERE id = ?").get(step.run_id) as { context: string };
  const context: Record<string, string> = JSON.parse(run.context);

  for (const line of output.split("\n")) {
    const match = line.match(/^([A-Z_]+):\s*(.+)$/);
    if (match) {
      context[match[1].toLowerCase()] = match[2].trim();
    }
  }

  db.prepare(
    "UPDATE runs SET context = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(JSON.stringify(context), step.run_id);

  // Advance: find next waiting step
  const next = db.prepare(
    "SELECT id FROM steps WHERE run_id = ? AND status = 'waiting' ORDER BY step_index ASC LIMIT 1"
  ).get(step.run_id) as { id: string } | undefined;

  if (next) {
    db.prepare(
      "UPDATE steps SET status = 'pending', updated_at = datetime('now') WHERE id = ?"
    ).run(next.id);
    return { advanced: true, runCompleted: false };
  } else {
    db.prepare(
      "UPDATE runs SET status = 'completed', updated_at = datetime('now') WHERE id = ?"
    ).run(step.run_id);
    return { advanced: false, runCompleted: true };
  }
}

/**
 * Fail a step, with retry logic.
 */
export function failStep(stepId: string, error: string): { retrying: boolean; runFailed: boolean } {
  const db = getDb();

  const step = db.prepare(
    "SELECT run_id, retry_count, max_retries FROM steps WHERE id = ?"
  ).get(stepId) as { run_id: string; retry_count: number; max_retries: number } | undefined;

  if (!step) throw new Error(`Step not found: ${stepId}`);

  const newRetryCount = step.retry_count + 1;

  if (newRetryCount >= step.max_retries) {
    db.prepare(
      "UPDATE steps SET status = 'failed', output = ?, retry_count = ?, updated_at = datetime('now') WHERE id = ?"
    ).run(error, newRetryCount, stepId);
    db.prepare(
      "UPDATE runs SET status = 'failed', updated_at = datetime('now') WHERE id = ?"
    ).run(step.run_id);
    return { retrying: false, runFailed: true };
  } else {
    db.prepare(
      "UPDATE steps SET status = 'pending', retry_count = ?, updated_at = datetime('now') WHERE id = ?"
    ).run(newRetryCount, stepId);
    return { retrying: true, runFailed: false };
  }
}
