/**
 * Smoke tests for the antfarm CLI.
 * Verifies basic CLI functionality and commands work correctly.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { readFileSync } from "node:fs";

const CLI = path.resolve(import.meta.dirname, "..", "dist", "cli", "cli.js");

// Read package.json to get expected version
const packageJson = JSON.parse(
  readFileSync(path.resolve(import.meta.dirname, "..", "package.json"), "utf-8")
);
const expectedVersion = packageJson.version;

describe("antfarm CLI smoke tests", () => {
  it("should return version number with --version flag", () => {
    const output = execFileSync("node", [CLI, "--version"], { encoding: "utf-8" });
    const version = output.trim();
    // CLI outputs "antfarm v0.5.1" format
    assert.ok(version.includes(expectedVersion), `expected version ${expectedVersion} in output, got ${version}`);
  });

  it("should show usage information with help command", () => {
    let output: string;
    try {
      output = execFileSync("node", [CLI, "help"], { encoding: "utf-8" });
    } catch (e: any) {
      output = e.stdout ?? e.message ?? "";
    }
    // Check for expected commands in help output
    assert.ok(output.includes("antfarm"), "help should mention antfarm");
    assert.ok(output.includes("workflow") || output.includes("step") || output.includes("run"),
      "help should mention available commands");
  });

  it("should show usage information when run without arguments", () => {
    let output: string;
    try {
      output = execFileSync("node", [CLI], { encoding: "utf-8" });
    } catch (e: any) {
      output = e.stdout ?? "";
    }
    // CLI may exit with error code when no args provided, but should still show help
    assert.ok(output.includes("antfarm") || output.includes("usage") || output.includes("help"),
      "no-args output should show usage/help");
  });

  it("should execute without node:sqlite errors (basic runtime check)", () => {
    // This test verifies the CLI can start without crashing on sqlite issues
    let output: string;
    let errorOutput: string = "";
    try {
      output = execFileSync("node", [CLI, "--version"], { encoding: "utf-8" });
    } catch (e: any) {
      output = e.stdout ?? "";
      errorOutput = e.stderr ?? "";
    }
    // Check for common sqlite-related errors
    assert.ok(!errorOutput.includes("node:sqlite"), "should not have node:sqlite errors");
    assert.ok(!output.includes("node:sqlite"), "should not have node:sqlite errors in output");
    assert.ok(!errorOutput.includes("cannot find module"), "should not have module loading errors");
  });
});
