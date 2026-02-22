/**
 * Tests for @figma/code-connect setup (story-01).
 * Verifies that the figma config file and package.json scripts are correctly configured.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");

describe("Figma Code Connect configuration", () => {
  it("figma.config.json exists at repo root", () => {
    const configPath = path.join(ROOT, "figma.config.json");
    assert.ok(existsSync(configPath), "figma.config.json should exist at repo root");
  });

  it("figma.config.json is valid JSON", () => {
    const configPath = path.join(ROOT, "figma.config.json");
    const raw = readFileSync(configPath, "utf-8");
    let parsed: unknown;
    assert.doesNotThrow(() => {
      parsed = JSON.parse(raw);
    }, "figma.config.json should be valid JSON");
    assert.ok(parsed !== null && typeof parsed === "object", "parsed config should be an object");
  });

  it("figma.config.json has codeConnect.include glob for landing page files", () => {
    const configPath = path.join(ROOT, "figma.config.json");
    const config = JSON.parse(readFileSync(configPath, "utf-8")) as Record<string, unknown>;
    assert.ok("codeConnect" in config, "config should have codeConnect key");
    const codeConnect = config.codeConnect as Record<string, unknown>;
    assert.ok("include" in codeConnect, "codeConnect should have include key");
    const include = codeConnect.include as string[];
    assert.ok(Array.isArray(include), "include should be an array");
    assert.ok(include.length > 0, "include should have at least one glob");
    const hasLandingGlob = include.some((g) => g.startsWith("landing/"));
    assert.ok(hasLandingGlob, `include should have a glob starting with 'landing/', got: ${JSON.stringify(include)}`);
  });

  it("package.json has @figma/code-connect in devDependencies", () => {
    const pkgPath = path.join(ROOT, "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as Record<string, unknown>;
    const devDeps = pkg.devDependencies as Record<string, string> | undefined;
    assert.ok(devDeps !== undefined, "package.json should have devDependencies");
    assert.ok(
      "@figma/code-connect" in devDeps,
      "@figma/code-connect should be in devDependencies"
    );
  });

  it("package.json has figma:parse script", () => {
    const pkgPath = path.join(ROOT, "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as Record<string, unknown>;
    const scripts = pkg.scripts as Record<string, string> | undefined;
    assert.ok(scripts !== undefined, "package.json should have scripts");
    assert.ok("figma:parse" in scripts, "scripts should have figma:parse");
    assert.ok(
      scripts["figma:parse"].includes("figma connect parse"),
      `figma:parse should run 'figma connect parse', got: ${scripts["figma:parse"]}`
    );
  });

  it("package.json has figma:publish script", () => {
    const pkgPath = path.join(ROOT, "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as Record<string, unknown>;
    const scripts = pkg.scripts as Record<string, string> | undefined;
    assert.ok(scripts !== undefined, "package.json should have scripts");
    assert.ok("figma:publish" in scripts, "scripts should have figma:publish");
    assert.ok(
      scripts["figma:publish"].includes("figma connect publish"),
      `figma:publish should run 'figma connect publish', got: ${scripts["figma:publish"]}`
    );
  });
});
