import { getDb } from "../db.js";
import type { LoopConfig, Story } from "./types.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { teardownWorkflowCronsIfIdle } from "./agent-cron.js";
import { emitEvent } from "./events.js";

/**
 * Fire-and-forget cron teardown when a run ends.
 * Looks up the workflow_id for the run and tears down crons if no other active runs.
 */
function scheduleRunCronTeardown(runId: string): void {
  try {
    const db = getDb();
    const run = db.prepare("SELECT workflow_id FROM runs WHERE id = ?").get(runId) as { workflow_id: string } | undefined;
    if (run) {
      teardownWorkflowCronsIfIdle(run.workflow_id).catch(() => {});
    }
  } catch {
    // best-effort
  }
}

function getWorkflowId(runId: string): string | undefined {
  try {
    const db = getDb();
    const row = db.prepare("SELECT workflow_id FROM runs WHERE id = ?").get(runId) as { workflow_id: string } | undefined;
    return row?.workflow_id;
  } catch { return undefined; }
}

// ── Helpers ─────────────────────────────────────────────────────────

/**
 * Resolve {{key}} placeholders in a template against a context object.
 */
export function resolveTemplate(template: string, context: Record<string, string>): string {
  return template.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (_match, key: string) => {
    if (key in context) return context[key];
    const lower = key.toLowerCase();
    if (lower in context) return context[lower];
    return `[missing: ${key}]`;
  });
}

/**
 * Get the workspace path for an OpenClaw agent by its id.
 */
function getAgentWorkspacePath(agentId: string): string | null {
  try {
    const configPath = path.join(os.homedir(), ".openclaw", "openclaw.json");
    const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    const agent = config.agents?.list?.find((a: any) => a.id === agentId);
    return agent?.workspace ?? null;
  } catch {
    return null;
  }
}

/**
 * Read progress.txt from the loop step's agent workspace.
 */
function readProgressFile(runId: string): string {
  const db = getDb();
  const loopStep = db.prepare(
    "SELECT agent_id FROM steps WHERE run_id = ? AND type = 'loop' LIMIT 1"
  ).get(runId) as { agent_id: string } | undefined;
  if (!loopStep) return "(no progress file)";
  const workspace = getAgentWorkspacePath(loopStep.agent_id);
  if (!workspace) return "(no progress file)";
  try {
    return fs.readFileSync(path.join(workspace, "progress.txt"), "utf-8");
  } catch {
    return "(no progress yet)";
  }
}

/**
 * Get all stories for a run, ordered by story_index.
 */
export function getStories(runId: string): Story[] {
  const db = getDb();
  const rows = db.prepare(
    "SELECT * FROM stories WHERE run_id = ? ORDER BY story_index ASC"
  ).all(runId) as any[];
  return rows.map(r => ({
    id: r.id,
    runId: r.run_id,
    storyIndex: r.story_index,
    storyId: r.story_id,
    title: r.title,
    description: r.description,
    acceptanceCriteria: JSON.parse(r.acceptance_criteria),
    status: r.status,
    output: r.output ?? undefined,
    retryCount: r.retry_count,
    maxRetries: r.max_retries,
  }));
}

/**
 * Get the story currently being worked on by a loop step.
 */
export function getCurrentStory(stepId: string): Story | null {
  const db = getDb();
  const step = db.prepare(
    "SELECT current_story_id FROM steps WHERE id = ?"
  ).get(stepId) as { current_story_id: string | null } | undefined;
  if (!step?.current_story_id) return null;
  const row = db.prepare("SELECT * FROM stories WHERE id = ?").get(step.current_story_id) as any;
  if (!row) return null;
  return {
    id: row.id,
    runId: row.run_id,
    storyIndex: row.story_index,
    storyId: row.story_id,
    title: row.title,
    description: row.description,
    acceptanceCriteria: JSON.parse(row.acceptance_criteria),
    status: row.status,
    output: row.output ?? undefined,
    retryCount: row.retry_count,
    maxRetries: row.max_retries,
  };
}

function formatStoryForTemplate(story: Story): string {
  const ac = story.acceptanceCriteria.map((c, i) => `  ${i + 1}. ${c}`).join("\n");
  return `Story ${story.storyId}: ${story.title}\n\n${story.description}\n\nAcceptance Criteria:\n${ac}`;
}

