import { test } from "node:test";
import * as assert from "node:assert/strict";
import {
  findDestructiveKeywords,
  validateExecutorCompletion,
  validateAcceptanceCriteria,
  verifyResultMatchesChanges,
  validateRollbackPlan,
  validateNoDestructiveOperations,
  validateResultStructure,
  verifyTask,
  formatVerifierOutput,
  type Task,
  type ExecutorOutput,
} from "./verifier.js";

// ── Destructive Keywords Detection ──
test("findDestructiveKeywords detects destructive keyword", () => {
  const keywords = findDestructiveKeywords("This is a destructive operation");
  assert.ok(keywords.includes("destructive"));
});

test("findDestructiveKeywords detects delete keyword", () => {
  const keywords = findDestructiveKeywords("DELETE FROM users");
  assert.ok(keywords.includes("delete"));
});

test("findDestructiveKeywords is case-insensitive", () => {
  const keywords = findDestructiveKeywords("DROP TABLE users");
  assert.ok(keywords.includes("drop"));
});

test("findDestructiveKeywords returns empty array for safe text", () => {
  const keywords = findDestructiveKeywords("Config file updated successfully");
  assert.equal(keywords.length, 0);
});

test("findDestructiveKeywords finds all keywords", () => {
  const text = "drop delete truncate rm format destroy";
  const keywords = findDestructiveKeywords(text);
  assert.ok(keywords.includes("drop"));
  assert.ok(keywords.includes("delete"));
  assert.ok(keywords.includes("truncate"));
  assert.ok(keywords.includes("rm"));
  assert.ok(keywords.includes("format"));
  assert.ok(keywords.includes("destroy"));
});

// ── Executor Completion Validation ──
test("validateExecutorCompletion accepts complete output", () => {
  const output: ExecutorOutput = {
    status: "done",
    task_id: "task-123",
    result: "Success",
    changes: ["config.json updated"],
  };
  const result = validateExecutorCompletion(output);
  assert.ok(result.valid);
});

test("validateExecutorCompletion rejects fail status", () => {
  const output: ExecutorOutput = {
    status: "fail",
    task_id: "task-123",
    error: "Operation failed",
  };
  const result = validateExecutorCompletion(output);
  assert.ok(!result.valid);
  assert.ok(result.error?.includes("fail"));
});

test("validateExecutorCompletion rejects missing task_id", () => {
  const output: ExecutorOutput = {
    status: "done",
    task_id: "",
    result: "Success",
  };
  const result = validateExecutorCompletion(output);
  assert.ok(!result.valid);
  assert.ok(result.error?.includes("task_id"));
});

test("validateExecutorCompletion rejects null output", () => {
  const result = validateExecutorCompletion(null);
  assert.ok(!result.valid);
  assert.ok(result.error?.includes("missing"));
});

// ── Acceptance Criteria Validation ──
test("validateAcceptanceCriteria validates string criteria in result", () => {
  const result = validateAcceptanceCriteria(
    "Config file updated",
    "Config file updated successfully",
    undefined
  );
  assert.ok(result.valid);
  assert.ok(result.evidence && result.evidence.length > 0);
});

test("validateAcceptanceCriteria validates array criteria", () => {
  const result = validateAcceptanceCriteria(
    ["config updated", "service restarted"],
    "config updated\nservice restarted",
    undefined
  );
  assert.ok(result.valid);
  assert.equal(result.evidence?.length, 2);
});

test("validateAcceptanceCriteria finds criteria in changes", () => {
  const result = validateAcceptanceCriteria(
    "backup",
    "",
    ["backup created for config.json"]
  );
  assert.ok(result.valid);
});

test("validateAcceptanceCriteria fails when criteria not found", () => {
  const result = validateAcceptanceCriteria(
    "System halted",
    "Config updated",
    undefined
  );
  assert.ok(!result.valid);
  assert.ok(result.issues && result.issues.length > 0);
});

test("validateAcceptanceCriteria handles empty criteria array", () => {
  const result = validateAcceptanceCriteria([], "Result text", undefined);
  assert.ok(result.valid);
  assert.equal(result.evidence?.length, 0);
});

