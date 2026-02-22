import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";

const CLI = "node dist/cli/cli.js";

describe("logs help command", () => {
  it("should exit with code 0 when running 'antfarm logs help'", () => {
    try {
      execSync(`${CLI} logs help`, { stdio: "pipe" });
    } catch (err: any) {
      assert.fail(`Expected exit code 0, got ${err.status}`);
    }
  });

  it("should exit with code 0 when running 'antfarm logs --help'", () => {
    try {
      execSync(`${CLI} logs --help`, { stdio: "pipe" });
    } catch (err: any) {
      assert.fail(`Expected exit code 0, got ${err.status}`);
    }
  });

  it("should include LOGS header", () => {
    const output = execSync(`${CLI} logs help`, { encoding: "utf-8" });
    assert.ok(output.includes("LOGS"), "Help should include LOGS header");
  });

  it("should document logs [lines] variant", () => {
    const output = execSync(`${CLI} logs help`, { encoding: "utf-8" });
    assert.ok(output.includes("logs [lines]"), "Help should document logs [lines] variant");
    assert.ok(output.includes("antfarm logs 100") || output.includes("100"), "Help should include example with line count");
  });

  it("should document logs <run-id> variant", () => {
    const output = execSync(`${CLI} logs help`, { encoding: "utf-8" });
    assert.ok(output.includes("logs <run-id>") || output.includes("run-id"), "Help should document logs <run-id> variant");
    assert.ok(output.includes("abc123") || output.includes("specific run"), "Help should include run ID example");
  });

  it("should document logs #<run-number> variant", () => {
    const output = execSync(`${CLI} logs help`, { encoding: "utf-8" });
    assert.ok(output.includes("#") && (output.includes("number") || output.includes("#3")), "Help should document logs #<number> variant");
  });

  it("should include EXAMPLES section", () => {
    const output = execSync(`${CLI} logs help`, { encoding: "utf-8" });
    assert.ok(output.includes("EXAMPLES"), "Help should include examples section");
  });

  it("should include example for viewing recent activity", () => {
    const output = execSync(`${CLI} logs help`, { encoding: "utf-8" });
    assert.ok(output.includes("antfarm logs") && output.includes("recent"), "Help should include recent activity example");
  });

  it("should include example for viewing run-specific logs", () => {
    const output = execSync(`${CLI} logs help`, { encoding: "utf-8" });
    const hasRunIdExample = output.includes("abc123");
    const hasRunNumberExample = output.includes("#3");
    assert.ok(hasRunIdExample || hasRunNumberExample, "Help should include run-specific logs example");
  });

  it("should include VARIANTS section", () => {
    const output = execSync(`${CLI} logs help`, { encoding: "utf-8" });
    assert.ok(output.includes("VARIANTS"), "Help should include variants section explaining all usage forms");
  });
});
