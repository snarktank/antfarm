import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  Task,
  validateTaskStructure,
  validateTaskSafety,
  taskHasForbiddenKeywords,
  getForbiddenKeywordsInTask,
  areTaskOperationsValid,
  getInvalidOperationsInTask,
  executeConfigRead,
  executeConfigWrite,
  executeInfraStatus,
  executeMonitoringCheck,
  executeLogAnalysis,
  executeRollbackPlan,
  executeTask,
  getOperationLogs,
  clearOperationLogs,
} from "./executor.js";

// Create test directory in workspace for relative path access
const BASE_TEST_DIR = ".test-executor";

// Ensure test dir exists
if (!fs.existsSync(BASE_TEST_DIR)) {
  fs.mkdirSync(BASE_TEST_DIR, { recursive: true });
}

// Helper to create test files with relative paths
function createTestFile(filename: string, content: string): string {
  const filePath = path.join(BASE_TEST_DIR, filename);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf-8");
  return filePath;
}

// Helper to create valid task
function createValidTask(overrides?: Partial<Task>): Task {
  return {
    task_id: "test-001",
    title: "Test Task",
    description: "This is a test task",
    safe_operations: ["config_read"],
    acceptance_criteria: "Task should complete without error",
    estimated_duration_seconds: 60,
    ...overrides,
  };
}

test("Task Structure Validation - valid task", () => {
  const task = createValidTask();
  const validation = validateTaskStructure(task);
  assert.equal(validation.valid, true);
  assert.equal(validation.errors.length, 0);
});

test("Task Structure Validation - missing task_id", () => {
  const task = createValidTask();
  delete (task as any).task_id;
  const validation = validateTaskStructure(task);
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.some((e) => e.includes("task_id")));
});

test("Task Structure Validation - missing title", () => {
  const task = createValidTask();
  delete (task as any).title;
  const validation = validateTaskStructure(task);
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.some((e) => e.includes("title")));
});

test("Task Structure Validation - missing description", () => {
  const task = createValidTask();
  delete (task as any).description;
  const validation = validateTaskStructure(task);
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.some((e) => e.includes("description")));
});

test("Task Structure Validation - missing safe_operations", () => {
  const task = createValidTask();
  delete (task as any).safe_operations;
  const validation = validateTaskStructure(task);
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.some((e) => e.includes("safe_operations")));
});

test("Task Structure Validation - missing acceptance_criteria", () => {
  const task = createValidTask();
  delete (task as any).acceptance_criteria;
  const validation = validateTaskStructure(task);
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.some((e) => e.includes("acceptance_criteria")));
});

test("Task Structure Validation - missing estimated_duration_seconds", () => {
  const task = createValidTask();
  delete (task as any).estimated_duration_seconds;
  const validation = validateTaskStructure(task);
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.some((e) => e.includes("estimated_duration_seconds")));
});

test("Task Structure Validation - non-object task", () => {
  const validation = validateTaskStructure("not an object");
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.some((e) => e.includes("must be an object")));
});

test("Task Safety Validation - valid task", () => {
  const task = createValidTask();
  const validation = validateTaskSafety(task);
  assert.equal(validation.valid, true);
  assert.equal(validation.errors.length, 0);
});

test("Task Safety Validation - rejects forbidden keyword destructive", () => {
  const task = createValidTask({
    description: "This is a destructive operation",
  });
  const validation = validateTaskSafety(task);
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.some((e) => e.includes("destructive")));
});

test("Task Safety Validation - rejects forbidden keyword drop", () => {
  const task = createValidTask({
    description: "Drop the database",
  });
  const validation = validateTaskSafety(task);
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.some((e) => e.includes("drop")));
});

test("Task Safety Validation - rejects forbidden keyword delete", () => {
  const task = createValidTask({
    description: "Delete all files",
  });
  const validation = validateTaskSafety(task);
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.some((e) => e.includes("delete")));
});

test("Task Safety Validation - rejects invalid operation", () => {
  const task = createValidTask({
    safe_operations: ["invalid_operation"],
  });
  const validation = validateTaskSafety(task);
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.some((e) => e.includes("invalid_operation")));
});

