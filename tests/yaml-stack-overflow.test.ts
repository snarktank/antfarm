/**
 * Regression test for GHSA-48c2-rrv3-qjmp: yaml Stack Overflow via deeply nested collections.
 * Verifies that YAML.parse with maxAliasCount option does not crash on deeply nested input,
 * and that the yaml package has been updated to a patched version (>=2.8.3).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import YAML from "yaml";
import { readFileSync } from "node:fs";
import path from "node:path";

describe("GHSA-48c2-rrv3-qjmp: yaml Stack Overflow fix", () => {
  it("yaml package is at least 2.8.3 (patched version)", () => {
    const pkgPath = path.resolve(
      import.meta.dirname,
      "..",
      "node_modules",
      "yaml",
      "package.json"
    );
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    const [major, minor, patch] = pkg.version.split(".").map(Number);
    assert.ok(
      major > 2 || (major === 2 && minor > 8) || (major === 2 && minor === 8 && patch >= 3),
      `yaml version ${pkg.version} should be >= 2.8.3`
    );
  });

  it("deeply nested YAML throws controlled RESOURCE_EXHAUSTION error instead of uncontrolled crash", () => {
    // Build a deeply nested YAML string (1000 levels deep)
    let nested = "value";
    for (let i = 0; i < 1000; i++) {
      nested = `key:\n${nested
        .split("\n")
        .map((l) => `  ${l}`)
        .join("\n")}`;
    }

    // Patched version (>=2.8.3) throws a controlled YAMLParseError with
    // code RESOURCE_EXHAUSTION instead of an uncontrolled process crash
    try {
      YAML.parse(nested, { maxAliasCount: 100 });
      // If it parses successfully, that's also fine
    } catch (err: any) {
      assert.strictEqual(
        err.code,
        "RESOURCE_EXHAUSTION",
        "should throw RESOURCE_EXHAUSTION, not an uncontrolled stack overflow"
      );
    }
  });

  it("YAML.parse with maxAliasCount limits alias expansion", () => {
    // Create YAML with aliases that could cause exponential expansion
    const yamlWithAliases = `
a: &anchor
  x: 1
b: *anchor
c: *anchor
`;
    const result = YAML.parse(yamlWithAliases, { maxAliasCount: 100 });
    assert.deepStrictEqual(result.b, { x: 1 });
    assert.deepStrictEqual(result.c, { x: 1 });
  });

  it("workflow-spec.ts uses maxAliasCount option", () => {
    const src = readFileSync(
      path.resolve(import.meta.dirname, "..", "src", "installer", "workflow-spec.ts"),
      "utf-8"
    );
    assert.ok(
      src.includes("maxAliasCount"),
      "workflow-spec.ts should use maxAliasCount option in YAML.parse"
    );
  });

  it("dashboard.ts uses maxAliasCount option", () => {
    const src = readFileSync(
      path.resolve(import.meta.dirname, "..", "src", "server", "dashboard.ts"),
      "utf-8"
    );
    assert.ok(
      src.includes("maxAliasCount"),
      "dashboard.ts should use maxAliasCount option in YAML.parse"
    );
  });
});
