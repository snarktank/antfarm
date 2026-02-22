/**
 * Tests for US-012: Update existing CLI tests for new help system
 * Verifies that existing CLI tests have been updated to work with the new help system
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { readFileSync } from "node:fs";

const CLI = path.resolve(import.meta.dirname, "..", "..", "dist", "cli", "cli.js");
const CLI_TEST_SOURCE = path.resolve(import.meta.dirname, "..", "..", "src", "cli", "cli.test.ts");
const ANT_TEST_SOURCE = path.resolve(import.meta.dirname, "..", "ant.test.ts");

describe("Help System Migration (US-012)", () => {
  describe("cli.test.ts compatibility", () => {
    it("cli.test.ts tests use new help format (not 'workflow stop' but 'stop')", () => {
      const source = readFileSync(CLI_TEST_SOURCE, "utf-8");
      
      // Should test for "stop" subcommand, not "workflow stop"
      assert.ok(
        source.includes('output.includes("stop")'),
        "cli.test.ts should check for 'stop' subcommand in new help format"
      );
      
      // Should still check for the description
      assert.ok(
        source.includes("Stop/cancel a running workflow"),
        "cli.test.ts should verify stop command description"
      );
    });

    it("cli.test.ts updated to work with new help structure", () => {
      const source = readFileSync(CLI_TEST_SOURCE, "utf-8");
      
      // Verify test descriptions reflect the new help system
      assert.ok(
        source.includes("help text includes workflow stop command and description"),
        "Test description should be updated for new help system"
      );
      
      assert.ok(
        source.includes("workflow stop appears after resume in help text"),
        "Test description should reflect new help structure"
      );
    });

    it("help output contains 'stop' under Workflow Management section", () => {
      let output: string;
      try {
        output = execFileSync("node", [CLI], { encoding: "utf-8" });
      } catch (err: any) {
        output = (err.stdout ?? "") + (err.stderr ?? "");
      }
      
      // Verify the new help structure
      assert.ok(output.includes("Workflow Management"), "Help should have Workflow Management section");
      assert.ok(output.includes("stop"), "Help should list 'stop' subcommand");
      assert.ok(output.includes("Stop/cancel a running workflow"), "Help should include stop description");
      
      // Verify stop appears after resume
      const resumeIdx = output.indexOf("resume");
      const stopIdx = output.indexOf("stop");
      assert.ok(stopIdx > resumeIdx, "stop should appear after resume");
    });
  });

  describe("ant.test.ts compatibility", () => {
    it("ant.test.ts uses 'help' command correctly", () => {
      const source = readFileSync(ANT_TEST_SOURCE, "utf-8");
      
      // Should use the new help command
      assert.ok(
        source.includes('[CLI, "help"]'),
        "ant.test.ts should use 'antfarm help' command"
      );
    });

    it("ant.test.ts test structure compatible with new help system", () => {
      const source = readFileSync(ANT_TEST_SOURCE, "utf-8");
      
      // Should have the test for hidden help
      assert.ok(
        source.includes("ant command is hidden from help"),
        "ant.test.ts should verify ant is hidden from help"
      );
      
      // Should handle help command error handling
      assert.ok(
        source.includes("catch"),
        "ant.test.ts should handle help command properly"
      );
    });

    it("ant easter egg remains hidden in help output", () => {
      let helpOutput: string;
      try {
        helpOutput = execFileSync("node", [CLI, "help"], { encoding: "utf-8" });
      } catch (e: any) {
        helpOutput = e.stdout ?? "";
      }
      
      assert.ok(!helpOutput.includes("antfarm ant"), "'ant' command should not appear in help");
      assert.ok(!helpOutput.includes("ASCII art"), "'ant' description should not appear in help");
    });
  });

  describe("new help system structure", () => {
    it("help output includes version at the top", () => {
      let output: string;
      try {
        output = execFileSync("node", [CLI], { encoding: "utf-8" });
      } catch (err: any) {
        output = (err.stdout ?? "") + (err.stderr ?? "");
      }
      
      assert.ok(output.startsWith("Antfarm v"), "Help should start with version");
    });

    it("help output includes QUICK START section", () => {
      let output: string;
      try {
        output = execFileSync("node", [CLI], { encoding: "utf-8" });
      } catch (err: any) {
        output = (err.stdout ?? "") + (err.stderr ?? "");
      }
      
      assert.ok(output.includes("QUICK START"), "Help should include QUICK START section");
    });

    it("help output includes all workflow subcommands", () => {
      let output: string;
      try {
        output = execFileSync("node", [CLI], { encoding: "utf-8" });
      } catch (err: any) {
        output = (err.stdout ?? "") + (err.stderr ?? "");
      }
      
      const subcommands = ["list", "install", "uninstall", "run", "status", "runs", "resume", "stop"];
      for (const cmd of subcommands) {
        assert.ok(output.includes(cmd), `Help should include '${cmd}' subcommand`);
      }
    });

    it("running CLI with no args exits with code 1 and shows help", () => {
      try {
        execFileSync("node", [CLI], { encoding: "utf-8" });
        assert.fail("Should have exited with code 1");
      } catch (err: any) {
        assert.equal(err.status, 1, "Should exit with code 1 when no args provided");
        const output = (err.stdout ?? "") + (err.stderr ?? "");
        assert.ok(output.includes("USAGE"), "Should show help when no args provided");
      }
    });

    it("'antfarm help' exits with code 0", () => {
      const output = execFileSync("node", [CLI, "help"], { encoding: "utf-8" });
      assert.ok(output.includes("USAGE"), "Should show help with 'help' command");
      // If we get here, exit code was 0 (no exception thrown)
    });
  });

  describe("test assertion updates", () => {
    it("cli.test.ts assertions match new help structure", () => {
      const source = readFileSync(CLI_TEST_SOURCE, "utf-8");
      
      // Verify assertions check for subcommand format
      assert.ok(
        source.includes('"stop"'),
        "Should check for 'stop' in new subcommand format"
      );
      
      assert.ok(
        source.includes('"resume"'),
        "Should check for 'resume' in new subcommand format"
      );
    });

    it("help command tests verify correct exit codes", () => {
      // Test no-args behavior (exit 1, shows help)
      try {
        execFileSync("node", [CLI], { encoding: "utf-8" });
        assert.fail("Should exit with code 1");
      } catch (err: any) {
        assert.equal(err.status, 1);
      }

      // Test explicit help (exit 0)
      execFileSync("node", [CLI, "help"], { encoding: "utf-8" });
      // If we get here, exit code was 0
    });
  });
});
