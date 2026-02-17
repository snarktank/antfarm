import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { execSync, execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import { writeFileSync, mkdirSync } from "node:fs";
import os from "node:os";
import { getDb } from "../db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const cliPath = join(__dirname, "..", "..", "dist", "cli", "cli.js");

// Helper to create a minimal workflow spec for testing
function createTestWorkflow(workflowId: string) {
  const workflowDir = join(os.homedir(), ".openclaw", "antfarm", "workflows", workflowId);
  mkdirSync(workflowDir, { recursive: true });
  
  const yaml = `id: ${workflowId}
title: Test Workflow
context: {}
notifications: {}
agents:
  - id: testagent
    workspace:
      baseDir: /tmp
      files:
        testfile: file.txt
steps:
  - id: step1
    agent: testagent
    input: test input
    expects: test output
`;
  
  writeFileSync(join(workflowDir, "workflow.yml"), yaml);
  
  return workflowDir;
}

// Helper to cleanup test run from database
function cleanupTestRun(runId: string) {
  const db = getDb();
  db.prepare("DELETE FROM steps WHERE run_id = ?").run(runId);
  db.prepare("DELETE FROM runs WHERE id = ?").run(runId);
}

describe("workflow stop CLI", () => {
  it("help text includes 'workflow stop' command", () => {
    // Running with no args prints usage to stdout and exits with code 1
    let output: string;
    try {
      output = execFileSync("node", [cliPath], { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] });
    } catch (err: any) {
      // CLI exits with code 1 when no args — capture stdout from the error
      output = (err.stdout ?? "") + (err.stderr ?? "");
    }
    assert.ok(output.includes("workflow stop"), "Help text should include 'workflow stop'");
    assert.ok(output.includes("Stop/cancel a running workflow"), "Help text should include stop description");
  });

  it("'workflow stop' appears after 'workflow resume' in help text", () => {
    let output: string;
    try {
      output = execFileSync("node", [cliPath], { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] });
    } catch (err: any) {
      output = (err.stdout ?? "") + (err.stderr ?? "");
    }
    const resumeIndex = output.indexOf("workflow resume");
    const stopIndex = output.indexOf("workflow stop");
    assert.ok(resumeIndex !== -1, "Help text should include 'workflow resume'");
    assert.ok(stopIndex !== -1, "Help text should include 'workflow stop'");
    assert.ok(stopIndex > resumeIndex, "'workflow stop' should appear after 'workflow resume'");
  });

  it("'workflow stop' with no run-id prints error and exits with code 1", () => {
    try {
      execFileSync("node", [cliPath, "workflow", "stop"], {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      });
      assert.fail("Should have exited with code 1");
    } catch (err: any) {
      assert.equal(err.status, 1, "Should exit with code 1");
      assert.ok(
        (err.stderr ?? "").includes("Missing run-id"),
        "Should print 'Missing run-id' to stderr",
      );
    }
  });

  it("'workflow stop' with nonexistent run-id prints error and exits with code 1", () => {
    try {
      execFileSync("node", [cliPath, "workflow", "stop", "nonexistent-run-id-000"], {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      });
      assert.fail("Should have exited with code 1");
    } catch (err: any) {
      assert.equal(err.status, 1, "Should exit with code 1");
      assert.ok(
        (err.stderr ?? "").length > 0,
        "Should print error to stderr",
      );
    }
  });
});

