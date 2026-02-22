/**
 * Tests for dashboard help command
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { execSync } from "node:child_process";

const CLI_PATH = "./dist/cli/cli.js";

describe("Dashboard Help", () => {
  it("antfarm dashboard help exits with code 0", () => {
    try {
      execSync(`node ${CLI_PATH} dashboard help`, { stdio: "pipe" });
    } catch (err: unknown) {
      const execError = err as { status?: number };
      assert.strictEqual(execError.status, 0, "Should exit with code 0");
    }
  });

  it("antfarm dashboard --help exits with code 0", () => {
    try {
      execSync(`node ${CLI_PATH} dashboard --help`, { stdio: "pipe" });
    } catch (err: unknown) {
      const execError = err as { status?: number };
      assert.strictEqual(execError.status, 0, "Should exit with code 0");
    }
  });

  it("dashboard help includes DASHBOARD header", () => {
    const output = execSync(`node ${CLI_PATH} dashboard help`, {
      encoding: "utf-8",
      stdio: "pipe",
    });
    assert.ok(output.includes("DASHBOARD - Control the web dashboard daemon"), "Should include DASHBOARD header");
  });

  it("dashboard help includes start subcommand", () => {
    const output = execSync(`node ${CLI_PATH} dashboard help`, {
      encoding: "utf-8",
      stdio: "pipe",
    });
    assert.ok(output.includes("start"), "Should include start subcommand");
    assert.ok(output.includes("Start dashboard daemon"), "Should describe start command");
  });

  it("dashboard help includes stop subcommand", () => {
    const output = execSync(`node ${CLI_PATH} dashboard help`, {
      encoding: "utf-8",
      stdio: "pipe",
    });
    assert.ok(output.includes("stop"), "Should include stop subcommand");
    assert.ok(output.includes("Stop dashboard daemon"), "Should describe stop command");
  });

  it("dashboard help includes status subcommand", () => {
    const output = execSync(`node ${CLI_PATH} dashboard help`, {
      encoding: "utf-8",
      stdio: "pipe",
    });
    assert.ok(output.includes("status"), "Should include status subcommand");
    assert.ok(output.includes("Check dashboard status"), "Should describe status command");
  });

  it("dashboard help includes --port option", () => {
    const output = execSync(`node ${CLI_PATH} dashboard help`, {
      encoding: "utf-8",
      stdio: "pipe",
    });
    assert.ok(output.includes("--port"), "Should document --port option");
  });

  it("dashboard help includes EXAMPLES section", () => {
    const output = execSync(`node ${CLI_PATH} dashboard help`, {
      encoding: "utf-8",
      stdio: "pipe",
    });
    assert.ok(output.includes("EXAMPLES"), "Should include EXAMPLES section");
    assert.ok(output.includes("default port"), "Should include default port example");
    assert.ok(output.includes("custom port"), "Should include custom port example");
  });
});