test("Task Safety Validation - rejects multiple invalid operations", () => {
  const task = createValidTask({
    safe_operations: ["config_read", "invalid_op1", "invalid_op2"],
  });
  const validation = validateTaskSafety(task);
  assert.equal(validation.valid, false);
  assert.equal(validation.errors.length, 1);
  assert.ok(validation.errors[0].includes("invalid_op1"));
  assert.ok(validation.errors[0].includes("invalid_op2"));
});

test("Forbidden Keywords Detection - detects destructive", () => {
  const task = createValidTask({ description: "This is destructive" });
  assert.equal(taskHasForbiddenKeywords(task), true);
});

test("Forbidden Keywords Detection - detects drop", () => {
  const task = createValidTask({ description: "Drop table" });
  assert.equal(taskHasForbiddenKeywords(task), true);
});

test("Forbidden Keywords Detection - case insensitive", () => {
  const task = createValidTask({ description: "DROP TABLE users" });
  assert.equal(taskHasForbiddenKeywords(task), true);
});

test("Forbidden Keywords Detection - returns list of keywords found", () => {
  const task = createValidTask({
    description: "Delete and drop the database",
  });
  const keywords = getForbiddenKeywordsInTask(task);
  assert.ok(keywords.includes("delete"));
  assert.ok(keywords.includes("drop"));
});

test("Operations Validation - accepts all valid operations", () => {
  const task = createValidTask({
    safe_operations: [
      "config_read",
      "config_write",
      "infra_status",
      "monitoring_check",
      "log_analysis",
      "rollback_plan",
    ],
  });
  assert.equal(areTaskOperationsValid(task), true);
});

test("Operations Validation - rejects invalid operation", () => {
  const task = createValidTask({
    safe_operations: ["config_read", "invalid_op"],
  });
  assert.equal(areTaskOperationsValid(task), false);
});

test("Operations Validation - identifies invalid operations", () => {
  const task = createValidTask({
    safe_operations: ["config_read", "bad_op1", "bad_op2"],
  });
  const invalid = getInvalidOperationsInTask(task);
  assert.deepEqual(invalid, ["bad_op1", "bad_op2"]);
});

test("Execute config_read - successful read", async () => {
  const testFile = createTestFile("config.yml", "key: value\ntest: 123");
  const result = executeConfigRead(testFile);
  assert.equal(result.success, true);
  assert.ok(result.output.includes("key: value"));
});

test("Execute config_read - file not found", () => {
  const result = executeConfigRead("nonexistent-file.yml");
  assert.equal(result.success, false);
  assert.ok(result.error);
});

test("Execute config_read - rejects absolute paths", () => {
  const result = executeConfigRead("/etc/passwd");
  assert.equal(result.success, false);
  assert.ok(result.error?.includes("relative"));
});

test("Execute config_read - rejects parent directory traversal", () => {
  const result = executeConfigRead("../../../etc/passwd");
  assert.equal(result.success, false);
  assert.ok(result.error?.includes(".."));
});

test("Execute config_write - successful write with backup", () => {
  const testFile = ".test-executor/config-write-test.yml";
  const initialContent = "old: value";
  fs.mkdirSync(path.dirname(testFile), { recursive: true });
  fs.writeFileSync(testFile, initialContent, "utf-8");

  const newContent = "new: value";
  const backupDir = ".test-executor/backups";
  const result = executeConfigWrite(testFile, newContent, backupDir);

  assert.equal(result.success, true);
  assert.ok(result.backup);
  assert.equal(fs.readFileSync(testFile, "utf-8"), newContent);
  assert.equal(fs.readFileSync(result.backup!, "utf-8"), initialContent);
});

test("Execute config_write - creates file if not exists", () => {
  const testFile = ".test-executor/new-config.yml";
  const newContent = "new: file";
  const backupDir = ".test-executor/backups";
  const result = executeConfigWrite(testFile, newContent, backupDir);

  assert.equal(result.success, true);
  assert.equal(fs.readFileSync(testFile, "utf-8"), newContent);
});

