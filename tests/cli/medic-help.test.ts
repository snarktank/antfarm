import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";

const CLI = "node dist/cli/cli.js";

describe("medic help command", () => {
  it("should exit with code 0 when running 'antfarm medic help'", () => {
    try {
      execSync(`${CLI} medic help`, { stdio: "pipe" });
    } catch (err: any) {
      assert.fail(`Expected exit code 0, got ${err.status}`);
    }
  });

  it("should exit with code 0 when running 'antfarm medic --help'", () => {
    try {
      execSync(`${CLI} medic --help`, { stdio: "pipe" });
    } catch (err: any) {
      assert.fail(`Expected exit code 0, got ${err.status}`);
    }
  });

  it("should include MEDIC header", () => {
    const output = execSync(`${CLI} medic help`, { encoding: "utf-8" });
    assert.ok(output.includes("MEDIC"), "Help should include MEDIC header");
  });

  it("should explain medic purpose (watchdog/health checks)", () => {
    const output = execSync(`${CLI} medic help`, { encoding: "utf-8" });
    assert.ok(output.includes("watchdog"), "Help should mention watchdog");
    assert.ok(output.includes("health") || output.includes("monitors"), "Help should mention health monitoring");
  });

  it("should document install subcommand", () => {
    const output = execSync(`${CLI} medic help`, { encoding: "utf-8" });
    assert.ok(output.includes("install"), "Help should document install subcommand");
    assert.ok(output.includes("cron"), "Help should mention cron installation");
  });

  it("should document uninstall subcommand", () => {
    const output = execSync(`${CLI} medic help`, { encoding: "utf-8" });
    assert.ok(output.includes("uninstall"), "Help should document uninstall subcommand");
  });

  it("should document run subcommand", () => {
    const output = execSync(`${CLI} medic help`, { encoding: "utf-8" });
    assert.ok(output.includes("run"), "Help should document run subcommand");
    assert.ok(output.includes("manual") || output.includes("now"), "Help should mention manual/immediate execution");
  });

  it("should document status subcommand", () => {
    const output = execSync(`${CLI} medic help`, { encoding: "utf-8" });
    assert.ok(output.includes("status"), "Help should document status subcommand");
  });

  it("should document log subcommand", () => {
    const output = execSync(`${CLI} medic help`, { encoding: "utf-8" });
    assert.ok(output.includes("log"), "Help should document log subcommand");
    assert.ok(output.includes("history") || output.includes("recent"), "Help should mention check history");
  });

  it("should include EXAMPLES section", () => {
    const output = execSync(`${CLI} medic help`, { encoding: "utf-8" });
    assert.ok(output.includes("EXAMPLES"), "Help should include examples section");
  });

  it("should include example for installing medic", () => {
    const output = execSync(`${CLI} medic help`, { encoding: "utf-8" });
    assert.ok(output.includes("antfarm medic install"), "Help should include install example");
  });

  it("should include example for viewing health status", () => {
    const output = execSync(`${CLI} medic help`, { encoding: "utf-8" });
    const hasRunExample = output.includes("antfarm medic run");
    const hasStatusExample = output.includes("antfarm medic status");
    assert.ok(hasRunExample || hasStatusExample, "Help should include health check example");
  });
});
