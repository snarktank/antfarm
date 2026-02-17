import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

import { installWorkflow } from "../dist/installer/install.js";
import { runWorkflow } from "../dist/installer/run.js";
import { getDb } from "../dist/db.js";
import {
  __setGatewayApiForTests,
  __resetGatewayApiForTests,
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

describe("test-run: runWorkflow creates run row and attempts cron creation", () => {
  let createdCronJobs: any[];

  beforeEach(() => {
    createdCronJobs = [];

    __setGatewayApiForTests({
      // ensureWorkflowCrons calls listCronJobs first
      listCronJobs: async () => ({ ok: true, jobs: [] }),
      checkCronToolAvailable: async () => ({ ok: true }),
      createAgentCronJob: async (job: any) => {
        createdCronJobs.push(job);
        return { ok: true, id: `job-${createdCronJobs.length}` };
      },
      deleteAgentCronJobs: async () => ({ ok: true } as any),
    });
  });

  afterEach(() => {
    __resetGatewayApiForTests();
  });

  it("inserts a running run and creates agent cron jobs", async () => {
    await withTempStateDir(async () => {
      // Install bundled workflow into temp state dir so runWorkflow can resolve it
      await installWorkflow({ workflowId: "test-run" });

      const run = await runWorkflow({
        workflowId: "test-run",
        taskTitle: "noop test run",
      });

      // DB assertions: run row exists and is running
      const db = getDb();
      const row = db
        .prepare(
          "SELECT id, workflow_id, status FROM runs WHERE id = ? AND workflow_id = ?"
        )
        .get(run.id, "test-run") as any;

      assert.ok(row, "expected run row to exist");
      assert.equal(row.workflow_id, "test-run");
      assert.equal(row.status, "running");

      // Cron assertions: createAgentCronJob attempted for each agent
      assert.ok(createdCronJobs.length > 0, "expected at least one cron job creation");
      const expectedNames = new Set([
        // test-run has a single noop agent
        "antfarm/test-run/noop",
      ]);
      const actualNames = new Set(createdCronJobs.map((j) => j.name));
      for (const name of expectedNames) {
        assert.ok(actualNames.has(name), `expected cron job name ${name}`);
      }

      // Clean up DB row for this run so tests don't accumulate
      db.prepare("DELETE FROM steps WHERE run_id = ?").run(run.id);
      db.prepare("DELETE FROM runs WHERE id = ?").run(run.id);
    });
  });
});