test("Execute config_write - rejects absolute paths", () => {
  const result = executeConfigWrite("/etc/config.yml", "content", BASE_TEST_DIR);
  assert.equal(result.success, false);
  assert.ok(result.error?.includes("relative"));
});

test("Execute config_write - rejects parent directory traversal", () => {
  const result = executeConfigWrite("../../../etc/config.yml", "content", BASE_TEST_DIR);
  assert.equal(result.success, false);
  assert.ok(result.error?.includes(".."));
});

test("Execute infra_status - successful query", () => {
  const result = executeInfraStatus("get system status");
  assert.equal(result.success, true);
  assert.ok(result.output.includes("Status check"));
});

test("Execute infra_status - rejects destructive operations", () => {
  const result = executeInfraStatus("drop database");
  assert.equal(result.success, false);
  assert.ok(result.error?.includes("forbidden"));
});

test("Execute monitoring_check - successful query", () => {
  const result = executeMonitoringCheck("check alerts");
  assert.equal(result.success, true);
  assert.ok(result.output.includes("Monitoring query"));
});

test("Execute monitoring_check - rejects destructive operations", () => {
  const result = executeMonitoringCheck("delete all metrics");
  assert.equal(result.success, false);
  assert.ok(result.error?.includes("forbidden"));
});

test("Execute log_analysis - reads log file", () => {
  const logFile = createTestFile("test.log", "line 1\nline 2\nline 3");
  const result = executeLogAnalysis(logFile);
  assert.equal(result.success, true);
  assert.ok(result.output.includes("line 1"));
});

test("Execute log_analysis - grep filter", () => {
  const logFile = createTestFile(
    "test-grep.log",
    "INFO: message 1\nERROR: message 2\nINFO: message 3"
  );
  const result = executeLogAnalysis(logFile, "ERROR");
  assert.equal(result.success, true);
  assert.ok(result.output.includes("ERROR: message 2"));
  assert.ok(!result.output.includes("INFO"));
});

test("Execute log_analysis - file not found", () => {
  const result = executeLogAnalysis("nonexistent.log");
  assert.equal(result.success, false);
  assert.ok(result.error?.includes("not found"));
});

test("Execute log_analysis - rejects absolute paths", () => {
  const result = executeLogAnalysis("/var/log/syslog");
  assert.equal(result.success, false);
  assert.ok(result.error?.includes("relative"));
});

test("Execute rollback_plan - generates from task", () => {
  const task = createValidTask({
    safe_operations: ["config_write"],
  });
  const result = executeRollbackPlan(task);
  assert.equal(result.success, true);
  assert.ok(result.output.includes("Rollback"));
  assert.ok(result.output.includes("backup"));
});

test("Execute rollback_plan - uses explicit plan if provided", () => {
  const customPlan = "1. Restore from snapshot\n2. Verify service health";
  const task = createValidTask({
    rollback_plan: customPlan,
  });
  const result = executeRollbackPlan(task);
  assert.equal(result.success, true);
  assert.ok(result.output.includes(customPlan));
});

test("Execute Task - complete valid task", () => {
  clearOperationLogs();
  const task = createValidTask({
    safe_operations: ["infra_status", "monitoring_check"],
  });
  const result = executeTask(task);

  assert.equal(result.status, "done");
  assert.equal(result.task_id, "test-001");
  assert.ok(result.logs);
  assert.ok(result.logs.some((l) => l.includes("OK")));
});

test("Execute Task - rejects task with forbidden keyword", () => {
  const task = createValidTask({
    description: "This will DELETE the database",
  });
  const result = executeTask(task);

  assert.equal(result.status, "fail");
  assert.ok(result.error?.includes("safety validation failed"));
});

test("Execute Task - rejects task with invalid operation", () => {
  const task = createValidTask({
    safe_operations: ["config_read", "invalid_operation"],
  });
  const result = executeTask(task);

  assert.equal(result.status, "fail");
  assert.ok(result.error?.includes("safety validation failed"));
});

test("Execute Task - rejects invalid task structure", () => {
  const task = createValidTask();
  delete (task as any).task_id;
  const result = executeTask(task);

  assert.equal(result.status, "fail");
  assert.ok(result.error?.includes("structure invalid"));
});