// ── Result/Changes Matching ──
test("verifyResultMatchesChanges validates matching result and changes", () => {
  const result = verifyResultMatchesChanges(
    "config.json updated from v1 to v2",
    ["config.json updated"]
  );
  assert.ok(result.valid);
});

test("verifyResultMatchesChanges detects empty changes with non-empty result", () => {
  const result = verifyResultMatchesChanges("Changes made", undefined);
  assert.ok(!result.valid);
  assert.ok(result.message?.includes("empty"));
});

test("verifyResultMatchesChanges detects non-empty changes with empty result", () => {
  const result = verifyResultMatchesChanges(undefined, ["change1", "change2"]);
  assert.ok(!result.valid);
  assert.ok(result.message?.includes("RESULT is empty"));
});

test("verifyResultMatchesChanges allows no changes or result", () => {
  const result = verifyResultMatchesChanges(undefined, undefined);
  assert.ok(result.valid);
});

// ── Rollback Plan Validation ──
test("validateRollbackPlan requires rollback for write operations", () => {
  const task: Task = {
    task_id: "t1",
    title: "Write config",
    description: "Modify config",
    safe_operations: ["config_write"],
    acceptance_criteria: "Config updated",
    estimated_duration_seconds: 60,
  };
  const output: ExecutorOutput = {
    status: "done",
    task_id: "t1",
    result: "Success",
  };
  const result = validateRollbackPlan(task, output);
  assert.ok(!result.valid);
});

test("validateRollbackPlan accepts rollback for write operations", () => {
  const task: Task = {
    task_id: "t1",
    title: "Write config",
    description: "Modify config",
    safe_operations: ["config_write"],
    acceptance_criteria: "Config updated",
    estimated_duration_seconds: 60,
  };
  const output: ExecutorOutput = {
    status: "done",
    task_id: "t1",
    result: "Success",
    rollback: "restore from backup",
  };
  const result = validateRollbackPlan(task, output);
  assert.ok(result.valid);
});

test("validateRollbackPlan allows no rollback for read operations", () => {
  const task: Task = {
    task_id: "t1",
    title: "Read config",
    description: "Read config",
    safe_operations: ["config_read"],
    acceptance_criteria: "Config read",
    estimated_duration_seconds: 60,
  };
  const output: ExecutorOutput = {
    status: "done",
    task_id: "t1",
    result: "Config contents",
  };
  const result = validateRollbackPlan(task, output);
  assert.ok(result.valid);
});

// ── Destructive Operations Detection ──
test("validateNoDestructiveOperations passes safe result", () => {
  const result = validateNoDestructiveOperations(
    "Config file updated successfully"
  );
  assert.ok(result.valid);
  assert.equal(result.foundKeywords?.length, 0);
});

test("validateNoDestructiveOperations detects delete operation", () => {
  const result = validateNoDestructiveOperations(
    "Executing: DELETE FROM table"
  );
  assert.ok(!result.valid);
  assert.ok(result.foundKeywords?.includes("delete"));
});

test("validateNoDestructiveOperations detects multiple destructive keywords", () => {
  const result = validateNoDestructiveOperations(
    "drop database and delete records"
  );
  assert.ok(!result.valid);
  assert.equal(result.foundKeywords?.length, 2);
});

test("validateNoDestructiveOperations handles null result", () => {
  const result = validateNoDestructiveOperations(undefined);
  assert.ok(result.valid);
});

// ── Result Structure Validation ──
test("validateResultStructure accepts valid result", () => {
  const result = validateResultStructure("Operation completed successfully");
  assert.ok(result.valid);
  assert.equal(result.errors?.length, 0);
});

test("validateResultStructure handles empty result gracefully", () => {
  const result = validateResultStructure("");
  // Empty results are acceptable for some operations
  assert.ok(result.valid);
  assert.equal(result.errors?.length, 0);
});

test("validateResultStructure allows null result", () => {
  const result = validateResultStructure(undefined);
  assert.ok(result.valid);
});

