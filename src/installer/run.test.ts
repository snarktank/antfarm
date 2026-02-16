import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { getDb } from "../db.js";
import { runWorkflow } from "./run.js";
import { resolveWorkflowDir } from "./paths.js";

// Helper to clean up a test run and its steps
function cleanupTestRun(runId: string) {
  const db = getDb();
  db.prepare("DELETE FROM steps WHERE run_id = ?").run(runId);
  db.prepare("DELETE FROM runs WHERE id = ?").run(runId);
}

describe("runWorkflow with dry_run flag", () => {
  const testRunIds: string[] = [];

  afterEach(() => {
    // Clean up created runs
    for (const runId of testRunIds) {
      try {
        cleanupTestRun(runId);
      } catch {
        // Ignore cleanup errors
      }
    }
    testRunIds.length = 0;
  });

  it("sets dry_run context variable to 'false' by default", async () => {
    const result = await runWorkflow({
      workflowId: "feature-dev",
      taskTitle: "Test task without dry-run flag",
    });
    testRunIds.push(result.id);

    const db = getDb();
    const run = db.prepare("SELECT context FROM runs WHERE id = ?").get(result.id) as { context: string } | undefined;
    assert.ok(run, "Run should exist in database");

    const context = JSON.parse(run.context);
    assert.equal(context.dry_run, "false", "dry_run should be 'false' by default");
  });

  it("sets dry_run context variable to 'true' when dryRun parameter is true", async () => {
    const result = await runWorkflow({
      workflowId: "feature-dev",
      taskTitle: "Test task with dry-run flag",
      dryRun: true,
    });
    testRunIds.push(result.id);

    const db = getDb();
    const run = db.prepare("SELECT context FROM runs WHERE id = ?").get(result.id) as { context: string } | undefined;
    assert.ok(run, "Run should exist in database");

    const context = JSON.parse(run.context);
    assert.equal(context.dry_run, "true", "dry_run should be 'true' when dryRun parameter is true");
  });

  it("sets dry_run context variable to 'false' when dryRun parameter is false", async () => {
    const result = await runWorkflow({
      workflowId: "feature-dev",
      taskTitle: "Test task with explicit false",
      dryRun: false,
    });
    testRunIds.push(result.id);

    const db = getDb();
    const run = db.prepare("SELECT context FROM runs WHERE id = ?").get(result.id) as { context: string } | undefined;
    assert.ok(run, "Run should exist in database");

    const context = JSON.parse(run.context);
    assert.equal(context.dry_run, "false", "dry_run should be 'false' when dryRun parameter is false");
  });

  it("preserves other context variables when dry_run is set", async () => {
    const result = await runWorkflow({
      workflowId: "feature-dev",
      taskTitle: "Test task preservation",
      dryRun: true,
    });
    testRunIds.push(result.id);

    const db = getDb();
    const run = db.prepare("SELECT context FROM runs WHERE id = ?").get(result.id) as { context: string } | undefined;
    assert.ok(run, "Run should exist in database");

    const context = JSON.parse(run.context);
    assert.equal(context.task, "Test task preservation", "task should be preserved");
    assert.equal(context.dry_run, "true", "dry_run should be set to true");
  });

  it("dry_run context is available to steps via template resolution", async () => {
    const result = await runWorkflow({
      workflowId: "feature-dev",
      taskTitle: "Test dry_run in steps",
      dryRun: true,
    });
    testRunIds.push(result.id);

    const db = getDb();
    const run = db.prepare("SELECT context FROM runs WHERE id = ?").get(result.id) as { context: string } | undefined;
    assert.ok(run, "Run should exist in database");

    const context = JSON.parse(run.context);
    // The context should be available to steps when they are claimed
    // This validates that the dry_run variable will be accessible in {{dry_run}} placeholders
    assert.ok(Object.keys(context).includes("dry_run"), "Context should include dry_run variable");
    assert.equal(context.dry_run, "true", "dry_run should be 'true'");
  });

  it("dry_run is a string value (not boolean) for template compatibility", async () => {
    const result = await runWorkflow({
      workflowId: "feature-dev",
      taskTitle: "Test dry_run string type",
      dryRun: true,
    });
    testRunIds.push(result.id);

    const db = getDb();
    const run = db.prepare("SELECT context FROM runs WHERE id = ?").get(result.id) as { context: string } | undefined;
    assert.ok(run, "Run should exist in database");

    const context = JSON.parse(run.context);
    assert.equal(typeof context.dry_run, "string", "dry_run should be a string for template interpolation");
    assert.ok(["true", "false"].includes(context.dry_run), "dry_run should be either 'true' or 'false'");
  });
});
