import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { loadWorkflowSpec } from "../dist/installer/workflow-spec.js";

const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const CLI = path.join(REPO_ROOT, "dist", "cli", "cli.js");
const WORKFLOW_DIR = path.join(REPO_ROOT, "workflows", "workflow-dev");
const STORIES_JSON = '[{"id":"US-006","title":"Add polling tests","description":"desc","acceptanceCriteria":["ac"]}]';

function initDb(dbPath: string): DatabaseSync {
  const db = new DatabaseSync(dbPath);
  db.exec(`
    CREATE TABLE runs (id TEXT PRIMARY KEY, workflow_id TEXT, task TEXT, status TEXT, context TEXT, notify_url TEXT, run_number INTEGER, created_at TEXT, updated_at TEXT);
    CREATE TABLE steps (id TEXT PRIMARY KEY, run_id TEXT, step_id TEXT, agent_id TEXT, step_index INTEGER, input_template TEXT, expects TEXT, status TEXT, output TEXT, retry_count INTEGER, max_retries INTEGER, abandoned_count INTEGER, created_at TEXT, updated_at TEXT, type TEXT, loop_config TEXT, current_story_id TEXT);
    CREATE TABLE stories (id TEXT PRIMARY KEY, run_id TEXT, story_index INTEGER, story_id TEXT, title TEXT, description TEXT, acceptance_criteria TEXT, status TEXT, output TEXT, retry_count INTEGER, max_retries INTEGER, created_at TEXT, updated_at TEXT);
    CREATE TABLE events (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, event TEXT, run_id TEXT, workflow_id TEXT, step_id TEXT, agent_id TEXT, story_id TEXT, story_title TEXT, detail TEXT, created_at TEXT);
  `);
  return db;
}

