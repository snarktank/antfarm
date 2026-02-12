import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { loadWorkflowSpec } from "../dist/installer/workflow-spec.js";
import path from "node:path";

describe("workflow-spec skills parsing", () => {
  const featureDevDir = path.resolve("workflows/feature-dev");

  it("parses verifier agent with agent-browser skill", async () => {
    const spec = await loadWorkflowSpec(featureDevDir);
    const verifier = spec.agents.find((a: any) => a.id === "verifier");
    assert.ok(verifier, "verifier agent should exist");
    assert.ok(Array.isArray(verifier.workspace.skills), "verifier should have skills array");
    assert.ok(verifier.workspace.skills!.includes("agent-browser"), "verifier should have agent-browser skill");
  });

  it("parses reviewer agent with agent-browser skill", async () => {
    const spec = await loadWorkflowSpec(featureDevDir);
    const reviewer = spec.agents.find((a: any) => a.id === "reviewer");
    assert.ok(reviewer, "reviewer agent should exist");
    assert.ok(Array.isArray(reviewer.workspace.skills), "reviewer should have skills array");
    assert.ok(reviewer.workspace.skills!.includes("agent-browser"), "reviewer should have agent-browser skill");
  });

  it("agents without skills have no skills field", async () => {
    const spec = await loadWorkflowSpec(featureDevDir);
    const planner = spec.agents.find((a: any) => a.id === "planner");
    assert.ok(planner, "planner agent should exist");
    assert.equal(planner.workspace.skills, undefined, "planner should not have skills");
  });
});
