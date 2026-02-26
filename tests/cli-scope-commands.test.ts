import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { pathToFileURL } from "node:url";

const tempHomes: string[] = [];
const originalHome = process.env.HOME;
const sharedHome = makeTempHome();
process.env.HOME = sharedHome;

const CLI = path.resolve(process.cwd(), "dist", "cli", "cli.js");

function makeTempHome(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "antfarm-cli-scope-"));
  tempHomes.push(dir);
  return dir;
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

describe("workflow scope CLI commands", () => {
  it("includes scope and scope-freeze commands in CLI help text", () => {
    let output = "";
    try {
      output = execFileSync("node", [CLI], { encoding: "utf-8", env: { ...process.env, HOME: sharedHome } });
    } catch (e: any) {
      output = e.stdout ?? "";
    }

    assert.match(output, /antfarm workflow scope <run-id>/);
    assert.match(output, /antfarm workflow scope-freeze <run-id>/);
  });

  it("prints scope status, version, and frozen timestamp for a run", async () => {
    const { getDb } = await importFreshDbModule();
    const db = getDb();

    const runId = crypto.randomUUID();
    const t = new Date().toISOString();

    db.prepare(
      "INSERT INTO runs (id, workflow_id, task, status, context, scope_status, scope_version, scope_frozen_at, created_at, updated_at) VALUES (?, ?, ?, 'running', '{}', 'frozen', 2, ?, ?, ?)"
    ).run(runId, "wf", "scope inspect", t, t, t);

    db.prepare(
      "INSERT INTO run_scope_items (run_id, scope_version, item_type, item_value, created_at) VALUES (?, 2, 'in_scope', 'src/cli/cli.ts', ?)"
    ).run(runId, t);

    const output = execFileSync("node", [CLI, "workflow", "scope", runId], {
      encoding: "utf-8",
      env: { ...process.env, HOME: sharedHome },
    });

    assert.match(output, new RegExp(`run_id=${runId}`));
    assert.match(output, /scope_status=frozen/);
    assert.match(output, /scope_version=2/);
    assert.match(output, new RegExp(`scope_frozen_at=${t}`));
  });

  it("freezes scope and returns non-zero exit code when freeze fails", async () => {
    const { getDb } = await importFreshDbModule();
    const db = getDb();

    const runId = crypto.randomUUID();
    const t = new Date().toISOString();

    db.prepare(
      "INSERT INTO runs (id, workflow_id, task, status, context, scope_status, scope_version, created_at, updated_at) VALUES (?, ?, ?, 'running', '{}', 'draft', 1, ?, ?)"
    ).run(runId, "wf", "scope freeze", t, t);

    db.prepare(
      "INSERT INTO run_scope_items (run_id, scope_version, item_type, item_value, created_at) VALUES (?, 1, 'in_scope', 'src/installer/**', ?)"
    ).run(runId, t);

    const freezeOk = spawnSync("node", [CLI, "workflow", "scope-freeze", runId], {
      encoding: "utf-8",
      env: { ...process.env, HOME: sharedHome },
    });

    assert.equal(freezeOk.status, 0);
    assert.match(freezeOk.stdout, /ok=1/);
    assert.match(freezeOk.stdout, /scope_status=frozen/);

    const freezeAgain = spawnSync("node", [CLI, "workflow", "scope-freeze", runId], {
      encoding: "utf-8",
      env: { ...process.env, HOME: sharedHome },
    });

    assert.notEqual(freezeAgain.status, 0);
    assert.match(freezeAgain.stderr, /SCOPE_ALREADY_FROZEN/);
  });
});
