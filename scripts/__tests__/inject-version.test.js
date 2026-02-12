import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..", "..");
const htmlPath = join(root, "landing", "index.html");
const backupPath = htmlPath + ".bak";
const scriptPath = join(root, "scripts", "inject-version.js");

const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const version = pkg.version;

describe("inject-version", () => {
  beforeEach(() => {
    copyFileSync(htmlPath, backupPath);
  });

  afterEach(() => {
    copyFileSync(backupPath, htmlPath);
  });

  it("replaces {{VERSION}} with the package version", () => {
    // Ensure placeholder exists
    let html = readFileSync(htmlPath, "utf8");
    if (!html.includes("{{VERSION}}")) {
      html = html.replace(
        /(class="version-badge">v)[^<]*/,
        "$1{{VERSION}}"
      );
      writeFileSync(htmlPath, html, "utf8");
    }

    execFileSync("node", [scriptPath], { cwd: root });

    const result = readFileSync(htmlPath, "utf8");
    assert.ok(
      result.includes(`v${version}`),
      `Expected HTML to contain v${version}`
    );
    assert.ok(
      !result.includes("{{VERSION}}"),
      "Placeholder should be replaced"
    );
  });

  it("is idempotent — running twice produces identical output", () => {
    execFileSync("node", [scriptPath], { cwd: root });
    const first = readFileSync(htmlPath, "utf8");

    execFileSync("node", [scriptPath], { cwd: root });
    const second = readFileSync(htmlPath, "utf8");

    assert.equal(first, second, "Output should be identical after two runs");
  });

  it("injects the correct semver from package.json", () => {
    execFileSync("node", [scriptPath], { cwd: root });
    const html = readFileSync(htmlPath, "utf8");
    const match = html.match(/class="version-badge">v([^<]+)</);
    assert.ok(match, "Version badge should exist in HTML");
    assert.equal(match[1], version, "Version should match package.json");
  });
});