function formatCompletedStories(stories: Story[]): string {
  const done = stories.filter(s => s.status === "done");
  if (done.length === 0) return "(none yet)";
  return done.map(s => `- ${s.storyId}: ${s.title}`).join("\n");
}

// ── T5: STORIES_JSON parsing ────────────────────────────────────────

/**
 * Parse STORIES_JSON from step output and insert stories into the DB.
 */
function parseAndInsertStories(output: string, runId: string): void {
  const lines = output.split("\n");
  const startIdx = lines.findIndex(l => l.startsWith("STORIES_JSON:"));
  if (startIdx === -1) return;

  // Collect JSON text: first line after prefix, then subsequent lines until next KEY: or end
  const firstLine = lines[startIdx].slice("STORIES_JSON:".length).trim();
  const jsonLines = [firstLine];
  for (let i = startIdx + 1; i < lines.length; i++) {
    if (/^[A-Z_]+:\s/.test(lines[i])) break;
    jsonLines.push(lines[i]);
  }

  const jsonText = jsonLines.join("\n").trim();
  let stories: any[];
  try {
    stories = JSON.parse(jsonText);
  } catch (e) {
    throw new Error(`Failed to parse STORIES_JSON: ${(e as Error).message}`);
  }

  if (!Array.isArray(stories)) {
    throw new Error("STORIES_JSON must be an array");
  }
  if (stories.length > 20) {
    throw new Error(`STORIES_JSON has ${stories.length} stories, max is 20`);
  }

  const db = getDb();
  const now = new Date().toISOString();
  const insert = db.prepare(
    "INSERT INTO stories (id, run_id, story_index, story_id, title, description, acceptance_criteria, status, retry_count, max_retries, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', 0, 2, ?, ?)"
  );

  const seenIds = new Set<string>();
  for (let i = 0; i < stories.length; i++) {
    const s = stories[i];
    // Accept both camelCase and snake_case
    const ac = s.acceptanceCriteria ?? s.acceptance_criteria;
    if (!s.id || !s.title || !s.description || !Array.isArray(ac) || ac.length === 0) {
      throw new Error(`STORIES_JSON story at index ${i} missing required fields (id, title, description, acceptanceCriteria)`);
    }
    if (seenIds.has(s.id)) {
      throw new Error(`STORIES_JSON has duplicate story id "${s.id}"`);
    }
    seenIds.add(s.id);
    insert.run(crypto.randomUUID(), runId, i, s.id, s.title, s.description, JSON.stringify(ac), now, now);
  }
}

// ── Abandoned Step Cleanup ──────────────────────────────────────────

const ABANDONED_THRESHOLD_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Find steps that have been "running" for too long and reset them.
 *
 * For single steps: increment the step's retry_count. If exhausted, fail the step and run.
 * For loop steps: the step stays "running" for the duration of the loop — that's normal.
 *   Instead, we check the *current story's* updated_at. If stale, it means the agent
 *   session died mid-story. We use the story's retry_count (not the step's) so that
 *   individual story crashes don't exhaust the entire step.
 */
