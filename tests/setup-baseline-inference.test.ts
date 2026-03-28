import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import { getDb } from "../dist/db.js";
import { claimStep, completeStep } from "../dist/installer/step-ops.js";

const FIX_TEMPLATE = `Implement the bug fix.\nBUILD_CMD: {{build_cmd}}\nTEST_CMD: {{test_cmd}}\nBASELINE: {{baseline}}`;

describe("setup baseline inference", () => {
  let tmpDir: string;
  const runIds: string[] = [];
  const setupAgentId = `test-setup-${randomUUID().slice(0, 8)}`;
  const fixAgentId = `test-fix-${randomUUID().slice(0, 8)}`;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "antfarm-setup-"));
    fs.mkdirSync(path.join(tmpDir, "tests"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, "package.json"),
      JSON.stringify({ name: "tmp-antfarm", scripts: { build: "tsc -p tsconfig.json" } }, null, 2),
    );
    fs.writeFileSync(path.join(tmpDir, "tests", "sample.test.ts"), "import { test } from 'node:test'; test('ok', () => {});\n");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    const db = getDb();
    for (const runId of runIds) {
      db.prepare("DELETE FROM steps WHERE run_id = ?").run(runId);
      db.prepare("DELETE FROM runs WHERE id = ?").run(runId);
    }
    runIds.length = 0;
  });

  it("infers a runnable node --test command when package.json has no test script", () => {
    const db = getDb();
    const runId = randomUUID();
    const now = new Date().toISOString();
    runIds.push(runId);

    db.prepare(
      `INSERT INTO runs (id, workflow_id, task, status, context, created_at, updated_at)
       VALUES (?, 'test-workflow', 'test task', 'running', ?, ?, ?)`
    ).run(runId, JSON.stringify({ repo: tmpDir, branch: "main" }), now, now);

    const setupStepId = randomUUID();
    db.prepare(
      `INSERT INTO steps (id, step_id, run_id, agent_id, step_index, input_template, expects, status, created_at, updated_at, type)
       VALUES (?, 'setup', ?, ?, 0, 'setup', 'STATUS: done', 'running', ?, ?, 'single')`
    ).run(setupStepId, runId, setupAgentId, now, now);

    const fixStepId = randomUUID();
    db.prepare(
      `INSERT INTO steps (id, step_id, run_id, agent_id, step_index, input_template, expects, status, created_at, updated_at, type)
       VALUES (?, 'fix', ?, ?, 1, ?, 'STATUS: done', 'waiting', ?, ?, 'single')`
    ).run(fixStepId, runId, fixAgentId, FIX_TEMPLATE, now, now);

    completeStep(setupStepId, [
      'STATUS: done',
      'BUILD_CMD: npm run build',
      'BASELINE: build passes; tests discovered from tests/*.test.ts',
    ].join('\n'));

    const claimed = claimStep(fixAgentId);
    assert.ok(claimed.found, "fix step should become claimable");
    assert.ok(claimed.resolvedInput?.includes("BUILD_CMD: npm run build"));
    assert.ok(claimed.resolvedInput?.includes("TEST_CMD: node --test tests/*.test.ts"));
    assert.ok(claimed.resolvedInput?.includes("BASELINE: build passes; tests discovered from tests/*.test.ts"));
  });
});
