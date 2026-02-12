import test from "node:test";
import assert from "node:assert/strict";
import { buildResearchPrompt, generateResearchPlans } from "../src/server/research-plan.ts";

test("buildResearchPrompt keeps required structure and no placeholder-specific branch", () => {
  const prompt = buildResearchPrompt({
    type: "feature",
    task: "Replace placeholder implementations with production behavior",
    workflow: "feature-dev",
    repoPath: "/repo/path",
    goal: "Implement production behavior for findings.",
    evidence: ["src/server/dashboard.ts:60 if (!run) return null;"],
    deliverables: ["Implementation changes scoped to this task."],
    acceptanceCriteria: ["Tests cover success and failure paths."],
  });

  assert.match(prompt, /Task:/);
  assert.match(prompt, /Preferred workflow:/);
  assert.match(prompt, /Base repo path:/);
  assert.match(prompt, /Goal:/);
  assert.match(prompt, /Evidence:/);
  assert.match(prompt, /Expected deliverables:/);
  assert.match(prompt, /Acceptance criteria:/);
  assert.doesNotMatch(prompt.toLowerCase(), /placeholder logic is replaced with production-ready behavior\./);
});

test("generateResearchPlans classifies placeholder evidence into production type", () => {
  const plans = generateResearchPlans({
    task: "Replace placeholder implementations with production behavior",
    repoPath: "/repo/path",
    evidence: [
      { file: "src/server/dashboard.ts", line: 917, snippet: "type ResearchPlanType = \"feature\" | \"bug\" | \"placeholder\";" },
      { file: "src/server/dashboard.ts", line: 941, snippet: "input.type === \"placeholder\"" },
    ],
  });

  assert.equal(plans.length, 2);
  for (const plan of plans) {
    assert.ok(plan.type === "feature" || plan.type === "bug");
    assert.notEqual(plan.type, "placeholder" as never);
    assert.ok(plan.acceptanceCriteria.length > 0);
    assert.doesNotMatch(plan.acceptanceCriteria.join(" ").toLowerCase(), /placeholder-only/);
  }
});

test("generateResearchPlans returns bug classification for bug-like evidence and handles empty evidence", () => {
  const bugPlans = generateResearchPlans({
    task: "Fix server bug",
    repoPath: "/repo/path",
    evidence: [
      { file: "src/server/dashboard.ts", line: 60, snippet: "if (!run) return null;" },
    ],
  });

  assert.equal(bugPlans.length, 1);
  assert.equal(bugPlans[0]?.type, "bug");
  assert.equal(bugPlans[0]?.workflow, "bug-fix");

  const emptyPlans = generateResearchPlans({
    task: "No evidence",
    repoPath: "/repo/path",
    evidence: [],
  });
  assert.deepEqual(emptyPlans, []);
});
