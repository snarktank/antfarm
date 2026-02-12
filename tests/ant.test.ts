/**
 * Tests for the `antfarm ant` easter egg command.
 * Verifies CLI integration and output format.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";

const currentDir = import.meta.dirname;
// If running from dist/tests, project root is two levels up.
// If running from tests, project root is one level up.
const projectRoot = currentDir.endsWith(path.join("dist", "tests"))
  ? path.resolve(currentDir, "..", "..")
  : path.resolve(currentDir, "..");

const CLI = path.join(projectRoot, "dist", "cli", "cli.js");

describe("antfarm ant (CLI)", () => {
  it("prints ASCII art containing ant body characters", () => {
    const output = execFileSync("node", [CLI, "ant"], { encoding: "utf-8" });
    assert.ok(output.includes("---"), "should have dashes for ant body");
    assert.ok(output.includes("\\"), "should have backslash characters");
    assert.ok(output.includes("(___A___)"), "should have ant feet");
  });

  it("prints a quote on the last line", () => {
    const output = execFileSync("node", [CLI, "ant"], { encoding: "utf-8" });
    const lines = output.trim().split("\n");
    const lastLine = lines[lines.length - 1];
    assert.ok(lastLine.length > 10, `expected a quote, got: "${lastLine}"`);
  });

  it("ant command is hidden from help", () => {
    let helpOutput: string;
    try {
      helpOutput = execFileSync("node", [CLI, "help"], { encoding: "utf-8" });
    } catch (e: any) {
      helpOutput = e.stdout ?? "";
    }
    assert.ok(!helpOutput.includes("antfarm ant"), "ant should not appear in help");
  });
});