describe("workflow-dev polling progression", () => {
  let tmpDir: string;
  let env: NodeJS.ProcessEnv;
  let db: DatabaseSync;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "antfarm-workflow-dev-polling-"));
    const stateDir = path.join(tmpDir, "state");
    await fs.mkdir(stateDir, { recursive: true });
    await fs.writeFile(path.join(stateDir, "openclaw.json"), JSON.stringify({ agents: { list: [] } }), "utf8");
    env = { ...process.env, HOME: tmpDir, OPENCLAW_STATE_DIR: stateDir, OPENCLAW_CONFIG_PATH: path.join(stateDir, "openclaw.json") };

    const dbPath = path.join(tmpDir, ".openclaw", "antfarm", "antfarm.db");
    await fs.mkdir(path.dirname(dbPath), { recursive: true });
    db = initDb(dbPath);
  });

  afterEach(async () => {
    db.close();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  function cli(args: string[], input?: string): string {
    return execFileSync("node", [CLI, ...args], { cwd: REPO_ROOT, env, encoding: "utf8", input }).trim();
  }

  async function seedRun() {
    const spec = await loadWorkflowSpec(WORKFLOW_DIR);
    const runId = crypto.randomUUID();
    const now = new Date().toISOString();
    db.prepare("INSERT INTO runs VALUES (?, ?, ?, 'running', ?, NULL, 1, ?, ?)")
      .run(runId, spec.id, "task", JSON.stringify({ task: "task" }), now, now);

    const stepIds: Record<string, string> = {};
    spec.steps.forEach((s, i) => {
      const id = crypto.randomUUID();
      stepIds[s.id] = id;
      db.prepare("INSERT INTO steps VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, 0, ?, 0, ?, ?, ?, ?, NULL)")
        .run(id, runId, s.id, `${spec.id}_${s.agent}`, i, s.input, s.expects, i === 0 ? "pending" : "waiting", s.max_retries ?? s.on_fail?.max_retries ?? 2, now, now, s.type ?? "single", s.loop ? JSON.stringify(s.loop) : null);
    });
    return { runId, stepIds };
  }

  it("runs all configured steps in order and completes", async () => {
    const { runId, stepIds } = await seedRun();
    const ordered: string[] = [];

    const plan = JSON.parse(cli(["step", "claim", "workflow-dev_planner"]));
    ordered.push("plan");
    cli(["step", "complete", plan.stepId], `STATUS: done\nREPO: /repo\nBRANCH: feature/x\nSTORIES_JSON: ${STORIES_JSON}`);
    db.prepare("UPDATE runs SET context = json_set(context, '$.stories_json', ?) WHERE id = ?").run(STORIES_JSON, runId);

    const specify = JSON.parse(cli(["step", "claim", "workflow-dev_architect"]));
    ordered.push("specify");
    cli(["step", "complete", specify.stepId], "STATUS: done\nSPEC_JSON: {}\nSPEC_CHECKS: ok");

    const setup = JSON.parse(cli(["step", "claim", "workflow-dev_setup"]));
    ordered.push("setup");
    assert.ok(setup.input.includes("REPO: /repo"));
    assert.ok(setup.input.includes("BRANCH: feature/x"));
    cli(["step", "complete", setup.stepId], "STATUS: done\nBUILD_CMD: npm run build\nTEST_CMD: npm test\nBASELINE: clean");

    const impl = JSON.parse(cli(["step", "claim", "workflow-dev_developer"]));
    ordered.push("implement");
    assert.ok(impl.input.includes("Story US-006"));
    cli(["step", "complete", impl.stepId], "STATUS: done\nCHANGES: impl\nTESTS: tests");

    ordered.push("verify");
    cli(["step", "complete", stepIds.verify], "STATUS: done\nVERIFIED: pass");

    const pr = JSON.parse(cli(["step", "claim", "workflow-dev_pr"]));
    ordered.push("pr");
    assert.ok(pr.input.includes("CHANGES: impl"));
    cli(["step", "complete", pr.stepId], "STATUS: done\nPR: https://example/pr");

    assert.deepEqual(ordered, ["plan", "specify", "setup", "implement", "verify", "pr"]);
    const run = db.prepare("SELECT status, context FROM runs WHERE id = ?").get(runId) as { status: string; context: string };
    assert.equal(run.status, "completed");
    const ctx = JSON.parse(run.context);
    for (const k of ["repo", "branch", "build_cmd", "test_cmd", "changes"]) assert.ok(ctx[k]);
  });

  it("supports retry transition from verify back to implement", async () => {
    const { runId, stepIds } = await seedRun();
    const plan = JSON.parse(cli(["step", "claim", "workflow-dev_planner"]));
    cli(["step", "complete", plan.stepId], `STATUS: done\nREPO: /repo\nBRANCH: feature/x\nSTORIES_JSON: ${STORIES_JSON}`);
    db.prepare("UPDATE runs SET context = json_set(context, '$.stories_json', ?) WHERE id = ?").run(STORIES_JSON, runId);
    const specify = JSON.parse(cli(["step", "claim", "workflow-dev_architect"]));
    cli(["step", "complete", specify.stepId], "STATUS: done\nSPEC_JSON: {}\nSPEC_CHECKS: ok");
    const setup = JSON.parse(cli(["step", "claim", "workflow-dev_setup"]));
    cli(["step", "complete", setup.stepId], "STATUS: done\nBUILD_CMD: npm run build\nTEST_CMD: npm test\nBASELINE: clean");

    const impl1 = JSON.parse(cli(["step", "claim", "workflow-dev_developer"]));
    cli(["step", "complete", impl1.stepId], "STATUS: done\nCHANGES: first\nTESTS: first");
    cli(["step", "complete", stepIds.verify], "STATUS: retry\nISSUES: add retry assertion");

    const stepState = db.prepare("SELECT status FROM steps WHERE id = ?").get(stepIds.implement) as { status: string };
    assert.equal(stepState.status, "pending");

    const impl2 = JSON.parse(cli(["step", "claim", "workflow-dev_developer"]));
    assert.ok(impl2.input.includes("add retry assertion"));
    cli(["step", "complete", impl2.stepId], "STATUS: done\nCHANGES: second\nTESTS: retry");
    cli(["step", "complete", stepIds.verify], "STATUS: done\nVERIFIED: fixed");

    const pr = JSON.parse(cli(["step", "claim", "workflow-dev_pr"]));
    cli(["step", "complete", pr.stepId], "STATUS: done\nPR: https://example/pr2");

    const run = db.prepare("SELECT status, context FROM runs WHERE id = ?").get(runId) as { status: string; context: string };
    assert.equal(run.status, "completed");
    assert.equal(JSON.parse(run.context).verify_feedback, undefined);
  });
});
