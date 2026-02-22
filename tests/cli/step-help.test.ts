import { describe, it } from "node:test";
import assert from "node:assert";
import { execSync } from "node:child_process";

describe("Step help", () => {
  it("should handle 'antfarm step help' and exit with code 0", () => {
    const result = execSync("node dist/cli/cli.js step help", { encoding: "utf-8" });
    assert.ok(result.includes("STEP"));
  });

  it("should handle 'antfarm step --help' and exit with code 0", () => {
    const result = execSync("node dist/cli/cli.js step --help", { encoding: "utf-8" });
    assert.ok(result.includes("STEP"));
  });

  it("should include NOTE about internal/agent use", () => {
    const result = execSync("node dist/cli/cli.js step help", { encoding: "utf-8" });
    assert.ok(result.includes("NOTE"));
    assert.ok(result.includes("internal agent use") || result.includes("primarily for internal agent use"));
  });

  it("should document peek subcommand", () => {
    const result = execSync("node dist/cli/cli.js step help", { encoding: "utf-8" });
    assert.ok(result.includes("peek"));
    assert.ok(result.includes("pending work"));
  });

  it("should document claim subcommand", () => {
    const result = execSync("node dist/cli/cli.js step help", { encoding: "utf-8" });
    assert.ok(result.includes("claim"));
  });

  it("should document complete subcommand", () => {
    const result = execSync("node dist/cli/cli.js step help", { encoding: "utf-8" });
    assert.ok(result.includes("complete"));
  });

  it("should document fail subcommand", () => {
    const result = execSync("node dist/cli/cli.js step help", { encoding: "utf-8" });
    assert.ok(result.includes("fail"));
  });

  it("should document stories subcommand", () => {
    const result = execSync("node dist/cli/cli.js step help", { encoding: "utf-8" });
    assert.ok(result.includes("stories"));
  });

  it("should include EXAMPLES section", () => {
    const result = execSync("node dist/cli/cli.js step help", { encoding: "utf-8" });
    assert.ok(result.includes("EXAMPLES"));
  });

  it("should include step workflow lifecycle examples", () => {
    const result = execSync("node dist/cli/cli.js step help", { encoding: "utf-8" });
    assert.ok(result.includes("lifecycle") || result.includes("workflow"));
    assert.ok(result.includes("step peek"));
    assert.ok(result.includes("step claim"));
    assert.ok(result.includes("step complete"));
  });
});
