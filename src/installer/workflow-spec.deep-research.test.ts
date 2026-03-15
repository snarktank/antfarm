import { describe, it } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadWorkflowSpec } from "./workflow-spec.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");
const workflowDir = path.join(repoRoot, "workflows", "deep-research");

describe("deep-research workflow preflight", () => {
  it("loads with a preflight agent that uses analysis role", async () => {
    const workflow = await loadWorkflowSpec(workflowDir);
    const preflight = workflow.agents.find((agent) => agent.id === "preflight");
    assert.ok(preflight, "expected preflight agent to exist");
    assert.equal(preflight?.role, "analysis");
  });

  it("runs preflight before plan and research", async () => {
    const workflow = await loadWorkflowSpec(workflowDir);
    const stepIds = workflow.steps.map((step) => step.id);
    assert.deepEqual(stepIds.slice(0, 3), ["preflight", "plan", "research"]);
  });

  it("threads local context fields into plan and research", async () => {
    const workflow = await loadWorkflowSpec(workflowDir);
    const plan = workflow.steps.find((step) => step.id === "plan");
    const research = workflow.steps.find((step) => step.id === "research");
    assert.ok(plan?.input.includes("{{local_context_summary}}"));
    assert.ok(plan?.input.includes("{{local_context_packet_json}}"));
    assert.ok(research?.input.includes("{{local_context_summary}}"));
    assert.ok(research?.input.includes("{{web_research_needed}}"));
    assert.ok(research?.input.includes("{{safe_shared_context}}"));
  });
});
