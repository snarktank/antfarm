/**
 * Regression test: polling timeout values stay in sync
 *
 * This test was added after a bug where test assertions expected
 * timeoutSeconds=30 but the workflow.yml files had been updated to 120.
 * It reads the actual workflow.yml values and asserts they match expectations,
 * ensuring tests and config never drift apart again.
 *
 * See: https://github.com/snarktank/antfarm/issues/121
 */

import path from "node:path";
import { readFile } from "node:fs/promises";
import { loadWorkflowSpec } from "../dist/installer/workflow-spec.js";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

const WORKFLOWS_DIR = path.resolve(import.meta.dirname, "..", "workflows");

const WORKFLOW_NAMES = ["bug-fix", "feature-dev", "security-audit"];

describe("polling timeout sync across all workflows", () => {
  for (const name of WORKFLOW_NAMES) {
    it(`${name} workflow polling.timeoutSeconds matches workflow.yml`, async () => {
      const dir = path.join(WORKFLOWS_DIR, name);
      const spec = await loadWorkflowSpec(dir);

      assert.ok(spec.polling, `${name} should have a polling config`);
      assert.ok(
        typeof spec.polling.timeoutSeconds === "number",
        `${name} polling.timeoutSeconds should be a number`
      );
      // The loaded spec should reflect the actual YAML value
      // If this fails, it means the spec loader or the YAML is misconfigured
      assert.equal(
        spec.polling.timeoutSeconds,
        120,
        `${name} polling timeout should be 120s (was changed from 30s — see issue #121)`
      );
    });

    it(`${name} workflow polling.model is set to sonnet for cheap polling`, async () => {
      const dir = path.join(WORKFLOWS_DIR, name);
      const spec = await loadWorkflowSpec(dir);

      assert.ok(spec.polling, `${name} should have a polling config`);
      assert.ok(
        spec.polling.model?.includes("sonnet"),
        `${name} polling model should be a sonnet variant for cheap idle polls, got: ${spec.polling.model}`
      );
    });
  }

  it("all workflows use the same polling timeout", async () => {
    const timeouts = new Set<number>();
    for (const name of WORKFLOW_NAMES) {
      const dir = path.join(WORKFLOWS_DIR, name);
      const spec = await loadWorkflowSpec(dir);
      timeouts.add(spec.polling.timeoutSeconds);
    }
    assert.equal(
      timeouts.size,
      1,
      `All workflows should use the same polling timeout, but found: ${[...timeouts].join(", ")}`
    );
  });
});
