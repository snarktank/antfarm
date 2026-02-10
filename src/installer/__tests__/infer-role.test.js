import { describe, it } from "node:test";
import assert from "node:assert/strict";

// Build first, then import from dist
const { inferRole } = await import("../../../dist/installer/install.js");

describe("inferRole", () => {
  it("returns 'coding' for compound agent ids", () => {
    assert.equal(inferRole("compound"), "coding");
    assert.equal(inferRole("feature-dev/compound"), "coding");
    assert.equal(inferRole("my-compound-agent"), "coding");
  });

  it("returns 'analysis' for planner/reviewer/etc", () => {
    assert.equal(inferRole("planner"), "analysis");
    assert.equal(inferRole("reviewer"), "analysis");
    assert.equal(inferRole("triager"), "analysis");
  });

  it("returns 'verification' for verifier", () => {
    assert.equal(inferRole("verifier"), "verification");
  });

  it("returns 'testing' for tester", () => {
    assert.equal(inferRole("tester"), "testing");
  });

  it("returns 'pr' for pr agent", () => {
    assert.equal(inferRole("pr"), "pr");
    assert.equal(inferRole("feature-dev/pr"), "pr");
  });

  it("returns 'coding' as default for unknown ids", () => {
    assert.equal(inferRole("developer"), "coding");
    assert.equal(inferRole("fixer"), "coding");
  });
});
