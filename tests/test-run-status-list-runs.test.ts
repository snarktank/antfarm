import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { installWorkflow } from "../dist/installer/install.js";
import { runWorkflow } from "../dist/installer/run.js";
import { getDb } from "../dist/db.js";
import { getWorkflowStatus, listRuns } from "../dist/installer/status.js";
import { loadWorkflowSpec } from "../dist/installer/workflow-spec.js";
import { resolveBundledWorkflowDir } from "../dist/installer/paths.js";
import {
  __resetGatewayApiForTests,
  __setGatewayApiForTests,
} from "../dist/installer/agent-cron.js";

async function withTempStateDir<T>(fn: () => Promise<T>): Promise<T> {
  const prev = process.env.OPENCLAW_STATE_DIR;
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "antfarm-test-openclaw-"));
  process.env.OPENCLAW_STATE_DIR = tmp;

  // installWorkflow requires an OpenClaw config file to exist
  await fs.writeFile(path.join(tmp, "openclaw.json"), "{}\n", "utf-8");

  try {
    return await fn();
  } finally {
    if (prev === undefined) delete process.env.OPENCLAW_STATE_DIR;
    else process.env.OPENCLAW_STATE_DIR = prev;
    await fs.rm(tmp, { recursive: true, force: true });
  }
}

describe("test-run: listRuns + getWorkflowStatus include created run", () => {
  beforeEach(() => {
    __setGatewayApiForTests({
      listCronJobs: async () => ({ ok: true, jobs: [] }),
      checkCronToolAvailable: async () => ({ ok: true }),
      createAgentCronJob: async () => ({ ok: true, id: "job-1" }),
      deleteAgentCronJobs: async () => ({ ok: true } as any),
    });
  });

  afterEach(() => {
    __resetGatewayApiForTests();
  });

  it("returns the run from listRuns, and status is ok via run number, task substring, and run id prefix", async () => {
    await withTempStateDir(async () => {
      await installWorkflow({ workflowId: "test-run" });

      const taskTitle = `noop test run: status/listRuns ${Date.now()}`;
      const taskSubstring = "status/listRuns";

      const run = await runWorkflow({
        workflowId: "test-run",
        taskTitle,
      });

      const spec = await loadWorkflowSpec(resolveBundledWorkflowDir("test-run"));
      assert.ok(spec.steps.length > 0, "expected at least one step in workflow spec");

      // 1) listRuns returns the newly created test-run entry
      const runs = listRuns();
      const created = runs.find((r) => r.id === run.id);
      assert.ok(created, "expected created run to appear in listRuns()");
      assert.equal(created.workflow_id, "test-run");
      assert.equal(created.task, taskTitle);
      assert.equal(created.status, "running");

      // 2) getWorkflowStatus using run number returns status ok
      const statusByRunNumber = getWorkflowStatus(String(run.runNumber));
      assert.equal(statusByRunNumber.status, "ok");
      assert.equal(statusByRunNumber.run.id, run.id);

      // 2) ... using task substring returns status ok
      const statusByTaskSubstring = getWorkflowStatus(taskSubstring);
      assert.equal(statusByTaskSubstring.status, "ok");
      assert.equal(statusByTaskSubstring.run.id, run.id);

      // 2) ... using run id prefix returns status ok
      const statusByIdPrefix = getWorkflowStatus(run.id.slice(0, 8));
      assert.equal(statusByIdPrefix.status, "ok");
      assert.equal(statusByIdPrefix.run.id, run.id);

      // 3) steps length equals workflow.yml step count
      assert.equal(statusByIdPrefix.steps.length, spec.steps.length);

      // Clean up DB rows for this run so tests don't accumulate
      const db = getDb();
      db.prepare("DELETE FROM steps WHERE run_id = ?").run(run.id);
      db.prepare("DELETE FROM runs WHERE id = ?").run(run.id);
    });
  });
});
