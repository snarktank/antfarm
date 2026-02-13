/**
 * Regression test: polling timeout values match workflow YAML configs
 *
 * Guards against test expectations drifting from actual workflow config.
 * See: https://github.com/snarktank/antfarm/issues/124
 *
 * Three tests previously hardcoded timeoutSeconds=30 when the actual
 * workflow YAMLs all specify 120 (DEFAULT_POLLING_TIMEOUT_SECONDS).
 */

import path from "node:path";
import fs from "node:fs";
import { loadWorkflowSpec } from "../dist/installer/workflow-spec.js";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

const WORKFLOWS_DIR = path.resolve(import.meta.dirname, "..", "workflows");

describe("polling timeout consistency across all workflows", () => {
  it("all workflows with polling have timeoutSeconds >= 60", async () => {
    const entries = fs.readdirSync(WORKFLOWS_DIR, { withFileTypes: true });
    const workflowDirs = entries
      .filter((e) => e.isDirectory())
      .map((e) => path.join(WORKFLOWS_DIR, e.name));

    let checked = 0;
    for (const dir of workflowDirs) {
      const spec = await loadWorkflowSpec(dir);
      if (spec.polling?.timeoutSeconds != null) {
        assert.ok(
          spec.polling.timeoutSeconds >= 60,
          `${spec.id} polling timeoutSeconds should be >= 60, got ${spec.polling.timeoutSeconds}`
        );
        checked++;
      }
    }
    assert.ok(checked >= 3, `Expected at least 3 workflows with polling, found ${checked}`);
  });

  it("bug-fix, feature-dev, and security-audit all use 120s timeout", async () => {
    const expectedWorkflows = ["bug-fix", "feature-dev", "security-audit"];

    for (const name of expectedWorkflows) {
      const dir = path.join(WORKFLOWS_DIR, name);
      const spec = await loadWorkflowSpec(dir);
      assert.equal(
        spec.polling?.timeoutSeconds,
        120,
        `${name} workflow should have polling.timeoutSeconds=120`
      );
    }
  });
});