function cleanupAbandonedSteps(): void {
  const db = getDb();
  const cutoff = new Date(Date.now() - ABANDONED_THRESHOLD_MS).toISOString();

  // ── Single steps: existing logic (step-level retries) ──
  const abandonedSingleSteps = db.prepare(
    "SELECT id, step_id, run_id, retry_count, max_retries FROM steps WHERE status = 'running' AND type != 'loop' AND updated_at < ?"
  ).all(cutoff) as { id: string; step_id: string; run_id: string; retry_count: number; max_retries: number }[];

  for (const step of abandonedSingleSteps) {
    const newRetry = step.retry_count + 1;
    if (newRetry >= step.max_retries) {
      db.prepare(
        "UPDATE steps SET status = 'failed', output = 'Agent abandoned step without completing', retry_count = ?, updated_at = datetime('now') WHERE id = ?"
      ).run(newRetry, step.id);
      db.prepare(
        "UPDATE runs SET status = 'failed', updated_at = datetime('now') WHERE id = ?"
      ).run(step.run_id);
      const wfId = getWorkflowId(step.run_id);
      emitEvent({ ts: new Date().toISOString(), event: "step.timeout", runId: step.run_id, workflowId: wfId, stepId: step.step_id, detail: `Retries exhausted — step failed` });
      emitEvent({ ts: new Date().toISOString(), event: "step.failed", runId: step.run_id, workflowId: wfId, stepId: step.step_id, detail: "Agent abandoned step without completing" });
      emitEvent({ ts: new Date().toISOString(), event: "run.failed", runId: step.run_id, workflowId: wfId, detail: "Step abandoned and retries exhausted" });
      scheduleRunCronTeardown(step.run_id);
    } else {
      db.prepare(
        "UPDATE steps SET status = 'pending', retry_count = ?, updated_at = datetime('now') WHERE id = ?"
      ).run(newRetry, step.id);
      emitEvent({ ts: new Date().toISOString(), event: "step.timeout", runId: step.run_id, workflowId: getWorkflowId(step.run_id), stepId: step.step_id, detail: `Reset to pending (retry ${newRetry})` });
    }
  }

  // ── Loop steps with a current story: per-story retries ──
  // The step itself is allowed to stay "running" for the entire loop duration.
  // We only check if the *current story* has gone stale (agent died mid-story).
  const abandonedLoopSteps = db.prepare(
    `SELECT s.id as step_db_id, s.step_id, s.run_id,
            st.id as story_db_id, st.story_id, st.title as story_title,
            st.retry_count as story_retry_count, st.max_retries as story_max_retries
     FROM steps s
     JOIN stories st ON s.current_story_id = st.id
     WHERE s.status = 'running' AND s.type = 'loop'
       AND st.status = 'running' AND st.updated_at < ?`
  ).all(cutoff) as {
    step_db_id: string; step_id: string; run_id: string;
    story_db_id: string; story_id: string; story_title: string;
    story_retry_count: number; story_max_retries: number;
  }[];

  for (const row of abandonedLoopSteps) {
    const newStoryRetry = row.story_retry_count + 1;
    const wfId = getWorkflowId(row.run_id);

    if (newStoryRetry >= row.story_max_retries) {
      // Story exhausted its retries — mark story failed, but continue the loop
      db.prepare(
        "UPDATE stories SET status = 'failed', retry_count = ?, updated_at = datetime('now') WHERE id = ?"
      ).run(newStoryRetry, row.story_db_id);
      emitEvent({ ts: new Date().toISOString(), event: "story.failed", runId: row.run_id, workflowId: wfId, stepId: row.step_id, storyId: row.story_id, storyTitle: row.story_title, detail: `Story abandoned — retries exhausted (${newStoryRetry}/${row.story_max_retries})` });
    } else {
      // Reset story to pending for retry
      db.prepare(
        "UPDATE stories SET status = 'pending', retry_count = ?, updated_at = datetime('now') WHERE id = ?"
      ).run(newStoryRetry, row.story_db_id);
      emitEvent({ ts: new Date().toISOString(), event: "story.retry", runId: row.run_id, workflowId: wfId, stepId: row.step_id, storyId: row.story_id, storyTitle: row.story_title, detail: `Story abandoned — reset for retry (${newStoryRetry}/${row.story_max_retries})` });
    }

    // In both cases: clear current_story_id and set step back to pending
    // so the next claim picks up the next available story (or finishes the loop)
    db.prepare(
      "UPDATE steps SET status = 'pending', current_story_id = NULL, updated_at = datetime('now') WHERE id = ?"
    ).run(row.step_db_id);
  }

  // ── Loop steps stuck "running" with no current story ──
  // Edge case: step is running but current_story_id is NULL and stale.
  // This shouldn't normally happen, but handle it defensively.
  const stuckLoopSteps = db.prepare(
    "SELECT id, step_id, run_id, retry_count, max_retries FROM steps WHERE status = 'running' AND type = 'loop' AND current_story_id IS NULL AND updated_at < ?"
  ).all(cutoff) as { id: string; step_id: string; run_id: string; retry_count: number; max_retries: number }[];

  for (const step of stuckLoopSteps) {
    // Reset to pending — the next claim will either pick the next story or finish the loop
    db.prepare(
      "UPDATE steps SET status = 'pending', updated_at = datetime('now') WHERE id = ?"
    ).run(step.id);
    emitEvent({ ts: new Date().toISOString(), event: "step.timeout", runId: step.run_id, workflowId: getWorkflowId(step.run_id), stepId: step.step_id, detail: `Loop step stuck without story — reset to pending` });
  }
}

