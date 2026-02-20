import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { runWorkflow } from "../installer/run.js";
import { getWorkflowStatus } from "../installer/status.js";
import { loadWorkflowSpec } from "../installer/workflow-spec.js";
import { resolveWorkflowDir } from "../installer/paths.js";
import { getDb } from "../db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const cliPath = join(__dirname, "..", "..", "dist", "cli", "cli.js");

describe("workflow run smoke test", () => {
  it("creates a feature-dev workflow run and enqueues steps with correct initial status", async () => {
    const taskTitle = `Smoke test run creation ${Date.now()}`;
    const workflow = await loadWorkflowSpec(resolveWorkflowDir("feature-dev"));
    const run = await runWorkflow({ workflowId: "feature-dev", taskTitle });

    try {
      assert.match(run.id, /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
      assert.equal(typeof run.runNumber, "number");
      assert.ok(run.runNumber > 0);
      assert.equal(run.workflowId, "feature-dev");
      assert.equal(run.task, taskTitle);
      assert.equal(run.status, "running");

      const status = getWorkflowStatus(run.id);
      assert.equal(status.status, "ok");
      if (status.status !== "ok") assert.fail("Expected run to exist in database");

      assert.equal(status.run.id, run.id);
      assert.equal(status.run.run_number, run.runNumber);
      assert.equal(status.run.workflow_id, "feature-dev");
      assert.equal(status.run.task, taskTitle);
      assert.equal(status.run.status, "running");
      assert.ok(new Date(status.run.created_at).toString() !== "Invalid Date");
      assert.ok(status.run.created_at.length > 0);

      const db = getDb();
      const steps = db.prepare(
        `SELECT step_id, agent_id, step_index, input_template, expects, status, max_retries, type, loop_config
         FROM steps
         WHERE run_id = ?
         ORDER BY step_index ASC`
      ).all(run.id) as Array<{
        step_id: string;
        agent_id: string;
        step_index: number;
        input_template: string;
        expects: string;
        status: string;
        max_retries: number;
        type: string;
        loop_config: string | null;
      }>;

      assert.equal(steps.length, workflow.steps.length);
      assert.equal(steps[0]?.step_index, 0);
      assert.equal(steps[0]?.status, "pending");

      for (let i = 1; i < steps.length; i++) {
        assert.equal(steps[i].status, "waiting");
      }

      for (let i = 0; i < steps.length; i++) {
        const row = steps[i];
        const specStep = workflow.steps[i];

        assert.equal(row.step_index, i);
        assert.equal(row.step_id, specStep.id);
        assert.equal(row.agent_id, `${workflow.id}_${specStep.agent}`);
        assert.ok(row.input_template.trim().length > 0);
        assert.ok(row.expects.trim().length > 0);
        assert.equal(row.input_template, specStep.input);
        assert.equal(row.expects, specStep.expects);

        const expectedType = specStep.type ?? "single";
        const expectedMaxRetries = specStep.max_retries ?? specStep.on_fail?.max_retries ?? 2;
        const expectedLoopConfig = specStep.loop ? JSON.stringify(specStep.loop) : null;

        assert.equal(row.type, expectedType);
        assert.equal(row.max_retries, expectedMaxRetries);
        assert.equal(row.loop_config, expectedLoopConfig);
      }
    } finally {
      const db = getDb();
      db.prepare("DELETE FROM stories WHERE run_id = ?").run(run.id);
      db.prepare("DELETE FROM steps WHERE run_id = ?").run(run.id);
      db.prepare("DELETE FROM runs WHERE id = ?").run(run.id);
    }
  });
});

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