test("Execute Task - generates rollback for config_write", () => {
  clearOperationLogs();
  const task = createValidTask({
    safe_operations: ["config_write", "rollback_plan"],
  });
  const result = executeTask(task);

  assert.equal(result.status, "done");
  assert.ok(result.rollback?.includes("Rollback"));
});

test("Execute Task - with multiple safe operations", () => {
  clearOperationLogs();
  const task = createValidTask({
    safe_operations: [
      "infra_status",
      "monitoring_check",
      "log_analysis",
      "rollback_plan",
    ],
  });
  const result = executeTask(task);

  assert.equal(result.status, "done");
  assert.ok(result.logs && result.logs.length > 0);
});

test("Execute Task - with array acceptance criteria", () => {
  const task = createValidTask({
    safe_operations: ["infra_status", "rollback_plan"],
    acceptance_criteria: ["Step 1 complete", "Step 2 verified", "Step 3 logged"],
  });
  const result = executeTask(task);

  assert.equal(result.status, "done");
  assert.equal(result.task_id, "test-001");
});

test("Operation Logs - tracks all operations", () => {
  clearOperationLogs();
  
  executeInfraStatus("check status");
  executeMonitoringCheck("check alerts");
  
  const logs = getOperationLogs();
  assert.equal(logs.length, 2);
  assert.equal(logs[0].operation, "infra_status");
  assert.equal(logs[1].operation, "monitoring_check");
  assert.ok(logs[0].timestamp);
});

test("Operation Logs - clear logs", () => {
  clearOperationLogs();
  executeInfraStatus("test");
  
  let logs = getOperationLogs();
  assert.equal(logs.length, 1);
  
  clearOperationLogs();
  logs = getOperationLogs();
  assert.equal(logs.length, 0);
});

test("Acceptance Criteria - string format", () => {
  const task = createValidTask({
    acceptance_criteria: "Task must complete without errors",
  });
  const validation = validateTaskStructure(task);
  assert.equal(validation.valid, true);
});

test("Acceptance Criteria - array format", () => {
  const task = createValidTask({
    acceptance_criteria: ["Criterion 1", "Criterion 2", "Criterion 3"],
  });
  const validation = validateTaskStructure(task);
  assert.equal(validation.valid, true);
});

test("Task with optional rollback_plan", () => {
  const task = createValidTask({
    rollback_plan: "Restore from backup",
  });
  const validation = validateTaskStructure(task);
  assert.equal(validation.valid, true);
});

test("Execute Task - integration with infra_status, monitoring_check, rollback", () => {
  clearOperationLogs();
  const task: Task = {
    task_id: "integration-001",
    title: "System Status Check",
    description: "Check system and monitoring status",
    safe_operations: ["infra_status", "monitoring_check", "rollback_plan"],
    acceptance_criteria: [
      "Infrastructure status retrieved",
      "Monitoring status retrieved",
      "Rollback plan generated",
    ],
    estimated_duration_seconds: 120,
    rollback_plan: "No rollback needed for read-only checks",
  };

  const result = executeTask(task);

  assert.equal(result.status, "done");
  assert.equal(result.task_id, "integration-001");
  assert.ok(result.logs && result.logs.length >= 3);
  assert.ok(result.rollback?.includes("No rollback needed"));
});

test("Forbidden keywords - all variants detected", () => {
  const keywords = [
    "destructive",
    "shell_cmd",
    "drop",
    "delete",
    "truncate",
    "rm",
    "sql",
    "format",
    "destroy",
  ];

  keywords.forEach((keyword) => {
    const task = createValidTask({
      description: `This operation uses ${keyword}`,
    });
    const validation = validateTaskSafety(task);
    assert.equal(validation.valid, false, `Should reject ${keyword}`);
  });
});

// Cleanup happens after all tests via finally handler
// Files created in .test-executor directory will be cleaned up manually
test("cleanup test directory", () => {
  if (fs.existsSync(BASE_TEST_DIR)) {
    fs.rmSync(BASE_TEST_DIR, { recursive: true });
  }
  assert.ok(true);
});