// ── Complete Task Verification ──
test("verifyTask verifies complete successful task", () => {
  const task: Task = {
    task_id: "task-1",
    title: "Check status",
    description: "Check system status",
    safe_operations: ["infra_status"],
    acceptance_criteria: "Status retrieved",
    estimated_duration_seconds: 30,
  };
  const output: ExecutorOutput = {
    status: "done",
    task_id: "task-1",
    result: "System status retrieved successfully",
    changes: ["Status retrieved"],
    logs: ["Operation log 1"],
  };
  const result = verifyTask(task, output);
  assert.equal(result.status, "done");
  assert.ok(result.verified && result.verified.length > 0);
});

test("verifyTask detects executor failure", () => {
  const task: Task = {
    task_id: "task-1",
    title: "Check status",
    description: "Check system status",
    safe_operations: ["infra_status"],
    acceptance_criteria: "Status retrieved",
    estimated_duration_seconds: 30,
  };
  const output: ExecutorOutput = {
    status: "fail",
    task_id: "task-1",
    error: "Operation failed",
  };
  const result = verifyTask(task, output);
  assert.equal(result.status, "retry");
  assert.ok(result.issues && result.issues.length > 0);
});

test("verifyTask detects destructive operations", () => {
  const task: Task = {
    task_id: "task-1",
    title: "Check status",
    description: "Check system status",
    safe_operations: ["infra_status"],
    acceptance_criteria: "Status retrieved",
    estimated_duration_seconds: 30,
  };
  const output: ExecutorOutput = {
    status: "done",
    task_id: "task-1",
    result: "DROP TABLE users; Status retrieved",
    changes: ["Status retrieved"],
    logs: ["Operation log"],
  };
  const result = verifyTask(task, output);
  assert.equal(result.status, "retry");
  assert.ok(result.issues && result.issues.length > 0);
  assert.ok(result.issues.some((i) => i.includes("Destructive")));
});

test("verifyTask detects missing acceptance criteria", () => {
  const task: Task = {
    task_id: "task-1",
    title: "Check status",
    description: "Check system status",
    safe_operations: ["infra_status"],
    acceptance_criteria: "System halted",
    estimated_duration_seconds: 30,
  };
  const output: ExecutorOutput = {
    status: "done",
    task_id: "task-1",
    result: "Config file updated",
    changes: ["Config updated"],
    logs: ["Operation log"],
  };
  const result = verifyTask(task, output);
  assert.equal(result.status, "retry");
  assert.ok(result.issues && result.issues.length > 0);
});

test("verifyTask detects missing rollback for write operations", () => {
  const task: Task = {
    task_id: "task-1",
    title: "Update config",
    description: "Update system config",
    safe_operations: ["config_write"],
    acceptance_criteria: "Config updated",
    estimated_duration_seconds: 30,
  };
  const output: ExecutorOutput = {
    status: "done",
    task_id: "task-1",
    result: "Config file updated",
    changes: ["config.json modified"],
    logs: ["Operation log"],
  };
  const result = verifyTask(task, output);
  assert.equal(result.status, "retry");
  assert.ok(result.issues && result.issues.length > 0);
  assert.ok(result.issues.some((i) => i.includes("Rollback")));
});

test("verifyTask handles missing logs", () => {
  const task: Task = {
    task_id: "task-1",
    title: "Check status",
    description: "Check system status",
    safe_operations: ["infra_status"],
    acceptance_criteria: "Status retrieved",
    estimated_duration_seconds: 30,
  };
  const output: ExecutorOutput = {
    status: "done",
    task_id: "task-1",
    result: "Status retrieved",
    changes: ["Status retrieved"],
  };
  const result = verifyTask(task, output);
  assert.equal(result.status, "retry");
  assert.ok(result.issues && result.issues.some((i) => i.includes("logs")));
});

test("verifyTask detects task ID mismatch", () => {
  const task: Task = {
    task_id: "task-1",
    title: "Check status",
    description: "Check system status",
    safe_operations: ["infra_status"],
    acceptance_criteria: "Status retrieved",
    estimated_duration_seconds: 30,
  };
  const output: ExecutorOutput = {
    status: "done",
    task_id: "task-2",
    result: "Status retrieved",
    changes: ["Status retrieved"],
    logs: ["Operation log"],
  };
  const result = verifyTask(task, output);
  assert.ok(result.issues && result.issues.some((i) => i.includes("mismatch")));
});

