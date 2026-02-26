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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "antfarm-scope-freeze-"));
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

describe("execution scope freeze/read backend API", () => {
  it("freezes current scope and records scope_frozen_at", async () => {
    const { getDb } = await importFreshDbModule();
    const db = getDb();
    const { freezeRunScope } = await importFreshStepOpsModule();

    const runId = crypto.randomUUID();
    const t = new Date().toISOString();

    db.prepare(
      "INSERT INTO runs (id, workflow_id, task, status, context, scope_status, scope_version, created_at, updated_at) VALUES (?, ?, ?, 'running', '{}', 'draft', 1, ?, ?)"
    ).run(runId, "wf", "freeze api", t, t);

    db.prepare(
      "INSERT INTO run_scope_items (run_id, scope_version, item_type, item_value, created_at) VALUES (?, 1, 'in_scope', 'src/installer/**', ?)"
    ).run(runId, t);

    const snapshot = freezeRunScope(runId);

    assert.equal(snapshot.status, "frozen");
    assert.equal(snapshot.scopeVersion, 1);
    assert.equal(snapshot.items.length, 1);
    assert.equal(snapshot.items[0]!.itemType, "in_scope");
    assert.equal(snapshot.items[0]!.itemValue, "src/installer/**");
    assert.ok(snapshot.scopeFrozenAt);

    const run = db.prepare("SELECT scope_status, scope_frozen_at FROM runs WHERE id = ?").get(runId) as
      | { scope_status: string; scope_frozen_at: string | null }
      | undefined;
    assert.equal(run?.scope_status, "frozen");
    assert.ok(run?.scope_frozen_at);
  });

  it("read API returns current scope version and items", async () => {
    const { getDb } = await importFreshDbModule();
    const db = getDb();
    const { readRunScope } = await importFreshStepOpsModule();

    const runId = crypto.randomUUID();
    const t = new Date().toISOString();

    db.prepare(
      "INSERT INTO runs (id, workflow_id, task, status, context, scope_status, scope_version, scope_frozen_at, created_at, updated_at) VALUES (?, ?, ?, 'running', '{}', 'frozen', 2, ?, ?, ?)"
    ).run(runId, "wf", "read scope", t, t, t);

    db.prepare(
      "INSERT INTO run_scope_items (run_id, scope_version, item_type, item_value, created_at) VALUES (?, 2, 'in_scope', 'src/db.ts', ?)"
    ).run(runId, t);
    db.prepare(
      "INSERT INTO run_scope_items (run_id, scope_version, item_type, item_value, created_at) VALUES (?, 2, 'out_of_scope', 'docs/**', ?)"
    ).run(runId, t);

    const snapshot = readRunScope(runId);
    assert.equal(snapshot.scopeVersion, 2);
    assert.equal(snapshot.status, "frozen");
    assert.ok(snapshot.scopeFrozenAt);
    assert.deepEqual(snapshot.items, [
      { itemType: "in_scope", itemValue: "src/db.ts" },
      { itemType: "out_of_scope", itemValue: "docs/**" },
    ]);
  });

  it("rejects duplicate freeze without version bump using deterministic error", async () => {
    const { getDb } = await importFreshDbModule();
    const db = getDb();
    const { freezeRunScope, ScopeFreezeError } = await importFreshStepOpsModule();

    const runId = crypto.randomUUID();
    const t = new Date().toISOString();

    db.prepare(
      "INSERT INTO runs (id, workflow_id, task, status, context, scope_status, scope_version, scope_frozen_at, created_at, updated_at) VALUES (?, ?, ?, 'running', '{}', 'frozen', 1, ?, ?, ?)"
    ).run(runId, "wf", "duplicate freeze", t, t, t);

    assert.throws(
      () => freezeRunScope(runId),
      (err: unknown) => err instanceof ScopeFreezeError && err.code === "SCOPE_ALREADY_FROZEN",
    );

    assert.throws(
      () => freezeRunScope(runId, { nextVersion: 1 }),
      (err: unknown) => err instanceof ScopeFreezeError && err.code === "SCOPE_VERSION_BUMP_REQUIRED",
    );
  });

  it("allows refreeze when version increments and moves active scope", async () => {
    const { getDb } = await importFreshDbModule();
    const db = getDb();
    const { freezeRunScope, readRunScope } = await importFreshStepOpsModule();

    const runId = crypto.randomUUID();
    const t = new Date().toISOString();

    db.prepare(
      "INSERT INTO runs (id, workflow_id, task, status, context, scope_status, scope_version, scope_frozen_at, created_at, updated_at) VALUES (?, ?, ?, 'running', '{}', 'frozen', 1, ?, ?, ?)"
    ).run(runId, "wf", "refreeze", t, t, t);

    db.prepare(
      "INSERT INTO run_scope_items (run_id, scope_version, item_type, item_value, created_at) VALUES (?, 1, 'in_scope', 'src/installer/step-ops.ts', ?)"
    ).run(runId, t);

    const snapshot = freezeRunScope(runId, { nextVersion: 2 });
    assert.equal(snapshot.scopeVersion, 2);
    assert.equal(snapshot.items.length, 1);

    const readBack = readRunScope(runId);
    assert.equal(readBack.scopeVersion, 2);
    assert.deepEqual(readBack.items, [{ itemType: "in_scope", itemValue: "src/installer/step-ops.ts" }]);
  });
});
