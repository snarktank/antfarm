/**
 * Tests for the hello-world.js script.
 * Verifies that the script outputs "Hello World!" with current date and time.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";

const SCRIPT = path.resolve(import.meta.dirname, "..", "scripts", "hello-world.js");

describe("hello-world.js script", () => {
  it("prints 'Hello World!' followed by current date", () => {
    const output = execFileSync("node", [SCRIPT], { encoding: "utf-8" });
    assert.ok(output.includes("Hello World!"), "should include 'Hello World!'");
    assert.ok(output.includes("Current date:"), "should include 'Current date:'");
  });

  it("output includes date in YYYY-MM-DD format", () => {
    const output = execFileSync("node", [SCRIPT], { encoding: "utf-8" });
    // Match YYYY-MM-DD pattern
    const datePattern = /\d{4}-\d{2}-\d{2}/;
    assert.ok(datePattern.test(output), `output should contain date in YYYY-MM-DD format, got: "${output}"`);
  });

  it("output includes time in HH:MM:SS format", () => {
    const output = execFileSync("node", [SCRIPT], { encoding: "utf-8" });
    // Match HH:MM:SS pattern
    const timePattern = /\d{2}:\d{2}:\d{2}/;
    assert.ok(timePattern.test(output), `output should contain time in HH:MM:SS format, got: "${output}"`);
  });

  it("script is executable", async () => {
    const { statSync } = await import("node:fs");
    const stats = statSync(SCRIPT);
    const isExecutable = !!(stats.mode & 0o111);
    assert.ok(isExecutable, "script should have executable permissions");
  });
});
