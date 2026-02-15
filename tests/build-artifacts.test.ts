import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, "../dist");

test("Build Artifacts: cli.js exists and is executable", () => {
  const cliPath = path.join(distDir, "cli/cli.js");
  assert.ok(fs.existsSync(cliPath), "dist/cli/cli.js should exist");
  
  // Verify permissions (executable bit)
  const stats = fs.statSync(cliPath);
  // Check if executable by owner (S_IXUSR = 0o100)
  // On Windows, fs.accessSync(path, fs.constants.X_OK) might be better, but stat works for POSIX
  if (process.platform !== "win32") {
    assert.ok((stats.mode & 0o100) !== 0, "dist/cli/cli.js should be executable");
  }
});

test("Build Artifacts: server/index.html exists", () => {
  const indexPath = path.join(distDir, "server/index.html");
  assert.ok(fs.existsSync(indexPath), "dist/server/index.html should exist");
});
