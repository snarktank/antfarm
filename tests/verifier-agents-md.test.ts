import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const content = readFileSync(
  resolve(import.meta.dirname, "../agents/shared/verifier/AGENTS.md"),
  "utf-8"
);

describe("Verifier AGENTS.md browser verification section", () => {
  it("contains a visual/browser-based verification section", () => {
    assert.ok(content.includes("## Visual/Browser-Based Verification"));
  });

  it("explains agent-browser commands (snapshot, screenshot, navigate)", () => {
    assert.ok(content.includes("snapshot"));
    assert.ok(content.includes("screenshot"));
    assert.ok(content.includes("navigate"));
    assert.ok(content.includes("browser"));
  });

  it("explains what to look for visually", () => {
    assert.ok(content.includes("Layout"));
    assert.ok(content.includes("Styling"));
    assert.ok(content.includes("Element visibility"));
    assert.ok(content.includes("Spacing"));
  });

  it("is marked as conditional", () => {
    assert.ok(
      content.includes("Only perform visual verification when the step prompt explicitly requests it")
    );
    assert.ok(content.includes("Conditional"));
  });

  it("includes pass/fail criteria for visual checks", () => {
    assert.ok(content.includes("Pass"));
    assert.ok(content.includes("Fail"));
    assert.ok(content.includes("broken layout"));
  });
});