describe("US-008: CLI test: Verify 'antfarm workflow run' without --dry-run defaults to dry_run=false", () => {
  const testRunIds: string[] = [];

  afterEach(() => {
    for (const runId of testRunIds) {
      cleanupTestRun(runId);
    }
    testRunIds.length = 0;
  });

  it("invokes CLI 'workflow run' command without --dry-run flag and verifies run is created with dry_run='false'", () => {
    const workflowId = `test-workflow-${crypto.randomUUID()}`;
    const taskTitle = `Test task for US-008`;
    
    // Create test workflow
    createTestWorkflow(workflowId);
    
    // Call CLI with workflow run command (no --dry-run flag)
    const output = execFileSync("node", [cliPath, "workflow", "run", workflowId, taskTitle], {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      // Allow longer timeout for workflow run
      timeout: 30000,
    });
    
    // Parse the run ID from the output
    // Output should be like: "Run: #1 (uuid)\nWorkflow: ...\nTask: ...\nStatus: running"
    assert.ok(output.includes("Run:"), "Output should include 'Run:'");
    assert.ok(output.includes("running"), "Output should indicate status is 'running'");
    
    // Extract run ID from output (format: "Run: #N (uuid)" or "Run: #N (uuid)")
    const runIdMatch = output.match(/\(([a-f0-9-]{36})\)/);
    assert.ok(runIdMatch, "Output should contain a UUID");
    const runId = runIdMatch[1];
    testRunIds.push(runId);
    
    // Query the database to verify the run was created with dry_run='false'
    const db = getDb();
    const run = db.prepare("SELECT * FROM runs WHERE id = ?").get(runId) as {
      id: string;
      context: string;
      status: string;
    } | undefined;
    
    assert.ok(run, `Run with ID ${runId} should exist in database`);
    assert.equal(run.status, "running", "Run status should be 'running'");
    
    // Parse context JSON and verify dry_run='false'
    const context = JSON.parse(run.context);
    assert.ok(context, "Context should be valid JSON");
    assert.equal(context.dry_run, "false", "Context.dry_run should equal 'false' (as string)");
    assert.equal(context.task, taskTitle, "Context.task should equal the task title");
  });

  it("verifies run is created in database when CLI invokes workflow run", () => {
    const workflowId = `test-workflow-${crypto.randomUUID()}`;
    const taskTitle = `Another test task`;
    
    // Create test workflow
    createTestWorkflow(workflowId);
    
    // Get initial run count
    const db = getDb();
    const initialCount = (db.prepare("SELECT COUNT(*) as count FROM runs").get() as any).count;
    
    // Call CLI with workflow run command
    execFileSync("node", [cliPath, "workflow", "run", workflowId, taskTitle], {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 30000,
    });
    
    // Verify run count increased by 1
    const finalCount = (db.prepare("SELECT COUNT(*) as count FROM runs").get() as any).count;
    assert.equal(finalCount, initialCount + 1, "Run count should increase by 1");
    
    // Get the newly created run and verify it
    const newRun = db.prepare(
      "SELECT * FROM runs WHERE workflow_id = ? ORDER BY created_at DESC LIMIT 1"
    ).get(workflowId) as {
      id: string;
      context: string;
      dry_run?: string;
    } | undefined;
    
    assert.ok(newRun, "New run should be created in database");
    testRunIds.push(newRun.id);
    
    const context = JSON.parse(newRun.context);
    assert.equal(context.dry_run, "false", "Context.dry_run should be 'false'");
  });

  it("verifies context.dry_run equals 'false' when CLI runs without --dry-run flag", () => {
    const workflowId = `test-workflow-${crypto.randomUUID()}`;
    const taskTitle = `Task for dry_run verification`;
    
    // Create test workflow
    createTestWorkflow(workflowId);
    
    // Call CLI with workflow run command (no --dry-run flag)
    const output = execFileSync("node", [cliPath, "workflow", "run", workflowId, taskTitle], {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 30000,
    });
    
    // Extract run ID
    const runIdMatch = output.match(/\(([a-f0-9-]{36})\)/);
    assert.ok(runIdMatch, "Output should contain a UUID");
    const runId = runIdMatch[1];
    testRunIds.push(runId);
    
    // Verify dry_run in database context
    const db = getDb();
    const run = db.prepare("SELECT context FROM runs WHERE id = ?").get(runId) as {
      context: string;
    } | undefined;
    
    assert.ok(run, "Run should exist in database");
    const context = JSON.parse(run.context);
    
    // Verify type is string and value is 'false'
    assert.equal(typeof context.dry_run, "string", "dry_run should be a string");
    assert.equal(context.dry_run, "false", "dry_run should equal the string 'false'");
  });
});
