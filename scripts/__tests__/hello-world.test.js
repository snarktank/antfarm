import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const scriptPath = join(__dirname, "..", "hello-world.js");

describe("hello-world", () => {
  it("executes without errors", () => {
    assert.doesNotThrow(() => {
      execFileSync("node", [scriptPath], { encoding: "utf8" });
    }, "Script should execute without throwing errors");
  });

  it("output contains 'Hello World!'", () => {
    const output = execFileSync("node", [scriptPath], { encoding: "utf8" });
    assert.ok(
      output.includes("Hello World!"),
      "Output should contain 'Hello World!'"
    );
  });

  it("output contains a valid date/time string", () => {
    const output = execFileSync("node", [scriptPath], { encoding: "utf8" });
    assert.ok(
      output.includes("Current date:"),
      "Output should contain 'Current date:' label"
    );
    
    // Verify that output contains something that looks like a date/time
    // Should have digits, colons, and hyphens typical of ISO-style datetime
    const dateTimePattern = /\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}/;
    assert.ok(
      dateTimePattern.test(output),
      "Output should contain a valid date/time string in format YYYY-MM-DD HH:MM:SS"
    );
  });

  it("output format is consistent (date format verified by regex)", () => {
    const output = execFileSync("node", [scriptPath], { encoding: "utf8" });
    
    // Test the exact expected format: "Hello World! Current date: YYYY-MM-DD HH:MM:SS"
    const formatPattern = /^Hello World! Current date: \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\n$/;
    assert.ok(
      formatPattern.test(output),
      `Output format should match pattern exactly. Got: "${output}"`
    );
  });

  it("date string represents a valid date", () => {
    const output = execFileSync("node", [scriptPath], { encoding: "utf8" });
    
    // Extract the date/time portion
    const match = output.match(/(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/);
    assert.ok(match, "Should find a date/time string in output");
    
    const dateString = match[1].replace(" ", "T");
    const parsedDate = new Date(dateString);
    
    // Verify it's a valid date (not NaN)
    assert.ok(
      !isNaN(parsedDate.getTime()),
      "Extracted date string should be parseable as a valid date"
    );
  });
});
