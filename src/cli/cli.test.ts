import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const cliPath = join(__dirname, "..", "..", "dist", "cli", "cli.js");

function readCliOutput(): string {
  try {
    return execFileSync("node", [cliPath], { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] });
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string };
    return `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
}

describe("workflow stop CLI", () => {
  it("help text includes 'workflow stop' command", () => {
    // Running with no args prints usage to stdout and exits with code 1
    const output = readCliOutput();
    assert.ok(output.includes("workflow stop"), "Help text should include 'workflow stop'");
    assert.ok(output.includes("Stop/cancel a running workflow"), "Help text should include stop description");
  });

  it("'workflow stop' appears after 'workflow resume' in help text", () => {
    const output = readCliOutput();
    const resumeIndex = output.indexOf("workflow resume");
    const stopIndex = output.indexOf("workflow stop");
    assert.ok(resumeIndex !== -1, "Help text should include 'workflow resume'");
    assert.ok(stopIndex !== -1, "Help text should include 'workflow stop'");
    assert.ok(stopIndex > resumeIndex, "'workflow stop' should appear after 'workflow resume'");
  });

  it("'workflow stop' with no run-id prints error and exits with code 1", () => {
    try {
      execFileSync("node", [cliPath, "workflow", "stop"], {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      });
      assert.fail("Should have exited with code 1");
    } catch (err: unknown) {
      const e = err as { status?: number; stderr?: string };
      assert.equal(e.status, 1, "Should exit with code 1");
      assert.ok(
        (e.stderr ?? "").includes("Missing run-id"),
        "Should print 'Missing run-id' to stderr",
      );
    }
  });

  it("'workflow stop' with nonexistent run-id prints error and exits with code 1", () => {
    try {
      execFileSync("node", [cliPath, "workflow", "stop", "nonexistent-run-id-000"], {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      });
      assert.fail("Should have exited with code 1");
    } catch (err: unknown) {
      const e = err as { status?: number; stderr?: string };
      assert.equal(e.status, 1, "Should exit with code 1");
      assert.ok(
        (e.stderr ?? "").length > 0,
        "Should print error to stderr",
      );
    }
  });
});
