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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "antfarm-scope-baseline-"));
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

after(() => {
  process.env.HOME = originalHome;
  while (tempHomes.length > 0) {
    const dir = tempHomes.pop()!;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("planner scope baseline persistence", () => {
  it("persists normalized scope rows and marks run as draft with version 1", async () => {
    const { getDb } = await importFreshDbModule();
    const db = getDb();
    const { completeStep } = await importFreshStepOpsModule();

    const runId = crypto.randomUUID();
    const stepId = crypto.randomUUID();
    const t = new Date().toISOString();

    db.prepare(
      "INSERT INTO runs (id, workflow_id, task, status, context, created_at, updated_at) VALUES (?, ?, ?, 'running', '{}', ?, ?)"
    ).run(runId, "wf", "scope baseline", t, t);

    db.prepare(
      "INSERT INTO steps (id, run_id, step_id, agent_id, step_index, input_template, expects, status, type, created_at, updated_at) VALUES (?, ?, ?, 'planner', 0, '', '', 'running', 'single', ?, ?)"
    ).run(stepId, runId, "plan", t, t);

    const output = [
      "STATUS: done",
      "SCOPE_JSON:",
      "{",
      '  "in_scope": ["src/installer/**", "src/db.ts", "src/db.ts"],',
      '  "out_of_scope": ["docs/**"]',
      "}",
    ].join("\n");

    completeStep(stepId, output);

    const run = db.prepare("SELECT scope_status, scope_version FROM runs WHERE id = ?").get(runId) as
      | { scope_status: string; scope_version: number }
      | undefined;

    assert.ok(run, "run should exist");
    assert.equal(run!.scope_status, "draft");
    assert.equal(run!.scope_version, 1);

    const scopeRowsRaw = db
      .prepare("SELECT scope_version, item_type, item_value FROM run_scope_items WHERE run_id = ? ORDER BY item_type, item_value")
      .all(runId) as Array<{ scope_version: number; item_type: string; item_value: string }>;
    const scopeRows = scopeRowsRaw.map((row) => ({ ...row }));

    assert.deepEqual(scopeRows, [
      { scope_version: 1, item_type: "in_scope", item_value: "src/db.ts" },
      { scope_version: 1, item_type: "in_scope", item_value: "src/installer/**" },
      { scope_version: 1, item_type: "out_of_scope", item_value: "docs/**" },
    ]);
  });

  it("throws deterministic parse error when SCOPE_JSON is malformed", async () => {
    const { getDb } = await importFreshDbModule();
    const db = getDb();
    const { completeStep } = await importFreshStepOpsModule();

    const runId = crypto.randomUUID();
    const stepId = crypto.randomUUID();
    const t = new Date().toISOString();

    db.prepare(
      "INSERT INTO runs (id, workflow_id, task, status, context, created_at, updated_at) VALUES (?, ?, ?, 'running', '{}', ?, ?)"
    ).run(runId, "wf", "scope baseline", t, t);

    db.prepare(
      "INSERT INTO steps (id, run_id, step_id, agent_id, step_index, input_template, expects, status, type, created_at, updated_at) VALUES (?, ?, ?, 'planner', 0, '', '', 'running', 'single', ?, ?)"
    ).run(stepId, runId, "plan", t, t);

    assert.throws(
      () => completeStep(stepId, 'STATUS: done\nSCOPE_JSON: {"in_scope": ["src/**"]'),
      /Failed to parse SCOPE_JSON:/,
    );
  });
});
