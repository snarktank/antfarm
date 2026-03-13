#!/usr/bin/env node

const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

function log(line) {
  console.log(line);
}
function die(msg) {
  console.error(`[cron-guard] ERROR: ${msg}`);
  process.exit(1);
}

function fileExists(p) {
  try {
    fs.accessSync(p, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function repoRootFromCwd() {
  // We expect to run with WorkingDirectory=/root/smartfunds/src/antfarm,
  // but this makes it resilient if invoked elsewhere.
  let dir = process.cwd();
  for (let i = 0; i < 8; i++) {
    const pkg = path.join(dir, "package.json");
    const bin = path.join(dir, "bin", "antfarm");
    if (fileExists(pkg) && fileExists(bin)) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

function runAntfarm(binPath, args, inherit = true) {
  try {
    execFileSync(binPath, args, {
      stdio: inherit ? "inherit" : "pipe",
      env: process.env,
    });
    return 0;
  } catch (e) {
    // Preserve useful output if available
    if (e.stdout) process.stdout.write(e.stdout.toString());
    if (e.stderr) process.stderr.write(e.stderr.toString());
    return typeof e.status === "number" ? e.status : 1;
  }
}

function header(mode) {
  const ts = new Date().toISOString();
  log("--------------------------------------------------");
  log(`[cron-guard] mode=${mode} ts=${ts}`);
  log(`[cron-guard] cwd=${process.cwd()}`);
  log("--------------------------------------------------");
}

function doctor(root, binPath) {
  log(`[doctor] root=${root}`);
  log(`[doctor] node=${process.version}`);
  log(`[doctor] bin=${binPath}`);

  if (!fileExists(binPath)) die(`bin/antfarm not found at ${binPath} (are you in the antfarm repo root?)`);

  // Only commands we KNOW exist in v0.2.2:
  let code = 0;
  code ||= runAntfarm(binPath, ["version"], true);
  code ||= runAntfarm(binPath, ["workflow", "list"], true);
  code ||= runAntfarm(binPath, ["workflow", "runs"], true);

  if (code !== 0) die(`doctor checks failed (exit=${code})`);
  log("[doctor] OK");
}

function tick(root, binPath) {
  // Tick should be fast + non-invasive. Just validate the CLI works and show runs.
  if (!fileExists(binPath)) die(`bin/antfarm not found at ${binPath}`);

  let code = 0;
  code ||= runAntfarm(binPath, ["version"], true);
  code ||= runAntfarm(binPath, ["workflow", "runs"], true);

  if (code !== 0) die(`tick failed (exit=${code})`);
  log("[tick] OK");
}

const mode = process.argv[2] || "help";
const root = repoRootFromCwd();
const binPath = path.join(root, "bin", "antfarm");

header(mode);

if (mode === "help" || mode === "--help" || mode === "-h") {
  console.log("Usage: node scripts/antfarm-cron-guard.cjs {doctor|tick}");
  process.exit(0);
}

if (mode === "doctor") {
  doctor(root, binPath);
  process.exit(0);
}

if (mode === "tick") {
  tick(root, binPath);
  process.exit(0);
}

die(`unknown mode: ${mode}`);
