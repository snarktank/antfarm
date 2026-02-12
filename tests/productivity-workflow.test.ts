/**
 * Regression test for task assignment bug
 * Bug: Role-based assignment prevented idle workers from taking bug-fix tasks
 * 
 * This test verifies that the antfarm-productivity workflow uses priority-based
 * assignment (allowing any idle worker to take bug-fix tasks) rather than
 * role-based assignment (restricting tasks to specific agent types).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { parse } from "yaml";
import { readFileSync } from "node:fs";

const WORKFLOW_PATH = path.resolve(
  import.meta.dirname,
  "..",
  "workflows",
  "antfarm-productivity",
  "workflow.yml"
);

const CATALOG_PATH = path.resolve(
  import.meta.dirname,
  "..",
  "workflows",
  "antfarm-productivity",
  "repo-work-catalog.md"
);

describe("antfarm-productivity workflow (regression test)", () => {
  describe("task assignment logic", () => {
    it("workflow.yml uses priority-based task grouping, not role-based", () => {
      const workflowContent = readFileSync(WORKFLOW_PATH, "utf-8");
      const workflow = parse(workflowContent);
      
      const assignStep = workflow.steps.find((s: any) => s.id === "assign-repo-work");
      assert.ok(assignStep, "workflow should have assign-repo-work step");
      
      // The input prompt should mention priority, not agent roles
      const input = assignStep.input.toLowerCase();
      
      // These phrases indicate priority-based assignment (correct)
      assert.ok(
        input.includes("priority") && input.includes("1"),
        "workflow should group tasks by priority (Priority 1, 2, 3)"
      );
      
      // The input should explicitly say bug-fix tasks can go to ANY idle worker
      assert.ok(
        input.includes("any idle") || input.includes("any idle worker"),
        "workflow should explicitly allow bug-fix tasks for ANY idle worker"
      );
      
      // Should NOT have role-gating language
      assert.ok(
        !input.includes("for bug-fix agents only") &&
        !input.includes("only bug-fix") &&
        !input.includes("designated bug-fix"),
        "workflow should NOT restrict bug-fix tasks to specific agent roles"
      );
    });

    it("repo-work-catalog.md uses task-type headers, not role-based headers", () => {
      const catalogContent = readFileSync(CATALOG_PATH, "utf-8");
      
      // Should have priority-based headers
      assert.ok(
        catalogContent.includes("Priority 1:") || catalogContent.includes("**Priority 1**"),
        "catalog should have Priority 1 header"
      );
      
      // Bug fixes should be available to ANY worker
      assert.ok(
        catalogContent.toLowerCase().includes("any idle") ||
        catalogContent.toLowerCase().includes("any worker") ||
        catalogContent.toLowerCase().includes("available to"),
        "catalog should specify that tasks are available to workers"
      );
      
      // Should NOT have role-gating language
      const lowerCatalog = catalogContent.toLowerCase();
      assert.ok(
        !lowerCatalog.includes("bug-fix agents") ||
        (lowerCatalog.includes("bug-fix agents") && 
         lowerCatalog.includes("any idle") &&
         !lowerCatalog.includes("only bug-fix agents") &&
         !lowerCatalog.includes("exclusively bug-fix")),
        "catalog should not restrict bug-fix tasks to specific agent types"
      );
    });

    it("workflow input explicitly prioritizes bug-fix tasks", () => {
      const workflowContent = readFileSync(WORKFLOW_PATH, "utf-8");
      const workflow = parse(workflowContent);
      
      const assignStep = workflow.steps.find((s: any) => s.id === "assign-repo-work");
      const input = assignStep.input;
      
      // Should instruct to prioritize bug-fix for any idle agent
      const hasBugFixAnyAgent = 
        input.toLowerCase().includes("bug-fix") && 
        input.toLowerCase().includes("any idle");
      
      const hasPriorityInstructions =
        input.toLowerCase().includes("priority 1") ||
        input.toLowerCase().includes("first");
      
      assert.ok(
        hasBugFixAnyAgent && hasPriorityInstructions,
        "workflow should explicitly instruct to assign bug-fix tasks to any idle agent first"
      );
    });
  });
});