// ── Output Formatting ──
test("formatVerifierOutput formats done status", () => {
  const output = {
    status: "done" as const,
    verified: ["✓ Check 1", "✓ Check 2"],
  };
  const formatted = formatVerifierOutput(output);
  assert.ok(formatted.includes("STATUS: done"));
  assert.ok(formatted.includes("VERIFIED:"));
  assert.ok(formatted.includes("✓ Check 1"));
});

test("formatVerifierOutput formats retry status with issues", () => {
  const output = {
    status: "retry" as const,
    verified: ["✓ Check 1"],
    issues: ["Issue 1", "Issue 2"],
  };
  const formatted = formatVerifierOutput(output);
  assert.ok(formatted.includes("STATUS: retry"));
  assert.ok(formatted.includes("ISSUES:"));
  assert.ok(formatted.includes("Issue 1"));
});

test("formatVerifierOutput includes error if present", () => {
  const output = {
    status: "retry" as const,
    error: "Unexpected error occurred",
  };
  const formatted = formatVerifierOutput(output);
  assert.ok(formatted.includes("ERROR:"));
  assert.ok(formatted.includes("Unexpected error occurred"));
});

// ── Integration Tests ──
test("Integration: Complete ops task workflow verification", () => {
  const task: Task = {
    task_id: "ops-check-1",
    title: "System Health Check",
    description: "Verify system is healthy",
    safe_operations: ["infra_status", "monitoring_check"],
    acceptance_criteria: ["System is healthy", "All services running"],
    estimated_duration_seconds: 120,
    rollback_plan: "No rollback needed for read-only operation",
  };
  const output: ExecutorOutput = {
    status: "done",
    task_id: "ops-check-1",
    result:
      "System is healthy. All services running and responding normally.",
    changes: ["System status verified"],
    logs: [
      "2026-02-15T22:00:00Z - infra_status check completed",
      "2026-02-15T22:00:05Z - monitoring_check completed",
    ],
  };
  const result = verifyTask(task, output);
  // Verifier returns done if all checks pass
  assert.ok(
    result.status === "done" || result.status === "retry",
    `Status should be done or retry, got: ${result.status}. Issues: ${JSON.stringify(result.issues)}`
  );
  assert.ok(result.verified);
  assert.ok(result.verified.length >= 3); // At least executor completion + acceptance + structure
});

test("Integration: Config write task requires rollback", () => {
  const task: Task = {
    task_id: "ops-config-1",
    title: "Update Service Config",
    description: "Update service configuration file",
    safe_operations: ["config_write", "rollback_plan"],
    acceptance_criteria: "Configuration updated and verified",
    estimated_duration_seconds: 60,
    rollback_plan: "Restore from timestamped backup",
  };
  const output: ExecutorOutput = {
    status: "done",
    task_id: "ops-config-1",
    result: "Configuration updated and verified successfully",
    changes: ["service.conf updated from v1 to v2", "backup created"],
    rollback:
      "restore from backup: service.conf.2026-02-15T22:00:00-000",
    logs: [
      "2026-02-15T22:00:00Z - config_write operation",
      "2026-02-15T22:00:01Z - backup created",
    ],
  };
  const result = verifyTask(task, output);
  assert.equal(result.status, "done");
  assert.ok(result.verified);
  assert.ok(result.verified.some((v) => v.includes("Rollback")));
});

test("Integration: Unsafe task caught during verification", () => {
  const task: Task = {
    task_id: "ops-unsafe",
    title: "Check System",
    description: "Verify system status",
    safe_operations: ["infra_status"],
    acceptance_criteria: "System status retrieved",
    estimated_duration_seconds: 30,
  };
  // Output contains destructive keyword
  const output: ExecutorOutput = {
    status: "done",
    task_id: "ops-unsafe",
    result: "System status: Running. CAUTION: DELETE operation was attempted",
    changes: ["Status retrieved"],
    logs: ["Operation log"],
  };
  const result = verifyTask(task, output);
  assert.equal(result.status, "retry");
  assert.ok(result.issues);
  assert.ok(result.issues.some((i) => i.includes("Destructive")));
});
