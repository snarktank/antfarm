import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { pathToFileURL } from "node:url";

const tempHomes: string[] = [];
const originalHome = process.env.HOME;
const sharedHome = makeTempHome();
process.env.HOME = sharedHome;

function makeTempHome(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "antfarm-frozen-scope-story-"));
  tempHomes.push(dir);
  return dir;
}

async function importFreshStepOpsModule() {
  const moduleUrl = `${pathToFileURL(path.join(process.cwd(), "dist/installer/step-ops.js")).href}?t=${Date.now()}-${Math.random()}`;
  return import(moduleUrl);
}

async function importFreshDbModule() {
  const moduleUrl = `${pathToFileURL(path.join(process.cwd(), "dist/db.js")).href}?t=${Date.now()}-${Math.random()}`;
  return import(moduleUrl);
}

async function importFreshEventsModule() {
  const moduleUrl = `${pathToFileURL(path.join(process.cwd(), "dist/installer/events.js")).href}?t=${Date.now()}-${Math.random()}`;
  return import(moduleUrl);
}

function seedFrozenLoopRun(db: any, runId: string, loopStepId: string, t: string) {
  db.prepare(
    "INSERT INTO runs (id, workflow_id, task, status, context, scope_status, scope_version, scope_frozen_at, created_at, updated_at) VALUES (?, ?, ?, 'running', '{}', 'frozen', 1, ?, ?, ?)"
  ).run(runId, "wf", "frozen loop", t, t, t);

  db.prepare(
    "INSERT INTO steps (id, run_id, step_id, agent_id, step_index, input_template, expects, status, type, loop_config, created_at, updated_at) VALUES (?, ?, ?, 'dev', 0, 'story: {{current_story_id}}', '', 'pending', 'loop', ?, ?, ?)"
  ).run(loopStepId, runId, "implement", JSON.stringify({ over: "stories" }), t, t);
}

