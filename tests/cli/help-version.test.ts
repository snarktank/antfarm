/**
 * Tests for version display in help output (US-009)
 */
import { describe, it } from "node:test";
import assert from "node:assert";
import { execSync } from "node:child_process";
import { getVersion } from "../../dist/cli/version.js";
import { printHelp } from "../../dist/cli/help.js";

describe("Help version display (US-009)", () => {
  it("help output starts with version", () => {
    const output = execSync("node dist/cli/cli.js --help", {
      encoding: "utf-8",
      cwd: process.cwd(),
    });
    
    const lines = output.trim().split("\n");
    const firstLine = lines[0];
    
    // First line should be "Antfarm v<version>"
    assert.match(firstLine, /^Antfarm v\d+\.\d+\.\d+/, "Help should start with version");
  });

  it("version in help matches version command", () => {
    const helpOutput = execSync("node dist/cli/cli.js --help", {
      encoding: "utf-8",
      cwd: process.cwd(),
    });
    
    const versionOutput = execSync("node dist/cli/cli.js version", {
      encoding: "utf-8",
      cwd: process.cwd(),
    });
    
    const helpVersion = helpOutput.match(/Antfarm v([\d.]+)/)?.[1];
    const versionVersion = versionOutput.match(/antfarm v([\d.]+)/)?.[1];
    
    assert.strictEqual(helpVersion, versionVersion, "Version in help should match version command");
  });

  it("getVersion() returns a valid version string", () => {
    const version = getVersion();
    
    // Should be either a semver version or "unknown"
    assert.ok(
      version === "unknown" || /^\d+\.\d+\.\d+/.test(version),
      "getVersion should return valid version or 'unknown'"
    );
  });

  it("printHelp includes version at the very top", () => {
    const mockWrites: string[] = [];
    const originalWrite = process.stdout.write;
    
    // @ts-expect-error - mocking stdout
    process.stdout.write = (str: string) => {
      mockWrites.push(str);
      return true;
    };
    
    try {
      printHelp();
      
      // First write should contain version
      assert.match(
        mockWrites[0],
        /^Antfarm v\d+/,
        "First output should start with Antfarm v<version>"
      );
    } finally {
      process.stdout.write = originalWrite;
    }
  });

  it("version command still works", () => {
    const output = execSync("node dist/cli/cli.js version", {
      encoding: "utf-8",
      cwd: process.cwd(),
    });
    
    assert.match(output, /antfarm v\d+\.\d+\.\d+/, "Version command should display version");
  });

  it("help output contains version before QUICK START", () => {
    const output = execSync("node dist/cli/cli.js --help", {
      encoding: "utf-8",
      cwd: process.cwd(),
    });
    
    const versionMatch = output.match(/Antfarm v[\d.]+/);
    const quickStartMatch = output.match(/QUICK START:/);
    
    assert.ok(versionMatch, "Help should contain version");
    assert.ok(quickStartMatch, "Help should contain QUICK START");
    
    // Version should appear before QUICK START
    const versionIndex = versionMatch!.index!;
    const quickStartIndex = quickStartMatch!.index!;
    
    assert.ok(versionIndex < quickStartIndex, "Version should appear before QUICK START");
  });
});
