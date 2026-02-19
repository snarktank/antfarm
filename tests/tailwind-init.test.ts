/**
 * Tests for Tailwind CSS and Tailgrids initialization.
 * Verifies that configuration files, dependencies, and build output are correct.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const PROJECT_ROOT = path.resolve(import.meta.dirname, "..");

describe("Tailwind CSS Initialization", () => {
  it("tailwind.config.js exists in project root", () => {
    const configPath = path.join(PROJECT_ROOT, "tailwind.config.js");
    assert.ok(existsSync(configPath), "tailwind.config.js should exist");
  });

  it("tailwind.config.js has dark mode configured as 'class'", () => {
    const configPath = path.join(PROJECT_ROOT, "tailwind.config.js");
    const content = readFileSync(configPath, "utf-8");
    assert.ok(
      content.includes("darkMode: 'class'"),
      "tailwind.config.js should have darkMode: 'class'"
    );
  });

  it("tailwind.config.js has content paths configured", () => {
    const configPath = path.join(PROJECT_ROOT, "tailwind.config.js");
    const content = readFileSync(configPath, "utf-8");
    assert.ok(
      content.includes("content:"),
      "tailwind.config.js should have content paths"
    );
    assert.ok(
      content.includes("src/server"),
      "content should include src/server path"
    );
  });

  it("postcss.config.js exists in project root", () => {
    const configPath = path.join(PROJECT_ROOT, "postcss.config.js");
    assert.ok(existsSync(configPath), "postcss.config.js should exist");
  });

  it("postcss.config.js includes tailwindcss plugin", () => {
    const configPath = path.join(PROJECT_ROOT, "postcss.config.js");
    const content = readFileSync(configPath, "utf-8");
    assert.ok(
      content.includes("tailwindcss"),
      "postcss.config.js should include tailwindcss"
    );
  });

  it("postcss.config.js includes autoprefixer plugin", () => {
    const configPath = path.join(PROJECT_ROOT, "postcss.config.js");
    const content = readFileSync(configPath, "utf-8");
    assert.ok(
      content.includes("autoprefixer"),
      "postcss.config.js should include autoprefixer"
    );
  });

  it("package.json includes tailwindcss in devDependencies", () => {
    const pkgPath = path.join(PROJECT_ROOT, "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    assert.ok(
      pkg.devDependencies?.tailwindcss,
      "package.json should have tailwindcss in devDependencies"
    );
  });

  it("package.json includes postcss in devDependencies", () => {
    const pkgPath = path.join(PROJECT_ROOT, "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    assert.ok(
      pkg.devDependencies?.postcss,
      "package.json should have postcss in devDependencies"
    );
  });

  it("package.json includes autoprefixer in devDependencies", () => {
    const pkgPath = path.join(PROJECT_ROOT, "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    assert.ok(
      pkg.devDependencies?.autoprefixer,
      "package.json should have autoprefixer in devDependencies"
    );
  });

  it("package.json has build:css script for Tailwind processing", () => {
    const pkgPath = path.join(PROJECT_ROOT, "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    assert.ok(
      pkg.scripts?.["build:css"],
      "package.json should have build:css script"
    );
    assert.ok(
      pkg.scripts["build:css"].includes("tailwindcss"),
      "build:css script should run tailwindcss"
    );
  });

  it("package.json build script includes CSS processing", () => {
    const pkgPath = path.join(PROJECT_ROOT, "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    assert.ok(
      pkg.scripts?.build?.includes("build:css"),
      "build script should include build:css"
    );
  });

  it("input.css exists with Tailwind directives", () => {
    const inputPath = path.join(PROJECT_ROOT, "src/server/input.css");
    assert.ok(existsSync(inputPath), "src/server/input.css should exist");
    const content = readFileSync(inputPath, "utf-8");
    assert.ok(
      content.includes("@tailwind base"),
      "input.css should have @tailwind base"
    );
    assert.ok(
      content.includes("@tailwind components"),
      "input.css should have @tailwind components"
    );
    assert.ok(
      content.includes("@tailwind utilities"),
      "input.css should have @tailwind utilities"
    );
  });

  it("tailwind-test.html exists in src/server", () => {
    const testPath = path.join(PROJECT_ROOT, "src/server/tailwind-test.html");
    assert.ok(existsSync(testPath), "tailwind-test.html should exist");
  });

  it("tailwind-test.html references output.css", () => {
    const testPath = path.join(PROJECT_ROOT, "src/server/tailwind-test.html");
    const content = readFileSync(testPath, "utf-8");
    assert.ok(
      content.includes("output.css"),
      "tailwind-test.html should reference output.css"
    );
  });

  it("tailwind-test.html uses Tailwind utility classes", () => {
    const testPath = path.join(PROJECT_ROOT, "src/server/tailwind-test.html");
    const content = readFileSync(testPath, "utf-8");
    // Check for various Tailwind classes
    assert.ok(
      content.includes("bg-") || content.includes("text-") || content.includes("p-"),
      "tailwind-test.html should use Tailwind utility classes"
    );
  });

  it("tailwind-test.html has dark mode classes", () => {
    const testPath = path.join(PROJECT_ROOT, "src/server/tailwind-test.html");
    const content = readFileSync(testPath, "utf-8");
    assert.ok(
      content.includes("dark:"),
      "tailwind-test.html should have dark mode classes"
    );
  });

  it("output.css is generated in dist/server after build", () => {
    const outputPath = path.join(PROJECT_ROOT, "dist/server/output.css");
    assert.ok(
      existsSync(outputPath),
      "dist/server/output.css should exist after build"
    );
  });

  it("output.css is not empty", () => {
    const outputPath = path.join(PROJECT_ROOT, "dist/server/output.css");
    const content = readFileSync(outputPath, "utf-8");
    assert.ok(content.length > 100, "output.css should not be empty");
  });

  it("tailwind-test.html is copied to dist/server", () => {
    const testPath = path.join(PROJECT_ROOT, "dist/server/tailwind-test.html");
    assert.ok(
      existsSync(testPath),
      "tailwind-test.html should be copied to dist/server"
    );
  });

  it("package.json has typecheck script", () => {
    const pkgPath = path.join(PROJECT_ROOT, "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    assert.ok(
      pkg.scripts?.typecheck,
      "package.json should have typecheck script"
    );
  });
});
