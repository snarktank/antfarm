#!/usr/bin/env node
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--")) return process.argv[i + 1];
  return def;
}
function flag(name) { return process.argv.includes(`--${name}`); }

const root = process.cwd();
const antfarm = path.resolve(root, "./bin/antfarm");
const logPath = arg("log", "/var/log/antfarm/worker.log");
const agentsArg = arg("agents", "planner"); // comma-separated
const intervalSec = parseInt(arg("interval", "3"), 10);
const dryRun = flag("dry-run");
const once = flag("once");

function log(line) {
  const msg = `[${new Date().toISOString()}] ${line}\n`;
  try {
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.appendFileSync(logPath, msg);
  } catch {
    process.stdout.write(msg);
  }
}

function run(args) {
  return spawnSync(antfarm, args, { encoding: "utf8" });
}

if (!fs.existsSync(antfarm)) {
  log(`ERROR: missing ${antfarm}`);
  process.exit(1);
}

const agents = agentsArg.split(",").map(s => s.trim()).filter(Boolean);

log(`worker starting: agents=${agents.join(",")} intervalSec=${intervalSec} dryRun=${dryRun} once=${once}`);

if (dryRun) {
  const h = run(["--help"]);
  log(`antfarm --help status=${h.status}`);
  process.exit(h.status === 0 ? 0 : 2);
}

// Claim-only loop
while (true) {
  for (const agentId of agents) {
    const r = run(["step", "claim", agentId]);
    const out = (r.stdout || "").trim();
    const err = (r.stderr || "").trim();

    // Antfarm returns NO_WORK when nothing pending
    if (out) log(`[claim ${agentId}] stdout: ${out}`);
    if (err) log(`[claim ${agentId}] stderr: ${err}`);

    // If it returned JSON, log it (helps us discover step_id fields)
    if (out.startsWith("{")) {
      log(`[claim ${agentId}] claimed step payload detected (JSON)`);
    }
  }

  if (once) break;

  // sleep
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, intervalSec * 1000);
}

log("worker exiting (once).");
