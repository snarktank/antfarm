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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "antfarm-dashboard-scope-api-"));
  tempHomes.push(dir);
  return dir;
}

async function importFreshDbModule() {
  const moduleUrl = `${pathToFileURL(path.join(process.cwd(), "dist/db.js")).href}?t=${Date.now()}-${Math.random()}`;
  return import(moduleUrl);
}

async function importFreshDashboardModule() {
  const moduleUrl = `${pathToFileURL(path.join(process.cwd(), "dist/server/dashboard.js")).href}?t=${Date.now()}-${Math.random()}`;
  return import(moduleUrl);
}

async function importFreshEventsModule() {
  const moduleUrl = `${pathToFileURL(path.join(process.cwd(), "dist/installer/events.js")).href}?t=${Date.now()}-${Math.random()}`;
  return import(moduleUrl);
}

after(() => {
  process.env.HOME = originalHome;
  while (tempHomes.length > 0) {
    const dir = tempHomes.pop()!;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("dashboard run detail scope payload", () => {
  it("includes scope metadata, scope items, violation count, and keeps existing fields", async () => {
    const { getDb } = await importFreshDbModule();
    const { startDashboard } = await importFreshDashboardModule();
    const { emitEvent } = await importFreshEventsModule();
    const db = getDb();

    const runId = crypto.randomUUID();
    const stepId = crypto.randomUUID();
    const now = new Date().toISOString();

    db.prepare(
      "INSERT INTO runs (id, workflow_id, task, status, context, scope_status, scope_version, scope_frozen_at, created_at, updated_at) VALUES (?, ?, ?, 'running', '{}', 'frozen', 2, ?, ?, ?)"
    ).run(runId, "wf", "dashboard scope payload", now, now, now);

    db.prepare(
      "INSERT INTO steps (id, run_id, step_id, agent_id, step_index, input_template, expects, status, created_at, updated_at) VALUES (?, ?, 'implement', 'dev', 1, '', '', 'done', ?, ?)"
    ).run(stepId, runId, now, now);

    db.prepare(
      "INSERT INTO run_scope_items (run_id, scope_version, item_type, item_value, created_at) VALUES (?, 2, 'story', 'US-007', ?), (?, 2, 'file', 'src/server/dashboard.ts', ?)"
    ).run(runId, now, runId, now);

    emitEvent({ ts: now, event: "scope.violation", runId, workflowId: "wf", detail: "story=US-999" });
    emitEvent({ ts: now, event: "scope.violation", runId, workflowId: "wf", detail: "story=US-998" });

    const server = startDashboard(0);
    try {
      const address = server.address();
      assert.ok(address && typeof address === "object");
      const res = await fetch(`http://127.0.0.1:${address.port}/api/runs/${runId}`);
      assert.equal(res.status, 200);
      const payload = await res.json() as any;

      assert.equal(payload.id, runId);
      assert.equal(payload.workflow_id, "wf");
      assert.equal(payload.task, "dashboard scope payload");
      assert.equal(payload.scope_status, "frozen");
      assert.equal(payload.scope_version, 2);
      assert.equal(payload.scope_frozen_at, now);
      assert.ok(Array.isArray(payload.steps));
      assert.equal(payload.steps.length, 1);

      assert.equal(payload.scope_violation_count, 2);
      assert.deepEqual(payload.scope_items, [
        { item_type: "file", item_value: "src/server/dashboard.ts" },
        { item_type: "story", item_value: "US-007" },
      ]);

      assert.deepEqual(payload.scope, {
        status: "frozen",
        version: 2,
        frozen_at: now,
        items: [
          { item_type: "file", item_value: "src/server/dashboard.ts" },
          { item_type: "story", item_value: "US-007" },
        ],
        violation_count: 2,
      });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