// ── Claim ───────────────────────────────────────────────────────────

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
  // First, cleanup any abandoned steps
  cleanupAbandonedSteps();
  const db = getDb();

  const step = db.prepare(
    "SELECT id, run_id, input_template, type, loop_config FROM steps WHERE agent_id = ? AND status = 'pending' LIMIT 1"
  ).get(agentId) as { id: string; run_id: string; input_template: string; type: string; loop_config: string | null } | undefined;

  if (!step) return { found: false };

  // Guard: don't claim work for a failed run
  const runStatus = db.prepare("SELECT status FROM runs WHERE id = ?").get(step.run_id) as { status: string } | undefined;
  if (runStatus?.status === "failed") return { found: false };

  // Get run context
  const run = db.prepare("SELECT context FROM runs WHERE id = ?").get(step.run_id) as { context: string } | undefined;
  const context: Record<string, string> = run ? JSON.parse(run.context) : {};

  // T6: Loop step claim logic
  if (step.type === "loop") {
    const loopConfig: LoopConfig | null = step.loop_config ? JSON.parse(step.loop_config) : null;
    if (loopConfig?.over === "stories") {
      // Find next pending story
      const nextStory = db.prepare(
        "SELECT * FROM stories WHERE run_id = ? AND status = 'pending' ORDER BY story_index ASC LIMIT 1"
      ).get(step.run_id) as any | undefined;

      if (!nextStory) {
        // No more stories — mark step done and advance
        db.prepare(
          "UPDATE steps SET status = 'done', updated_at = datetime('now') WHERE id = ?"
        ).run(step.id);
        emitEvent({ ts: new Date().toISOString(), event: "step.done", runId: step.run_id, workflowId: getWorkflowId(step.run_id), stepId: step.id, agentId: agentId });
        advancePipeline(step.run_id);
        return { found: false };
      }

      // Claim the story
      db.prepare(
        "UPDATE stories SET status = 'running', updated_at = datetime('now') WHERE id = ?"
      ).run(nextStory.id);
      db.prepare(
        "UPDATE steps SET status = 'running', current_story_id = ?, updated_at = datetime('now') WHERE id = ?"
      ).run(nextStory.id, step.id);

      const wfId = getWorkflowId(step.run_id);
      emitEvent({ ts: new Date().toISOString(), event: "step.running", runId: step.run_id, workflowId: wfId, stepId: step.id, agentId: agentId });
      emitEvent({ ts: new Date().toISOString(), event: "story.started", runId: step.run_id, workflowId: wfId, stepId: step.id, agentId: agentId, storyId: nextStory.story_id, storyTitle: nextStory.title });

      // Build story template vars
      const story: Story = {
        id: nextStory.id,
        runId: nextStory.run_id,
        storyIndex: nextStory.story_index,
        storyId: nextStory.story_id,
        title: nextStory.title,
        description: nextStory.description,
        acceptanceCriteria: JSON.parse(nextStory.acceptance_criteria),
        status: nextStory.status,
        output: nextStory.output ?? undefined,
        retryCount: nextStory.retry_count,
        maxRetries: nextStory.max_retries,
      };

      const allStories = getStories(step.run_id);
      const pendingCount = allStories.filter(s => s.status === "pending" || s.status === "running").length;

      context["current_story"] = formatStoryForTemplate(story);
      context["current_story_id"] = story.storyId;
      context["current_story_title"] = story.title;
      context["completed_stories"] = formatCompletedStories(allStories);
      context["stories_remaining"] = String(pendingCount);
      context["progress"] = readProgressFile(step.run_id);

      if (!context["verify_feedback"]) {
        context["verify_feedback"] = "";
      }

      // Persist story context vars to DB so verify_each steps can access them
      db.prepare("UPDATE runs SET context = ?, updated_at = datetime('now') WHERE id = ?").run(JSON.stringify(context), step.run_id);

      const resolvedInput = resolveTemplate(step.input_template, context);
      return { found: true, stepId: step.id, runId: step.run_id, resolvedInput };
    }
  }

  // Single step: existing logic
  db.prepare(
    "UPDATE steps SET status = 'running', updated_at = datetime('now') WHERE id = ? AND status = 'pending'"
  ).run(step.id);
  emitEvent({ ts: new Date().toISOString(), event: "step.running", runId: step.run_id, workflowId: getWorkflowId(step.run_id), stepId: step.id, agentId: agentId });

  // Inject progress for any step in a run that has stories
  const hasStories = db.prepare(
    "SELECT COUNT(*) as cnt FROM stories WHERE run_id = ?"
  ).get(step.run_id) as { cnt: number };
  if (hasStories.cnt > 0) {
    context["progress"] = readProgressFile(step.run_id);
  }

  const resolvedInput = resolveTemplate(step.input_template, context);

  return {
    found: true,
    stepId: step.id,
    runId: step.run_id,
    resolvedInput,
  };
}

