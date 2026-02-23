/**
 * Regression test: test import paths work from both source and compiled locations
 *
 * Bug: Test files in tests/*.test.ts used static relative imports like
 * `import { loadWorkflowSpec } from "../dist/installer/workflow-spec.js"`
 * which worked when running tests directly from source (node --test tests/*.test.ts)
 * but broke when tests were compiled to dist/tests/tests/*.test.js because
 * the relative path "../dist/" resolved incorrectly.
 *
 * Fix: Use dynamic imports with import.meta.url and path.resolve to compute
 * the correct path regardless of where the test file is located.
 *
 * This test verifies that the dynamic import pattern works correctly.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

describe("dynamic import path resolution", () => {
  it("resolves dist/installer/workflow-spec.js correctly", () => {
    const workflowSpecPath = path.resolve(
      fileURLToPath(import.meta.url),
      "..",
      "..",
      "dist",
      "installer",
      "workflow-spec.js"
    );
    // The path should exist and be in the dist directory
    assert.ok(workflowSpecPath.includes("/dist/"), "path should include /dist/");
    assert.ok(workflowSpecPath.endsWith("workflow-spec.js"), "should end with workflow-spec.js");
    assert.ok(existsSync(workflowSpecPath), "resolved path should exist");
  });

  it("resolves dist/installer/agent-cron.js correctly", () => {
    const agentCronPath = path.resolve(
      fileURLToPath(import.meta.url),
      "..",
      "..",
      "dist",
      "installer",
      "agent-cron.js"
    );
    assert.ok(agentCronPath.includes("/dist/"), "path should include /dist/");
    assert.ok(agentCronPath.endsWith("agent-cron.js"), "should end with agent-cron.js");
    assert.ok(existsSync(agentCronPath), "resolved path should exist");
  });

  it("resolves dist/lib/logger.js correctly", () => {
    const loggerPath = path.resolve(
      fileURLToPath(import.meta.url),
      "..",
      "..",
      "dist",
      "lib",
      "logger.js"
    );
    assert.ok(loggerPath.includes("/dist/"), "path should include /dist/");
    assert.ok(loggerPath.endsWith("logger.js"), "should end with logger.js");
    assert.ok(existsSync(loggerPath), "resolved path should exist");
  });

  it("resolves dist/db.js correctly", () => {
    const dbPath = path.resolve(
      fileURLToPath(import.meta.url),
      "..",
      "..",
      "dist",
      "db.js"
    );
    assert.ok(dbPath.includes("/dist/"), "path should include /dist/");
    assert.ok(dbPath.endsWith("db.js"), "should end with db.js");
    assert.ok(existsSync(dbPath), "resolved path should exist");
  });

  it("can dynamically import workflow-spec module", async () => {
    const workflowSpecPath = path.resolve(
      fileURLToPath(import.meta.url),
      "..",
      "..",
      "dist",
      "installer",
      "workflow-spec.js"
    );
    const { loadWorkflowSpec } = await import(workflowSpecPath);
    assert.ok(typeof loadWorkflowSpec === "function", "loadWorkflowSpec should be a function");
  });
});
