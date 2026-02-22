/**
 * Comprehensive CLI help system integration tests
 * Tests all help command variants and subcommand help
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const cliPath = join(__dirname, "..", "dist", "cli", "cli.js");

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

describe("CLI Help System - Comprehensive Tests", () => {
  describe("Global Help Commands", () => {
    it("should show help with 'antfarm help' and exit with code 0", () => {
      const result = runCli(["help"]);
      assert.strictEqual(result.exitCode, 0, "Expected exit code 0 for 'antfarm help'");
      assert.ok(result.stdout.includes("Antfarm"), "Help output should include 'Antfarm'");
      assert.ok(result.stdout.includes("USAGE:"), "Help output should include 'USAGE:' section");
      assert.ok(result.stdout.includes("COMMANDS:"), "Help output should include 'COMMANDS:' section");
    });

    it("should show help with 'antfarm --help' and exit with code 0", () => {
      const result = runCli(["--help"]);
      assert.strictEqual(result.exitCode, 0, "Expected exit code 0 for 'antfarm --help'");
      assert.ok(result.stdout.includes("Antfarm"), "Help output should include 'Antfarm'");
      assert.ok(result.stdout.includes("USAGE:"), "Help output should include 'USAGE:' section");
      assert.ok(result.stdout.includes("COMMANDS:"), "Help output should include 'COMMANDS:' section");
    });

    it("should show help with 'antfarm -h' and exit with code 0", () => {
      const result = runCli(["-h"]);
      assert.strictEqual(result.exitCode, 0, "Expected exit code 0 for 'antfarm -h'");
      assert.ok(result.stdout.includes("Antfarm"), "Help output should include 'Antfarm'");
      assert.ok(result.stdout.includes("USAGE:"), "Help output should include 'USAGE:' section");
      assert.ok(result.stdout.includes("COMMANDS:"), "Help output should include 'COMMANDS:' section");
    });

    it("should show help with no args and exit with code 1", () => {
      const result = runCli([]);
      assert.strictEqual(result.exitCode, 1, "Expected exit code 1 for 'antfarm' with no args");
      assert.ok(result.stdout.includes("Antfarm"), "Help output should include 'Antfarm'");
      assert.ok(result.stdout.includes("USAGE:"), "Help output should include 'USAGE:' section");
    });

    it("global help should include all expected sections", () => {
      const result = runCli(["help"]);
      assert.ok(result.stdout.includes("QUICK START:"), "Help should include 'QUICK START:' section");
      assert.ok(result.stdout.includes("USAGE:"), "Help should include 'USAGE:' section");
      assert.ok(result.stdout.includes("COMMANDS:"), "Help should include 'COMMANDS:' section");
      assert.ok(result.stdout.includes("COMMON WORKFLOWS:"), "Help should include 'COMMON WORKFLOWS:' section");
    });

    it("global help should list all main commands", () => {
      const result = runCli(["help"]);
      const commands = ["install", "uninstall", "workflow", "dashboard", "step", "medic", "logs", "version", "update"];
      
      for (const command of commands) {
        assert.ok(result.stdout.includes(command), `Help should include '${command}' command`);
      }
    });

    it("global help should include version information", () => {
      const result = runCli(["help"]);
      assert.ok(result.stdout.includes("Antfarm v"), "Help should include version number");
    });
  });

  describe("Workflow Subcommand Help", () => {
    it("should show workflow help with 'workflow help' and exit with code 0", () => {
      const result = runCli(["workflow", "help"]);
      assert.strictEqual(result.exitCode, 0, "Expected exit code 0 for 'workflow help'");
      assert.ok(result.stdout.includes("WORKFLOW"), "Help should include 'WORKFLOW' header");
      assert.ok(result.stdout.includes("Manage workflows"), "Help should include workflow description");
    });

    it("should show workflow help with 'workflow --help' and exit with code 0", () => {
      const result = runCli(["workflow", "--help"]);
      assert.strictEqual(result.exitCode, 0, "Expected exit code 0 for 'workflow --help'");
      assert.ok(result.stdout.includes("WORKFLOW"), "Help should include 'WORKFLOW' header");
    });

    it("workflow help should list all subcommands", () => {
      const result = runCli(["workflow", "help"]);
      const subcommands = ["list", "install", "uninstall", "run", "status", "runs", "resume", "stop", "ensure-crons"];
      
      for (const subcommand of subcommands) {
        assert.ok(result.stdout.includes(subcommand), `Workflow help should include '${subcommand}' subcommand`);
      }
    });

    it("workflow help should include SUBCOMMANDS section", () => {
      const result = runCli(["workflow", "help"]);
      assert.ok(result.stdout.includes("SUBCOMMANDS:"), "Workflow help should include 'SUBCOMMANDS:' section");
    });

    it("workflow help should include EXAMPLES section", () => {
      const result = runCli(["workflow", "help"]);
      assert.ok(result.stdout.includes("EXAMPLES:"), "Workflow help should include 'EXAMPLES:' section");
    });

    it("workflow help should include usage examples", () => {
      const result = runCli(["workflow", "help"]);
      assert.ok(result.stdout.includes("antfarm workflow run"), "Workflow help should include run example");
      assert.ok(result.stdout.includes("antfarm workflow status"), "Workflow help should include status example");
    });
  });

  describe("Dashboard Subcommand Help", () => {
    it("should show dashboard help with 'dashboard help' and exit with code 0", () => {
      const result = runCli(["dashboard", "help"]);
      assert.strictEqual(result.exitCode, 0, "Expected exit code 0 for 'dashboard help'");
      assert.ok(result.stdout.includes("DASHBOARD"), "Help should include 'DASHBOARD' header");
    });

    it("should show dashboard help with 'dashboard --help' and exit with code 0", () => {
      const result = runCli(["dashboard", "--help"]);
      assert.strictEqual(result.exitCode, 0, "Expected exit code 0 for 'dashboard --help'");
      assert.ok(result.stdout.includes("DASHBOARD"), "Help should include 'DASHBOARD' header");
    });

    it("dashboard help should list all subcommands", () => {
      const result = runCli(["dashboard", "help"]);
      const subcommands = ["start", "stop", "status"];
      
      for (const subcommand of subcommands) {
        assert.ok(result.stdout.includes(subcommand), `Dashboard help should include '${subcommand}' subcommand`);
      }
    });

    it("dashboard help should include EXAMPLES section", () => {
      const result = runCli(["dashboard", "help"]);
      assert.ok(result.stdout.includes("EXAMPLES:"), "Dashboard help should include 'EXAMPLES:' section");
    });

    it("dashboard help should document --port option", () => {
      const result = runCli(["dashboard", "help"]);
      assert.ok(result.stdout.includes("--port"), "Dashboard help should document --port option");
    });
  });

  describe("Step Subcommand Help", () => {
    it("should show step help with 'step help' and exit with code 0", () => {
      const result = runCli(["step", "help"]);
      assert.strictEqual(result.exitCode, 0, "Expected exit code 0 for 'step help'");
      assert.ok(result.stdout.includes("STEP"), "Help should include 'STEP' header");
    });

    it("should show step help with 'step --help' and exit with code 0", () => {
      const result = runCli(["step", "--help"]);
      assert.strictEqual(result.exitCode, 0, "Expected exit code 0 for 'step --help'");
      assert.ok(result.stdout.includes("STEP"), "Help should include 'STEP' header");
    });

    it("step help should list all subcommands", () => {
      const result = runCli(["step", "help"]);
      const subcommands = ["peek", "claim", "complete", "fail", "stories"];
      
      for (const subcommand of subcommands) {
        assert.ok(result.stdout.includes(subcommand), `Step help should include '${subcommand}' subcommand`);
      }
    });

    it("step help should include note about internal/agent use", () => {
      const result = runCli(["step", "help"]);
      assert.ok(result.stdout.includes("NOTE:") || result.stdout.includes("internal") || result.stdout.includes("agent"), 
        "Step help should include note about internal/agent use");
    });

    it("step help should include EXAMPLES section", () => {
      const result = runCli(["step", "help"]);
      assert.ok(result.stdout.includes("EXAMPLES"), "Step help should include EXAMPLES section");
    });
  });

  describe("Medic Subcommand Help", () => {
    it("should show medic help with 'medic help' and exit with code 0", () => {
      const result = runCli(["medic", "help"]);
      assert.strictEqual(result.exitCode, 0, "Expected exit code 0 for 'medic help'");
      assert.ok(result.stdout.includes("MEDIC"), "Help should include 'MEDIC' header");
    });

    it("should show medic help with 'medic --help' and exit with code 0", () => {
      const result = runCli(["medic", "--help"]);
      assert.strictEqual(result.exitCode, 0, "Expected exit code 0 for 'medic --help'");
      assert.ok(result.stdout.includes("MEDIC"), "Help should include 'MEDIC' header");
    });

    it("medic help should list all subcommands", () => {
      const result = runCli(["medic", "help"]);
      const subcommands = ["install", "uninstall", "run", "status", "log"];
      
      for (const subcommand of subcommands) {
        assert.ok(result.stdout.includes(subcommand), `Medic help should include '${subcommand}' subcommand`);
      }
    });

    it("medic help should explain watchdog/health monitoring purpose", () => {
      const result = runCli(["medic", "help"]);
      assert.ok(result.stdout.includes("watchdog") || result.stdout.includes("health"), 
        "Medic help should explain its watchdog/health monitoring purpose");
    });

    it("medic help should include EXAMPLES section", () => {
      const result = runCli(["medic", "help"]);
      assert.ok(result.stdout.includes("EXAMPLES:"), "Medic help should include 'EXAMPLES:' section");
    });
  });

  describe("Logs Command Help", () => {
    it("should show logs help with 'logs help' and exit with code 0", () => {
      const result = runCli(["logs", "help"]);
      assert.strictEqual(result.exitCode, 0, "Expected exit code 0 for 'logs help'");
      assert.ok(result.stdout.includes("LOGS"), "Help should include 'LOGS' header");
    });

    it("should show logs help with 'logs --help' and exit with code 0", () => {
      const result = runCli(["logs", "--help"]);
      assert.strictEqual(result.exitCode, 0, "Expected exit code 0 for 'logs --help'");
      assert.ok(result.stdout.includes("LOGS"), "Help should include 'LOGS' header");
    });

    it("logs help should document all command variants", () => {
      const result = runCli(["logs", "help"]);
      assert.ok(result.stdout.includes("logs [lines]"), "Logs help should document 'logs [lines]' variant");
      assert.ok(result.stdout.includes("logs <run-id>") || result.stdout.includes("run-id"), 
        "Logs help should document 'logs <run-id>' variant");
      assert.ok(result.stdout.includes("logs #") || result.stdout.includes("#<number>") || result.stdout.includes("run number"), 
        "Logs help should document '#<number>' variant");
    });

    it("logs help should include EXAMPLES section", () => {
      const result = runCli(["logs", "help"]);
      assert.ok(result.stdout.includes("EXAMPLES:"), "Logs help should include 'EXAMPLES:' section");
    });

    it("logs help should include VARIANTS section", () => {
      const result = runCli(["logs", "help"]);
      assert.ok(result.stdout.includes("VARIANTS:") || result.stdout.includes("variant"), 
        "Logs help should include information about command variants");
    });
  });

  describe("Help Output Quality", () => {
    it("all help commands should produce non-empty output", () => {
      const commands = [
        ["help"],
        ["--help"],
        ["-h"],
        ["workflow", "help"],
        ["dashboard", "help"],
        ["step", "help"],
        ["medic", "help"],
        ["logs", "help"],
      ];

      for (const args of commands) {
        const result = runCli(args);
        assert.ok(result.stdout.length > 100, 
          `Help output for '${args.join(" ")}' should be substantial (>100 chars), got ${result.stdout.length} chars`);
      }
    });

    it("help output should be consistently formatted across all commands", () => {
      const commands = [
        ["workflow", "help"],
        ["dashboard", "help"],
        ["step", "help"],
        ["medic", "help"],
        ["logs", "help"],
      ];

      for (const args of commands) {
        const result = runCli(args);
        // All subcommand help should have consistent sections
        assert.ok(result.stdout.includes("USAGE:"), `${args.join(" ")} should include USAGE section`);
        assert.ok(result.stdout.includes("EXAMPLES"), `${args.join(" ")} should include EXAMPLES section`);
      }
    });

    it("all help text should use proper capitalization for section headers", () => {
      const result = runCli(["help"]);
      const sections = ["QUICK START:", "USAGE:", "COMMANDS:", "COMMON WORKFLOWS:"];
      
      for (const section of sections) {
        assert.ok(result.stdout.includes(section), `Help should include properly capitalized '${section}' section`);
      }
    });
  });

  describe("Exit Code Consistency", () => {
    it("all explicit help commands should exit with code 0", () => {
      const helpCommands = [
        ["help"],
        ["--help"],
        ["-h"],
        ["workflow", "help"],
        ["workflow", "--help"],
        ["dashboard", "help"],
        ["dashboard", "--help"],
        ["step", "help"],
        ["step", "--help"],
        ["medic", "help"],
        ["medic", "--help"],
        ["logs", "help"],
        ["logs", "--help"],
      ];

      for (const args of helpCommands) {
        const result = runCli(args);
        assert.strictEqual(result.exitCode, 0, 
          `Command '${args.join(" ")}' should exit with code 0, got ${result.exitCode}`);
      }
    });

    it("running antfarm with no arguments should exit with code 1", () => {
      const result = runCli([]);
      assert.strictEqual(result.exitCode, 1, "Running 'antfarm' with no args should exit with code 1");
    });
  });
});
