import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { unlinkSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
// When compiled, this file is at dist/tests/backlog-cli.test.js
// CLI is at dist/cli/cli.js (sibling of tests/)
const CLI = join(__dirname, "..", "cli", "cli.js");
const TEST_DB = "/tmp/antfarm-cli-test.db";

function run(cmd: string): string {
  return execSync(`node ${CLI} ${cmd}`, {
    env: { ...process.env, ANTFARM_DB_PATH: TEST_DB },
    encoding: "utf-8",
    timeout: 10000,
  }).trim();
}

function runFail(cmd: string): string {
  try {
    execSync(`node ${CLI} ${cmd}`, {
      env: { ...process.env, ANTFARM_DB_PATH: TEST_DB },
      encoding: "utf-8",
      timeout: 10000,
      stdio: ["pipe", "pipe", "pipe"],
    });
    assert.fail("Expected command to fail");
  } catch (err: any) {
    return (err.stderr || err.stdout || "").toString().trim();
  }
}

describe("backlog CLI", () => {
  beforeEach(() => {
    try { unlinkSync(TEST_DB); } catch {}
  });

  it("list shows empty message", () => {
    const out = run("backlog list");
    assert.match(out, /no backlog items/i);
  });

  it("add creates an item", () => {
    const out = run('backlog add "My first task"');
    assert.match(out, /created/i);
    assert.match(out, /my first task/i);
  });

  it("add with --workflow and --desc", () => {
    run('backlog add "Task with opts" --workflow feature-dev --desc "Some description"');
    const list = run("backlog list");
    assert.match(list, /task with opts/i);
    assert.match(list, /feature-dev/);
  });

  it("list shows items in priority order", () => {
    run('backlog add "First"');
    run('backlog add "Second"');
    const out = run("backlog list");
    const lines = out.split("\n");
    assert.equal(lines.length, 2);
    assert.match(lines[0], /first/i);
    assert.match(lines[1], /second/i);
  });

  it("update changes fields", () => {
    run('backlog add "Original"');
    const list = run("backlog list");
    const id = list.split(/\s+/)[0];
    const out = run(`backlog update ${id} --title "Updated"`);
    assert.match(out, /updated/i);
    const list2 = run("backlog list");
    assert.match(list2, /Updated/);
  });

  it("update non-existent item fails", () => {
    const err = runFail("backlog update nonexistent --title foo");
    assert.match(err, /not found/i);
  });

  it("delete removes an item", () => {
    run('backlog add "ToDelete"');
    const list = run("backlog list");
    const id = list.split(/\s+/)[0];
    const out = run(`backlog delete ${id}`);
    assert.match(out, /deleted/i);
    const list2 = run("backlog list");
    assert.match(list2, /no backlog items/i);
  });

  it("delete non-existent item fails", () => {
    const err = runFail("backlog delete nonexistent");
    assert.match(err, /not found/i);
  });

  it("reorder moves item", () => {
    run('backlog add "A"');
    run('backlog add "B"');
    const list = run("backlog list");
    const idB = list.split("\n")[1].split(/\s+/)[0];
    const out = run(`backlog reorder ${idB} 1`);
    assert.match(out, /reordered/i);
    const list2 = run("backlog list");
    // B should now be first
    assert.match(list2.split("\n")[0], new RegExp(idB));
  });

  it("dispatch without workflow fails", () => {
    run('backlog add "No workflow"');
    const list = run("backlog list");
    const id = list.split(/\s+/)[0];
    const err = runFail(`backlog dispatch ${id}`);
    assert.match(err, /no target workflow/i);
  });

  it("printUsage includes backlog commands", () => {
    // printUsage exits with code 1, so capture via runFail which gets stdout+stderr
    let out: string;
    try {
      out = run("");
    } catch (err: any) {
      out = (err.stdout || "") + (err.stderr || "");
    }
    assert.match(out, /backlog list/);
    assert.match(out, /backlog add/);
    assert.match(out, /backlog dispatch/);
    assert.match(out, /backlog reorder/);
  });
});
