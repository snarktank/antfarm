import { test } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getDb, getDbPath } from "../src/db.ts";

test("database directory and file should have restricted permissions", () => {
  // Trigger DB creation
  getDb();

  const dbPath = getDbPath();
  const dbDir = path.dirname(dbPath);

  const dirStat = fs.statSync(dbDir);
  const fileStat = fs.statSync(dbPath);

  const dirMode = dirStat.mode & 0o777;
  const fileMode = fileStat.mode & 0o777;

  console.log(`DB Dir Mode: ${dirMode.toString(8)}`);
  console.log(`DB File Mode: ${fileMode.toString(8)}`);

  // We want 0700 for directory and 0600 for file
  assert.strictEqual(dirMode, 0o700, "Database directory should be 0700");
  assert.strictEqual(fileMode, 0o600, "Database file should be 0600");
});
