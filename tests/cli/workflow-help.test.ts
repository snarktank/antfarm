/**
 * Tests for workflow subcommand help
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const cliPath = join(__dirname, "..", "..", "dist", "cli", "cli.js");

/**
 * Execute the CLI and capture output and exit code
 */
function runCli(args: string[]): { stdout: string; stderr: string; exitCode: number } {
  try {
    const stdout = execSync(`node ${cliPath} ${args.join(" ")}`, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return { stdout, stderr: "", exitCode: 0 };
  } catch (error: unknown) {
    const err = error as { stdout?: Buffer; stderr?: Buffer; status?: number };
    return {
      stdout: err.stdout?.toString() ?? "",
      stderr: err.stderr?.toString() ?? "",
      exitCode: err.status ?? 1,
    };
  }
}

describe("Workflow Help", () => {
  it("should show workflow help and exit with code 0 when 'antfarm workflow help' is run", () => {
    const result = runCli(["workflow", "help"]);
    assert.strictEqual(result.exitCode, 0, "Expected exit code 0 for 'antfarm workflow help'");
    assert.ok(result.stdout.includes("WORKFLOW"), "Help output should include 'WORKFLOW'");
    assert.ok(result.stdout.includes("Manage workflows and workflow runs"), "Help output should include workflow description");
  });

  it("should show workflow help and exit with code 0 when 'antfarm workflow --help' is run", () => {
    const result = runCli(["workflow", "--help"]);
    assert.strictEqual(result.exitCode, 0, "Expected exit code 0 for 'antfarm workflow --help'");
    assert.ok(result.stdout.includes("WORKFLOW"), "Help output should include 'WORKFLOW'");
    assert.ok(result.stdout.includes("Manage workflows and workflow runs"), "Help output should include workflow description");
  });

  it("workflow help should include all subcommand descriptions", () => {
    const result = runCli(["workflow", "help"]);
    
    // Check for all workflow subcommands
    assert.ok(result.stdout.includes("list"), "Help should include 'list' subcommand");
    assert.ok(result.stdout.includes("install"), "Help should include 'install' subcommand");
    assert.ok(result.stdout.includes("uninstall"), "Help should include 'uninstall' subcommand");
    assert.ok(result.stdout.includes("run"), "Help should include 'run' subcommand");
    assert.ok(result.stdout.includes("status"), "Help should include 'status' subcommand");
    assert.ok(result.stdout.includes("runs"), "Help should include 'runs' subcommand");
    assert.ok(result.stdout.includes("resume"), "Help should include 'resume' subcommand");
    assert.ok(result.stdout.includes("stop"), "Help should include 'stop' subcommand");
    
    // Check for descriptions
    assert.ok(result.stdout.includes("List available workflows"), "Help should describe 'list' subcommand");
    assert.ok(result.stdout.includes("Start a new workflow run"), "Help should describe 'run' subcommand");
    assert.ok(result.stdout.includes("Resume a failed run"), "Help should describe 'resume' subcommand");
  });

  it("workflow help should include usage examples", () => {
    const result = runCli(["workflow", "help"]);
    
    assert.ok(result.stdout.includes("EXAMPLES:"), "Help should include 'EXAMPLES:' section");
    
    // Check for specific examples (at least 2)
    const exampleCount = (result.stdout.match(/antfarm workflow/g) || []).length;
    assert.ok(exampleCount >= 2, "Help should include at least 2 usage examples");
  });

  it("workflow help should include example of running a workflow", () => {
    const result = runCli(["workflow", "--help"]);
    
    assert.ok(result.stdout.includes("antfarm workflow run"), "Help should include example of running a workflow");
  });

  it("workflow help should include example of checking status", () => {
    const result = runCli(["workflow", "help"]);
    
    assert.ok(result.stdout.includes("antfarm workflow status"), "Help should include example of checking status");
  });

  it("workflow help should include example of resuming failed runs", () => {
    const result = runCli(["workflow", "help"]);
    
    assert.ok(result.stdout.includes("antfarm workflow resume"), "Help should include example of resuming failed runs");
  });

  it("workflow help should include SUBCOMMANDS section", () => {
    const result = runCli(["workflow", "help"]);
    
    assert.ok(result.stdout.includes("SUBCOMMANDS:"), "Help should include 'SUBCOMMANDS:' section");
  });
});
