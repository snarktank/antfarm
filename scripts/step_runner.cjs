#!/usr/bin/env node
const { execFileSync } = require("node:child_process");

function sh(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...opts });
}
function trim(s) { return (s ?? "").toString().trim(); }
function die(msg) { process.stderr.write(msg + "\n"); process.exit(1); }

const agentId = process.argv[2];
if (!agentId) die("Usage: node scripts/step_runner.js <agent_id> (e.g. smoke/alpha)");

const ANT_FARM_DIR = "/root/smartfunds/src/antfarm";
const DB = process.env.ANTFARM_DB || "/root/.openclaw/antfarm/antfarm.db";
const ANT_BIN = `${ANT_FARM_DIR}/bin/antfarm`;
const CLI_JS = `${ANT_FARM_DIR}/dist/cli/cli.js`;

function claim(agent) {
  return trim(sh(ANT_BIN, ["step", "claim", agent], { cwd: ANT_FARM_DIR }));
}
function getStepUuid(runId, agent) {
  const q = `SELECT id FROM steps WHERE run_id='${runId}' AND agent_id='${agent}' ORDER BY step_index LIMIT 1;`;
  return trim(sh("sqlite3", [DB, q]));
}
function complete(stepUuid, outputText) {
  return trim(execFileSync("node", [CLI_JS, "step", "complete", stepUuid], {
    cwd: ANT_FARM_DIR, encoding: "utf8", input: outputText
  }));
}
function fail(stepUuid, reason) {
  return trim(sh("node", [CLI_JS, "step", "fail", stepUuid, reason], { cwd: ANT_FARM_DIR }));
}
function formatDone() {
  return `STATUS: done
CHANGES: noop
TESTS: none
`;
}

let out;
try {
  out = claim(agentId);
} catch (e) {
  die(`claim failed: ${e?.stderr?.toString?.() || e?.message || e}`);
}

if (out === "NO_WORK") {
  process.stdout.write("NO_WORK\n");
  process.exit(0);
}

let payload;
try {
  payload = JSON.parse(out);
} catch {
  die(`claim output was not JSON and not NO_WORK:\n${out}`);
}

const runId = payload.runId;
const input = payload.input;

if (!runId) die(`claim JSON missing runId:\n${out}`);

const stepUuid = getStepUuid(runId, agentId);
if (!stepUuid) die(`could not find step UUID for runId=${runId} agent=${agentId}`);

const normalized = trim(input).toLowerCase();
if (normalized && normalized !== "noop") {
  const msg = `step_runner only supports noop right now. input="${input}"`;
  process.stdout.write(fail(stepUuid, msg) + "\n");
  process.exit(2);
}

try {
  process.stdout.write(complete(stepUuid, formatDone()) + "\n");
} catch (e) {
  const msg = `complete failed: ${e?.stderr?.toString?.() || e?.message || e}`;
  try { process.stdout.write(fail(stepUuid, msg) + "\n"); } catch {}
  die(msg);
}
