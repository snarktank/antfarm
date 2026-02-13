import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { getDb } from "../dist/db.js";
import { claimStep } from "../dist/installer/step-ops.js";
import { randomUUID } from "node:crypto";

/**
 * E2E integration test for frontend change detection in the verify flow.
 *
 * Creates a real git repo with controlled diffs, inserts a run+step into
 * the live DB with a verify-style template referencing {{has_frontend_changes}},
 * then calls claimStep and checks the resolved input.
 */

const VERIFY_TEMPLATE = `Verify the implementation.

## Visual Verification (Frontend Changes)
Has frontend changes: {{has_frontend_changes}}

If {{has_frontend_changes}} is 'true', you MUST also perform visual verification:
1. Use the agent-browser skill to visually inspect the changed UI

If {{has_frontend_changes}} is 'false', skip visual verification entirely.`;

describe("E2E: frontend change detection in verify flow", () => {
  let tmpDir: string;
  const testRunIds: string[] = [];
  const testAgentId = `test-verifier-${randomUUID().slice(0, 8)}`;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "antfarm-e2e-"));
    // Create a real git repo with a main branch
    execSync("git init && git checkout -b main", { cwd: tmpDir });
    fs.writeFileSync(path.join(tmpDir, "README.md"), "# test");
    execSync("git add . && git commit -m 'init'", { cwd: tmpDir });
  });

  afterEach(() => {
    // Clean up git repo
    fs.rmSync(tmpDir, { recursive: true, force: true });

    // Clean up DB entries
    const db = getDb();
    for (const runId of testRunIds) {
      db.prepare("DELETE FROM steps WHERE run_id = ?").run(runId);
      db.prepare("DELETE FROM runs WHERE id = ?").run(runId);
    }
    testRunIds.length = 0;
  });

  function insertTestRun(repo: string, branch: string): string {
    const db = getDb();
    const runId = randomUUID();
    const now = new Date().toISOString();
    const context = JSON.stringify({ repo, branch });

    db.prepare(
      `INSERT INTO runs (id, workflow_id, task, status, context, created_at, updated_at)
       VALUES (?, 'test-workflow', 'test task', 'running', ?, ?, ?)`
    ).run(runId, context, now, now);

    const stepId = randomUUID();
    db.prepare(
      `INSERT INTO steps (id, step_id, run_id, agent_id, step_index, input_template, expects, status, created_at, updated_at, type)
       VALUES (?, 'verify', ?, ?, 0, ?, 'VERIFIED', 'pending', ?, ?, 'single')`
    ).run(stepId, runId, testAgentId, VERIFY_TEMPLATE, now, now);

    testRunIds.push(runId);
    return runId;
  }

  it("includes browser verification instructions when branch has frontend changes", () => {
    // Create branch with frontend file
    execSync("git checkout -b feat-frontend-ui", { cwd: tmpDir });
    fs.writeFileSync(path.join(tmpDir, "index.html"), "<html><body>Hello</body></html>");
    execSync("git add . && git commit -m 'add html'", { cwd: tmpDir });

    insertTestRun(tmpDir, "feat-frontend-ui");
    const result = claimStep(testAgentId);

    assert.ok(result.found, "Should find a step to claim");
    assert.ok(result.resolvedInput, "Should have resolved input");
    assert.ok(
      result.resolvedInput!.includes("Has frontend changes: true"),
      "Should indicate frontend changes are true"
    );
    assert.ok(
      result.resolvedInput!.includes("agent-browser"),
      "Should include browser verification instructions"
    );
    assert.ok(
      result.resolvedInput!.includes("MUST also perform visual verification"),
      "Should include MUST directive for visual verification"
    );
  });

  it("excludes browser verification when branch has only backend changes", () => {
    // Create branch with only backend files
    execSync("git checkout -b feat-backend-only", { cwd: tmpDir });
    fs.writeFileSync(path.join(tmpDir, "server.ts"), "export const x = 1;");
    fs.writeFileSync(path.join(tmpDir, "utils.py"), "def hello(): pass");
    execSync("git add . && git commit -m 'add backend'", { cwd: tmpDir });

    insertTestRun(tmpDir, "feat-backend-only");
    const result = claimStep(testAgentId);

    assert.ok(result.found, "Should find a step to claim");
    assert.ok(result.resolvedInput, "Should have resolved input");
    assert.ok(
      result.resolvedInput!.includes("Has frontend changes: false"),
      "Should indicate frontend changes are false"
    );
    assert.ok(
      result.resolvedInput!.includes("skip visual verification entirely"),
      "Should include skip instruction"
    );
  });

  it("uses mock git diff (real repo, controlled files) — no external repo needed", () => {
    // This test verifies we're using a temp git repo, not a real project repo
    // The beforeEach creates a fresh git repo in tmpDir
    assert.ok(fs.existsSync(path.join(tmpDir, ".git")), "Should have a .git directory");

    execSync("git checkout -b feat-css-change", { cwd: tmpDir });
    fs.mkdirSync(path.join(tmpDir, "styles"), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, "styles", "app.css"), "body { margin: 0; }");
    execSync("git add . && git commit -m 'add css'", { cwd: tmpDir });

    insertTestRun(tmpDir, "feat-css-change");
    const result = claimStep(testAgentId);

    assert.ok(result.found);
    assert.ok(result.resolvedInput!.includes("Has frontend changes: true"));
  });

  it("sets has_frontend_changes to false when context has no repo/branch", () => {
    const db = getDb();
    const runId = randomUUID();
    const now = new Date().toISOString();
    // Context without repo or branch
    const context = JSON.stringify({ task: "something" });

    db.prepare(
      `INSERT INTO runs (id, workflow_id, task, status, context, created_at, updated_at)
       VALUES (?, 'test-workflow', 'test task', 'running', ?, ?, ?)`
    ).run(runId, context, now, now);

    const stepId = randomUUID();
    db.prepare(
      `INSERT INTO steps (id, step_id, run_id, agent_id, step_index, input_template, expects, status, created_at, updated_at, type)
       VALUES (?, 'verify', ?, ?, 0, ?, 'VERIFIED', 'pending', ?, ?, 'single')`
    ).run(stepId, runId, testAgentId, VERIFY_TEMPLATE, now, now);

    testRunIds.push(runId);
    const result = claimStep(testAgentId);

    assert.ok(result.found);
    assert.ok(result.resolvedInput!.includes("Has frontend changes: false"));
  });
});
