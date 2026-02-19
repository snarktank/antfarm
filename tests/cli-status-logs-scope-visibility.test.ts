import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "antfarm-cli-status-logs-"));
  tempHomes.push(dir);
  return dir;
}

async function importFreshDbModule() {
  const moduleUrl = `${pathToFileURL(path.join(process.cwd(), "dist/db.js")).href}?t=${Date.now()}-${Math.random()}`;
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

describe("workflow status/logs scope visibility", () => {
  it("includes scope status and version in workflow status output", async () => {
    const { getDb } = await importFreshDbModule();
    const db = getDb();

    const runId = crypto.randomUUID();
    const t = new Date().toISOString();

    db.prepare(
      "INSERT INTO runs (id, workflow_id, task, status, context, scope_status, scope_version, scope_frozen_at, created_at, updated_at) VALUES (?, ?, ?, 'running', '{}', 'frozen', 3, ?, ?, ?)"
    ).run(runId, "wf", "status scope visibility", t, t, t);

    const output = execFileSync("node", [CLI, "workflow", "status", runId], {
      encoding: "utf-8",
      env: { ...process.env, HOME: sharedHome },
    });

    assert.match(output, /Scope: frozen \(v3\)/);
    assert.match(output, new RegExp(`Scope: frozen \\(v3\\) at ${t}`));
  });

  it("renders stable labels for scope-related events in logs output", async () => {
    const { getDb } = await importFreshDbModule();
    const { emitEvent } = await importFreshEventsModule();
    const db = getDb();

    const runId = crypto.randomUUID();
    const t = new Date().toISOString();

    db.prepare(
      "INSERT INTO runs (id, workflow_id, task, status, context, created_at, updated_at) VALUES (?, ?, ?, 'running', '{}', ?, ?)"
    ).run(runId, "wf", "logs scope visibility", t, t);

    emitEvent({ ts: t, event: "scope.frozen", runId, workflowId: "wf", detail: "version=1" });
    emitEvent({ ts: t, event: "scope.violation", runId, workflowId: "wf", detail: "story=US-999" });

    const output = execFileSync("node", [CLI, "logs", runId], {
      encoding: "utf-8",
      env: { ...process.env, HOME: sharedHome },
    });

    assert.match(output, /Scope frozen \(version=1\)/);
    assert.match(output, /Scope violation \(story=US-999\)/);
  });
});
