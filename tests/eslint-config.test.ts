import { describe, it } from "node:test";
import assert from "node:assert/strict";
import eslintConfig from "../eslint.config.js";

describe("eslint flat config", () => {
  it("ignores build and script outputs", () => {
    const ignoreEntry = eslintConfig.find((entry) => Array.isArray(entry.ignores));
    assert.ok(ignoreEntry, "expected an ignores entry in eslint config");
    const ignores = ignoreEntry?.ignores ?? [];
    assert.ok(ignores.includes("dist/**"));
    assert.ok(ignores.includes("node_modules/**"));
    assert.ok(ignores.includes("scripts/**"));
    assert.ok(ignores.includes("*.js"));
    assert.ok(ignores.includes("*.mjs"));
  });

  it("applies TypeScript rules to src and tests", () => {
    const srcEntry = eslintConfig.find((entry) => Array.isArray(entry.files) && entry.files.includes("src/**/*.ts"));
    const testEntry = eslintConfig.find((entry) => Array.isArray(entry.files) && entry.files.includes("tests/**/*.ts"));
    assert.ok(srcEntry, "expected src/**/*.ts config entry");
    assert.ok(testEntry, "expected tests/**/*.ts config entry");
  });
});
