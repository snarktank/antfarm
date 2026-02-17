import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const cliPath = join(__dirname, "..", "dist", "cli", "cli.js");

describe("hello-world", () => {
  it("CLI can be invoked with --version", () => {
    const output = execFileSync("node", [cliPath, "--version"], {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    assert.ok(output.length > 0, "CLI should produce output");
  });

  it("CLI output contains antfarm version string", () => {
    const output = execFileSync("node", [cliPath, "--version"], {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    assert.ok(output.includes("antfarm"), "Output should contain 'antfarm'");
    assert.ok(output.includes("v"), "Output should contain version (vX.X.X)");
  });
});
