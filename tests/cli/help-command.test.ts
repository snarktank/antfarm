/**
 * Tests for help command handling in CLI
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

describe("CLI Help Command", () => {
  it("should show help and exit with code 0 when 'antfarm help' is run", () => {
    const result = runCli(["help"]);
    assert.strictEqual(result.exitCode, 0, "Expected exit code 0 for 'antfarm help'");
    assert.ok(result.stdout.includes("Antfarm"), "Help output should include 'Antfarm'");
    assert.ok(result.stdout.includes("USAGE:"), "Help output should include 'USAGE:'");
    assert.ok(result.stdout.includes("COMMANDS:"), "Help output should include 'COMMANDS:'");
  });

  it("should show help and exit with code 0 when 'antfarm --help' is run", () => {
    const result = runCli(["--help"]);
    assert.strictEqual(result.exitCode, 0, "Expected exit code 0 for 'antfarm --help'");
    assert.ok(result.stdout.includes("Antfarm"), "Help output should include 'Antfarm'");
    assert.ok(result.stdout.includes("USAGE:"), "Help output should include 'USAGE:'");
    assert.ok(result.stdout.includes("COMMANDS:"), "Help output should include 'COMMANDS:'");
  });

  it("should show help and exit with code 0 when 'antfarm -h' is run", () => {
    const result = runCli(["-h"]);
    assert.strictEqual(result.exitCode, 0, "Expected exit code 0 for 'antfarm -h'");
    assert.ok(result.stdout.includes("Antfarm"), "Help output should include 'Antfarm'");
    assert.ok(result.stdout.includes("USAGE:"), "Help output should include 'USAGE:'");
    assert.ok(result.stdout.includes("COMMANDS:"), "Help output should include 'COMMANDS:'");
  });

  it("should show help and exit with code 1 when 'antfarm' is run with no args", () => {
    const result = runCli([]);
    assert.strictEqual(result.exitCode, 1, "Expected exit code 1 for 'antfarm' with no args");
    assert.ok(result.stdout.includes("Antfarm"), "Help output should include 'Antfarm'");
    assert.ok(result.stdout.includes("USAGE:"), "Help output should include 'USAGE:'");
    assert.ok(result.stdout.includes("COMMANDS:"), "Help output should include 'COMMANDS:'");
  });

  it("help output should include common commands", () => {
    const result = runCli(["help"]);
    assert.ok(result.stdout.includes("install"), "Help should mention 'install' command");
    assert.ok(result.stdout.includes("workflow"), "Help should mention 'workflow' command");
    assert.ok(result.stdout.includes("dashboard"), "Help should mention 'dashboard' command");
    assert.ok(result.stdout.includes("medic"), "Help should mention 'medic' command");
    assert.ok(result.stdout.includes("logs"), "Help should mention 'logs' command");
    assert.ok(result.stdout.includes("version"), "Help should mention 'version' command");
  });

  it("help output should include common workflows section", () => {
    const result = runCli(["--help"]);
    assert.ok(result.stdout.includes("COMMON WORKFLOWS:"), "Help should include 'COMMON WORKFLOWS:' section");
    assert.ok(result.stdout.includes("Get started:"), "Help should include 'Get started:' section");
    assert.ok(result.stdout.includes("Monitor workflow:"), "Help should include 'Monitor workflow:' section");
  });
});