// ── Complete ────────────────────────────────────────────────────────

/**
 * Complete a step: save output, merge context, advance pipeline.
 */
export function completeStep(stepId: string, output: string): { advanced: boolean; runCompleted: boolean } {
  const db = getDb();

  const step = db.prepare(
    "SELECT id, run_id, step_id, step_index, type, loop_config, current_story_id FROM steps WHERE id = ?"
  ).get(stepId) as { id: string; run_id: string; step_id: string; step_index: number; type: string; loop_config: string | null; current_story_id: string | null } | undefined;

  if (!step) throw new Error(`Step not found: ${stepId}`);

  // Guard: don't process completions for failed runs
  const runCheck = db.prepare("SELECT status FROM runs WHERE id = ?").get(step.run_id) as { status: string } | undefined;
  if (runCheck?.status === "failed") {
    return { advanced: false, runCompleted: false };
  }

  // Merge KEY: value lines into run context
  const run = db.prepare("SELECT context FROM runs WHERE id = ?").get(step.run_id) as { context: string };
  const context: Record<string, string> = JSON.parse(run.context);

  for (const line of output.split("\n")) {
    const match = line.match(/^([A-Z_]+):\s*(.+)$/);
    if (match && !match[1].startsWith("STORIES_JSON")) {
      context[match[1].toLowerCase()] = match[2].trim();
    }
  }

  db.prepare(
    "UPDATE runs SET context = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(JSON.stringify(context), step.run_id);

  // T5: Parse STORIES_JSON from output (any step, typically the planner)
  parseAndInsertStories(output, step.run_id);

  // T7: Loop step completion
  if (step.type === "loop" && step.current_story_id) {
    // Look up story info for event
    const storyRow = db.prepare("SELECT story_id, title FROM stories WHERE id = ?").get(step.current_story_id) as { story_id: string; title: string } | undefined;

    // Mark current story done
    db.prepare(
      "UPDATE stories SET status = 'done', output = ?, updated_at = datetime('now') WHERE id = ?"
    ).run(output, step.current_story_id);
    emitEvent({ ts: new Date().toISOString(), event: "story.done", runId: step.run_id, workflowId: getWorkflowId(step.run_id), stepId: step.id, storyId: storyRow?.story_id, storyTitle: storyRow?.title });

    // Clear current_story_id, save output
    db.prepare(
      "UPDATE steps SET current_story_id = NULL, output = ?, updated_at = datetime('now') WHERE id = ?"
    ).run(output, step.id);

    const loopConfig: LoopConfig | null = step.loop_config ? JSON.parse(step.loop_config) : null;

    // T8: verify_each flow — set verify step to pending
    if (loopConfig?.verifyEach && loopConfig.verifyStep) {
      const verifyStep = db.prepare(
        "SELECT id FROM steps WHERE run_id = ? AND step_id = ? LIMIT 1"
      ).get(step.run_id, loopConfig.verifyStep) as { id: string } | undefined;

      if (verifyStep) {
        db.prepare(
          "UPDATE steps SET status = 'pending', updated_at = datetime('now') WHERE id = ?"
        ).run(verifyStep.id);
        // Loop step stays 'running'
        db.prepare(
          "UPDATE steps SET status = 'running', updated_at = datetime('now') WHERE id = ?"
        ).run(step.id);
        return { advanced: false, runCompleted: false };
      }
    }

    // No verify_each: check for more stories
    return checkLoopContinuation(step.run_id, step.id);
  }

  // T8: Check if this is a verify step triggered by verify-each
  const loopStepRow = db.prepare(
    "SELECT id, loop_config, run_id FROM steps WHERE run_id = ? AND type = 'loop' AND status = 'running' LIMIT 1"
  ).get(step.run_id) as { id: string; loop_config: string | null; run_id: string } | undefined;

  if (loopStepRow?.loop_config) {
    const lc: LoopConfig = JSON.parse(loopStepRow.loop_config);
    if (lc.verifyEach && lc.verifyStep === step.step_id) {
      return handleVerifyEachCompletion(step, loopStepRow.id, output, context);
    }
  }

  // Single step: mark done and advance
  db.prepare(
    "UPDATE steps SET status = 'done', output = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(output, stepId);
  emitEvent({ ts: new Date().toISOString(), event: "step.done", runId: step.run_id, workflowId: getWorkflowId(step.run_id), stepId: step.id });

  return advancePipeline(step.run_id);
}

/**
 * Handle verify-each completion: pass or fail the story.
 */
function handleVerifyEachCompletion(
  verifyStep: { id: string; run_id: string; step_id: string; step_index: number },
  loopStepId: string,
  output: string,
  context: Record<string, string>
): { advanced: boolean; runCompleted: boolean } {
  const db = getDb();
  const status = context["status"]?.toLowerCase();

  // Reset verify step to waiting for next use
  db.prepare(
    "UPDATE steps SET status = 'waiting', output = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(output, verifyStep.id);

  if (status !== "retry") {
    // Verify passed
    emitEvent({ ts: new Date().toISOString(), event: "story.verified", runId: verifyStep.run_id, workflowId: getWorkflowId(verifyStep.run_id), stepId: verifyStep.id });
  }

  if (status === "retry") {
    // Verify failed — retry the story
    const lastDoneStory = db.prepare(
      "SELECT id, retry_count, max_retries FROM stories WHERE run_id = ? AND status = 'done' ORDER BY updated_at DESC LIMIT 1"
    ).get(verifyStep.run_id) as { id: string; retry_count: number; max_retries: number } | undefined;

    if (lastDoneStory) {
      const newRetry = lastDoneStory.retry_count + 1;
      if (newRetry > lastDoneStory.max_retries) {
        // Story retries exhausted — fail everything
        db.prepare("UPDATE stories SET status = 'failed', retry_count = ?, updated_at = datetime('now') WHERE id = ?").run(newRetry, lastDoneStory.id);
        db.prepare("UPDATE steps SET status = 'failed', updated_at = datetime('now') WHERE id = ?").run(loopStepId);
        db.prepare("UPDATE runs SET status = 'failed', updated_at = datetime('now') WHERE id = ?").run(verifyStep.run_id);
        const wfId = getWorkflowId(verifyStep.run_id);
        emitEvent({ ts: new Date().toISOString(), event: "story.failed", runId: verifyStep.run_id, workflowId: wfId, stepId: verifyStep.id });
        emitEvent({ ts: new Date().toISOString(), event: "run.failed", runId: verifyStep.run_id, workflowId: wfId, detail: "Verification retries exhausted" });
        scheduleRunCronTeardown(verifyStep.run_id);
        return { advanced: false, runCompleted: false };
      }

      // Set story back to pending for retry
      db.prepare("UPDATE stories SET status = 'pending', retry_count = ?, updated_at = datetime('now') WHERE id = ?").run(newRetry, lastDoneStory.id);

      // Store verify feedback
      const issues = context["issues"] ?? output;
      context["verify_feedback"] = issues;
      emitEvent({ ts: new Date().toISOString(), event: "story.retry", runId: verifyStep.run_id, workflowId: getWorkflowId(verifyStep.run_id), stepId: verifyStep.id, detail: issues });
      db.prepare("UPDATE runs SET context = ?, updated_at = datetime('now') WHERE id = ?").run(JSON.stringify(context), verifyStep.run_id);
    }

    // Set loop step back to pending for retry
    db.prepare("UPDATE steps SET status = 'pending', updated_at = datetime('now') WHERE id = ?").run(loopStepId);
    return { advanced: false, runCompleted: false };
  }

  // Verify passed — clear feedback and continue
  delete context["verify_feedback"];
  db.prepare("UPDATE runs SET context = ?, updated_at = datetime('now') WHERE id = ?").run(JSON.stringify(context), verifyStep.run_id);

  return checkLoopContinuation(verifyStep.run_id, loopStepId);
}

/**
 * Check if the loop has more stories; if so set loop step pending, otherwise done + advance.
 * A loop is complete when no stories are pending or running — i.e., all are done or failed.
 */
function checkLoopContinuation(runId: string, loopStepId: string): { advanced: boolean; runCompleted: boolean } {
  const db = getDb();
  const activeStory = db.prepare(
    "SELECT id FROM stories WHERE run_id = ? AND status IN ('pending', 'running') LIMIT 1"
  ).get(runId) as { id: string } | undefined;

  if (activeStory) {
    // More stories to process — loop step back to pending
    db.prepare(
      "UPDATE steps SET status = 'pending', updated_at = datetime('now') WHERE id = ?"
    ).run(loopStepId);
    return { advanced: false, runCompleted: false };
  }

  // All stories are terminal (done or failed) — loop is complete
  const failedCount = (db.prepare(
    "SELECT COUNT(*) as count FROM stories WHERE run_id = ? AND status = 'failed'"
  ).get(runId) as { count: number }).count;

  // Mark loop step done (even if some stories failed — the loop processed all of them)
  db.prepare(
    "UPDATE steps SET status = 'done', updated_at = datetime('now') WHERE id = ?"
  ).run(loopStepId);

  if (failedCount > 0) {
    const totalCount = (db.prepare(
      "SELECT COUNT(*) as count FROM stories WHERE run_id = ?"
    ).get(runId) as { count: number }).count;
    const wfId = getWorkflowId(runId);
    emitEvent({ ts: new Date().toISOString(), event: "step.done", runId, workflowId: wfId, stepId: loopStepId, detail: `Loop completed with ${failedCount}/${totalCount} stories failed` });
  }

  // Also mark verify step done if it exists
  const loopStep = db.prepare("SELECT loop_config, run_id FROM steps WHERE id = ?").get(loopStepId) as { loop_config: string | null; run_id: string } | undefined;
  if (loopStep?.loop_config) {
    const lc: LoopConfig = JSON.parse(loopStep.loop_config);
    if (lc.verifyEach && lc.verifyStep) {
      db.prepare(
        "UPDATE steps SET status = 'done', updated_at = datetime('now') WHERE run_id = ? AND step_id = ?"
      ).run(runId, lc.verifyStep);
    }
  }

  return advancePipeline(runId);
}

/**
 * Advance the pipeline: find the next waiting step and make it pending, or complete the run.
 * Respects terminal run states — a failed run cannot be advanced or completed.
 */
function advancePipeline(runId: string): { advanced: boolean; runCompleted: boolean } {
  const db = getDb();

  // Guard: never advance or overwrite a failed run
  const run = db.prepare("SELECT status FROM runs WHERE id = ?").get(runId) as { status: string } | undefined;
  if (run?.status === "failed") {
    return { advanced: false, runCompleted: false };
  }

  const next = db.prepare(
    "SELECT id FROM steps WHERE run_id = ? AND status = 'waiting' ORDER BY step_index ASC LIMIT 1"
  ).get(runId) as { id: string } | undefined;

  const wfId = getWorkflowId(runId);
  if (next) {
    db.prepare(
      "UPDATE steps SET status = 'pending', updated_at = datetime('now') WHERE id = ?"
    ).run(next.id);
    emitEvent({ ts: new Date().toISOString(), event: "pipeline.advanced", runId, workflowId: wfId, stepId: next.id });
    emitEvent({ ts: new Date().toISOString(), event: "step.pending", runId, workflowId: wfId, stepId: next.id });
    return { advanced: true, runCompleted: false };
  } else {
    db.prepare(
      "UPDATE runs SET status = 'completed', updated_at = datetime('now') WHERE id = ?"
    ).run(runId);
    emitEvent({ ts: new Date().toISOString(), event: "run.completed", runId, workflowId: wfId });
    archiveRunProgress(runId);
    scheduleRunCronTeardown(runId);
    return { advanced: false, runCompleted: true };
  }
}

// ── Fail ────────────────────────────────────────────────────────────

// ─── Progress Archiving (T15) ────────────────────────────────────────

export function archiveRunProgress(runId: string): void {
  const db = getDb();
  const loopStep = db.prepare(
    "SELECT agent_id FROM steps WHERE run_id = ? AND type = 'loop' LIMIT 1"
  ).get(runId) as { agent_id: string } | undefined;
  if (!loopStep) return;

  const workspace = getAgentWorkspacePath(loopStep.agent_id);
  if (!workspace) return;

  const progressPath = path.join(workspace, "progress.txt");
  if (!fs.existsSync(progressPath)) return;

  const archiveDir = path.join(workspace, "archive", runId);
  fs.mkdirSync(archiveDir, { recursive: true });
  fs.copyFileSync(progressPath, path.join(archiveDir, "progress.txt"));
  fs.writeFileSync(progressPath, ""); // truncate
}

/**
 * Fail a step, with retry logic. For loop steps, applies per-story retry.
 */
export function failStep(stepId: string, error: string): { retrying: boolean; runFailed: boolean } {
  const db = getDb();

  const step = db.prepare(
    "SELECT run_id, retry_count, max_retries, type, current_story_id FROM steps WHERE id = ?"
  ).get(stepId) as { run_id: string; retry_count: number; max_retries: number; type: string; current_story_id: string | null } | undefined;

  if (!step) throw new Error(`Step not found: ${stepId}`);

  // T9: Loop step failure — per-story retry
  if (step.type === "loop" && step.current_story_id) {
    const story = db.prepare(
      "SELECT id, retry_count, max_retries FROM stories WHERE id = ?"
    ).get(step.current_story_id) as { id: string; retry_count: number; max_retries: number } | undefined;

    if (story) {
      const storyRow = db.prepare("SELECT story_id, title FROM stories WHERE id = ?").get(step.current_story_id!) as { story_id: string; title: string } | undefined;
      const newRetry = story.retry_count + 1;
      if (newRetry > story.max_retries) {
        // Story retries exhausted
        db.prepare("UPDATE stories SET status = 'failed', retry_count = ?, updated_at = datetime('now') WHERE id = ?").run(newRetry, story.id);
        db.prepare("UPDATE steps SET status = 'failed', output = ?, current_story_id = NULL, updated_at = datetime('now') WHERE id = ?").run(error, stepId);
        db.prepare("UPDATE runs SET status = 'failed', updated_at = datetime('now') WHERE id = ?").run(step.run_id);
        const wfId = getWorkflowId(step.run_id);
        emitEvent({ ts: new Date().toISOString(), event: "story.failed", runId: step.run_id, workflowId: wfId, stepId: stepId, storyId: storyRow?.story_id, storyTitle: storyRow?.title, detail: error });
        emitEvent({ ts: new Date().toISOString(), event: "step.failed", runId: step.run_id, workflowId: wfId, stepId: stepId, detail: error });
        emitEvent({ ts: new Date().toISOString(), event: "run.failed", runId: step.run_id, workflowId: wfId, detail: "Story retries exhausted" });
        scheduleRunCronTeardown(step.run_id);
        return { retrying: false, runFailed: true };
      }

      // Retry the story
      db.prepare("UPDATE stories SET status = 'pending', retry_count = ?, updated_at = datetime('now') WHERE id = ?").run(newRetry, story.id);
      db.prepare("UPDATE steps SET status = 'pending', current_story_id = NULL, updated_at = datetime('now') WHERE id = ?").run(stepId);
      return { retrying: true, runFailed: false };
    }
  }

  // Single step: existing logic
  const newRetryCount = step.retry_count + 1;

  if (newRetryCount > step.max_retries) {
    db.prepare(
      "UPDATE steps SET status = 'failed', output = ?, retry_count = ?, updated_at = datetime('now') WHERE id = ?"
    ).run(error, newRetryCount, stepId);
    db.prepare(
      "UPDATE runs SET status = 'failed', updated_at = datetime('now') WHERE id = ?"
    ).run(step.run_id);
    const wfId2 = getWorkflowId(step.run_id);
    emitEvent({ ts: new Date().toISOString(), event: "step.failed", runId: step.run_id, workflowId: wfId2, stepId: stepId, detail: error });
    emitEvent({ ts: new Date().toISOString(), event: "run.failed", runId: step.run_id, workflowId: wfId2, detail: "Step retries exhausted" });
    scheduleRunCronTeardown(step.run_id);
    return { retrying: false, runFailed: true };
  } else {
    db.prepare(
      "UPDATE steps SET status = 'pending', retry_count = ?, updated_at = datetime('now') WHERE id = ?"
    ).run(newRetryCount, stepId);
    return { retrying: true, runFailed: false };
  }
}
