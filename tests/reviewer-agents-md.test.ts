import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const agentsMd = readFileSync(
  resolve(import.meta.dirname, "../workflows/feature-dev/agents/reviewer/AGENTS.md"),
  "utf-8"
);

describe("reviewer AGENTS.md browser verification", () => {
  it("contains a visual/browser-based verification section", () => {
    assert.ok(agentsMd.includes("## Visual/Browser-Based Verification"));
  });

  it("explains how to use agent-browser to render and screenshot pages", () => {
    assert.ok(agentsMd.includes("agent-browser"));
    assert.ok(agentsMd.includes("browser screenshot"));
    assert.ok(agentsMd.includes("browser snapshot"));
    assert.ok(agentsMd.includes("browser navigate"));
  });

  it("focuses on design quality checks appropriate for a reviewer role", () => {
    assert.ok(agentsMd.includes("Design Quality Checks"));
    assert.ok(agentsMd.includes("Visual hierarchy"));
    assert.ok(agentsMd.includes("Consistency"));
    assert.ok(agentsMd.includes("polish and design quality"));
  });

  it("includes decision criteria for visual review", () => {
    assert.ok(agentsMd.includes("Decision Criteria for Visual Review"));
    assert.ok(agentsMd.includes("Approve"));
    assert.ok(agentsMd.includes("Request changes"));
  });

  it("is conditional — only when step prompt requests it", () => {
    assert.ok(agentsMd.includes("Only perform visual verification when the step prompt explicitly requests it"));
  });
});
