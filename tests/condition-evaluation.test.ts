#!/usr/bin/env node
/**
 * Regression test for condition evaluation in workflow steps
 * Tests the fix for: condition fields in workflow YAML were not being evaluated
 */

import { evaluateCondition } from "./evaluate-condition.js";

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
  } catch (e) {
    console.log(`  ✗ ${name}: ${e instanceof Error ? e.message : String(e)}`);
    process.exitCode = 1;
  }
}

function assertEqual(actual: any, expected: any, msg?: string) {
  if (actual !== expected) {
    throw new Error(msg || `Expected ${expected}, got ${actual}`);
  }
}

console.log("=== Condition Evaluation Regression Tests ===\n");

// Test 1: Empty array comparison
test("condition: '{{steps.check-idle.IDLE_AGENTS}} != []' with non-empty value", () => {
  const context = { "steps.check-idle.idle_agents": "[agent1, agent2]" };
  assertEqual(evaluateCondition("{{steps.check-idle.IDLE_AGENTS}} != []", context), true);
});

test("condition: '{{steps.check-idle.IDLE_AGENTS}} != []' with empty array", () => {
  const context = { "steps.check-idle.idle_agents": "[]" };
  assertEqual(evaluateCondition("{{steps.check-idle.IDLE_AGENTS}} != []", context), false);
});

test("condition: '{{steps.check-idle.IDLE_AGENTS}} == []' with empty array", () => {
  const context = { "steps.check-idle.idle_agents": "[]" };
  assertEqual(evaluateCondition("{{steps.check-idle.IDLE_AGENTS}} == []", context), true);
});

// Test 2: Missing key handling
test("condition with missing key evaluates to empty", () => {
  const context = {};
  // Missing keys resolve to [missing: key] which we treat as []
  assertEqual(evaluateCondition("{{steps.check-idle.IDLE_AGENTS}} == []", context), true);
});

// Test 3: AND operator
test("condition with AND operator - both true", () => {
  const context = {
    "steps.check-idle.idle_agents": "[agent1]",
    "steps.check-repos.repo_tasks_available": "[task1]"
  };
  assertEqual(evaluateCondition("{{steps.check-idle.IDLE_AGENTS}} != [] && {{steps.check-repos.REPO_TASKS_AVAILABLE}} != []", context), true);
});

test("condition with AND operator - one false", () => {
  const context = {
    "steps.check-idle.idle_agents": "[agent1]",
    "steps.check-repos.repo_tasks_available": "[]"
  };
  assertEqual(evaluateCondition("{{steps.check-idle.IDLE_AGENTS}} != [] && {{steps.check-repos.REPO_TASKS_AVAILABLE}} != []", context), false);
});

// Test 4: OR operator
test("condition with OR operator - one true", () => {
  const context = {
    "steps.check-idle.idle_agents": "[]",
    "steps.check-repos.repo_tasks_available": "[task1]"
  };
  assertEqual(evaluateCondition("{{steps.check-idle.IDLE_AGENTS}} != [] || {{steps.check-repos.REPO_TASKS_AVAILABLE}} != []", context), true);
});

test("condition with OR operator - both false", () => {
  const context = {
    "steps.check-idle.idle_agents": "[]",
    "steps.check-repos.repo_tasks_available": "[]"
  };
  assertEqual(evaluateCondition("{{steps.check-idle.IDLE_AGENTS}} != [] || {{steps.check-repos.REPO_TASKS_AVAILABLE}} != []", context), false);
});

// Test 5: Complex condition from antfarm-productivity workflow
test("complex condition from antfarm-productivity workflow", () => {
  const context = {
    "steps.check-idle.idle_agents": "[productivity-monitor]",
    "steps.check-user-repos.repo_tasks_available": "[DI.SSID, openclaw-config]"
  };
  const condition = "{{steps.check-idle.IDLE_AGENTS}} != [] && {{steps.check-user-repos.REPO_TASKS_AVAILABLE}} != []";
  assertEqual(evaluateCondition(condition, context), true);
});

// Test 6: Second condition (skill assignment path)
test("skill assignment condition when no repo work available", () => {
  const context = {
    "steps.check-idle.idle_agents": "[productivity-monitor]",
    "steps.check-user-repos.repo_tasks_available": "[]"
  };
  const condition = "{{steps.check-idle.IDLE_AGENTS}} != [] && {{steps.check-user-repos.REPO_TASKS_AVAILABLE}} == []";
  assertEqual(evaluateCondition(condition, context), true);
});

console.log("\n=== Test Summary ===");
if (process.exitCode === 1) {
  console.log("Some tests failed!");
  process.exit(1);
} else {
  console.log("All tests passed! ✓");
}
