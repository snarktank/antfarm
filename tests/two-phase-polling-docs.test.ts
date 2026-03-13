/**
 * Regression test: README.md documents the two-phase polling architecture.
 *
 * This test ensures the README contains documentation about the two-phase
 * polling design (cheap polling + expensive workers) so users understand
 * the cost-optimization pattern.
 */

import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

const README_PATH = path.resolve(import.meta.dirname, "..", "README.md");

describe("README documents two-phase polling architecture", () => {
  const readme = fs.readFileSync(README_PATH, "utf-8");

  it("has a Two-Phase Polling Architecture section", () => {
    assert.ok(
      readme.includes("Two-Phase Polling Architecture"),
      "README should contain a 'Two-Phase Polling Architecture' section"
    );
  });

  it("documents Phase 1 cheap polling", () => {
    assert.ok(
      readme.includes("step peek"),
      "README should mention 'step peek' for Phase 1 polling"
    );
  });

  it("documents Phase 2 expensive workers", () => {
    assert.ok(
      readme.includes("sessions_spawn"),
      "README should mention 'sessions_spawn' for Phase 2 worker spawning"
    );
  });

  it("documents polling model configuration options", () => {
    assert.ok(
      readme.includes("pollingModel"),
      "README should document the pollingModel configuration"
    );
    assert.ok(
      readme.includes("polling.model"),
      "README should document the workflow-level polling.model configuration"
    );
  });

  it("references the implementation source file", () => {
    assert.ok(
      readme.includes("agent-cron.ts"),
      "README should reference agent-cron.ts for implementation details"
    );
  });
});