after(() => {
  process.env.HOME = originalHome;
  while (tempHomes.length > 0) {
    const dir = tempHomes.pop()!;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("frozen scope story enforcement", () => {
  it("blocks out-of-scope pending story on claim with explicit failure and machine-readable event", async () => {
    const { getDb } = await importFreshDbModule();
    const db = getDb();
    const { claimStep } = await importFreshStepOpsModule();
    const { getRunEvents } = await importFreshEventsModule();

    const runId = crypto.randomUUID();
    const loopStepId = crypto.randomUUID();
    const outStoryId = crypto.randomUUID();
    const t = new Date().toISOString();

    seedFrozenLoopRun(db, runId, loopStepId, t);

    db.prepare(
      "INSERT INTO run_scope_items (run_id, scope_version, item_type, item_value, created_at) VALUES (?, 1, 'in_scope', 'US-001', ?)"
    ).run(runId, t);

    db.prepare(
      "INSERT INTO stories (id, run_id, story_index, story_id, title, description, acceptance_criteria, status, retry_count, max_retries, created_at, updated_at) VALUES (?, ?, 0, 'US-004', 'Enforce frozen scope', 'desc', '[\"ac\"]', 'pending', 0, 2, ?, ?)"
    ).run(outStoryId, runId, t, t);

    const result = claimStep("dev");
    assert.equal(result.found, false);

    const run = db.prepare("SELECT status FROM runs WHERE id = ?").get(runId) as { status: string } | undefined;
    const step = db.prepare("SELECT status, output FROM steps WHERE id = ?").get(loopStepId) as { status: string; output: string } | undefined;
    const story = db.prepare("SELECT status, output FROM stories WHERE id = ?").get(outStoryId) as { status: string; output: string } | undefined;

    assert.equal(run?.status, "failed");
    assert.equal(step?.status, "failed");
    assert.equal(story?.status, "failed");
    assert.match(step?.output ?? "", /outside frozen scope allowlist/);
    assert.match(story?.output ?? "", /outside frozen scope allowlist/);

    const violation = getRunEvents(runId).find((evt: any) => evt.event === "scope.violation");
    assert.ok(violation, "scope.violation event should be emitted");
    assert.equal(violation.storyId, "US-004");
    assert.doesNotThrow(() => JSON.parse(violation.detail ?? "{}"));
  });

  it("allows in-scope story to proceed through existing claim flow", async () => {
    const { getDb } = await importFreshDbModule();
    const db = getDb();
    const { claimStep } = await importFreshStepOpsModule();

    const runId = crypto.randomUUID();
    const loopStepId = crypto.randomUUID();
    const inStoryRowId = crypto.randomUUID();
    const t = new Date().toISOString();

    seedFrozenLoopRun(db, runId, loopStepId, t);

    db.prepare(
      "INSERT INTO run_scope_items (run_id, scope_version, item_type, item_value, created_at) VALUES (?, 1, 'in_scope', 'US-004', ?)"
    ).run(runId, t);

    db.prepare(
      "INSERT INTO stories (id, run_id, story_index, story_id, title, description, acceptance_criteria, status, retry_count, max_retries, created_at, updated_at) VALUES (?, ?, 0, 'US-004', 'Enforce frozen scope', 'desc', '[\"ac\"]', 'pending', 0, 2, ?, ?)"
    ).run(inStoryRowId, runId, t, t);

    const result = claimStep("dev");
    assert.equal(result.found, true);
    assert.ok(result.resolvedInput?.includes("US-004"));

    const run = db.prepare("SELECT status FROM runs WHERE id = ?").get(runId) as { status: string } | undefined;
    const step = db.prepare("SELECT status, current_story_id FROM steps WHERE id = ?").get(loopStepId) as { status: string; current_story_id: string | null } | undefined;
    const story = db.prepare("SELECT status FROM stories WHERE id = ?").get(inStoryRowId) as { status: string } | undefined;

    assert.equal(run?.status, "running");
    assert.equal(step?.status, "running");
    assert.equal(step?.current_story_id, inStoryRowId);
    assert.equal(story?.status, "running");
  });

  it("enforces frozen scope during loop continuation after story completion", async () => {
    const { getDb } = await importFreshDbModule();
    const db = getDb();
    const { completeStep } = await importFreshStepOpsModule();

    const runId = crypto.randomUUID();
    const loopStepId = crypto.randomUUID();
    const doneStoryId = crypto.randomUUID();
    const blockedStoryId = crypto.randomUUID();
    const t = new Date().toISOString();

    seedFrozenLoopRun(db, runId, loopStepId, t);

    db.prepare(
      "UPDATE steps SET status = 'running', current_story_id = ? WHERE id = ?"
    ).run(doneStoryId, loopStepId);

    db.prepare(
      "INSERT INTO run_scope_items (run_id, scope_version, item_type, item_value, created_at) VALUES (?, 1, 'in_scope', 'US-001', ?)"
    ).run(runId, t);

    db.prepare(
      "INSERT INTO stories (id, run_id, story_index, story_id, title, description, acceptance_criteria, status, retry_count, max_retries, created_at, updated_at) VALUES (?, ?, 0, 'US-001', 'First story', 'desc', '[\"ac\"]', 'running', 0, 2, ?, ?)"
    ).run(doneStoryId, runId, t, t);

    db.prepare(
      "INSERT INTO stories (id, run_id, story_index, story_id, title, description, acceptance_criteria, status, retry_count, max_retries, created_at, updated_at) VALUES (?, ?, 1, 'US-999', 'Second story', 'desc', '[\"ac\"]', 'pending', 0, 2, ?, ?)"
    ).run(blockedStoryId, runId, t, t);

    completeStep(loopStepId, "STATUS: done");

    const run = db.prepare("SELECT status FROM runs WHERE id = ?").get(runId) as { status: string } | undefined;
    const step = db.prepare("SELECT status, output FROM steps WHERE id = ?").get(loopStepId) as { status: string; output: string } | undefined;
    const blockedStory = db.prepare("SELECT status, output FROM stories WHERE id = ?").get(blockedStoryId) as { status: string; output: string } | undefined;

    assert.equal(run?.status, "failed");
    assert.equal(step?.status, "failed");
    assert.equal(blockedStory?.status, "failed");
    assert.match(step?.output ?? "", /outside frozen scope allowlist/);
  });
});
