/**
 * Regression test: ensure package.json defines the required npm scripts.
 * This prevents missing scripts (like `dev`) from breaking contributor workflows.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const pkgPath = path.resolve(import.meta.dirname, "..", "package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));

describe("package.json scripts", () => {
  it("defines a dev script so pnpm dev / npm run dev works", () => {
    assert.ok(
      typeof pkg.scripts?.dev === "string" && pkg.scripts.dev.length > 0,
      'package.json must have a non-empty "dev" script'
    );
  });

  it("defines a build script", () => {
    assert.ok(
      typeof pkg.scripts?.build === "string" && pkg.scripts.build.length > 0,
      'package.json must have a non-empty "build" script'
    );
  });

  it("defines a start script", () => {
    assert.ok(
      typeof pkg.scripts?.start === "string" && pkg.scripts.start.length > 0,
      'package.json must have a non-empty "start" script'
    );
  });
});
