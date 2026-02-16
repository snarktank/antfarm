import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  hasSafetyHeader,
  hasForbiddenKeywords,
  getForbiddenKeywordsFound,
  areOperationsValid,
  getInvalidOperations,
  validateTaskCount,
  validateTaskStructure,
  validateTasks,
  planOpsTask,
  validatePlannerOutput,
  type Task,
  type PlannerOutput,
} from "./planner.js";

describe("Ops Planner - Safety Header Validation", () => {
  it("recognizes SAFETY HEADER marker in input", () => {
    const input = `
      ### SAFETY HEADER
      Do NOT run destructive commands.
      
      Task: Check config files
    `;
    assert.equal(hasSafetyHeader(input), true);
  });

  it("recognizes SAFETY header (without ###) marker", () => {
    const input = `
      SAFETY HEADER: Do not modify production
      
      Task: Monitor logs
    `;
    assert.equal(hasSafetyHeader(input), true);
  });

  it("rejects input without safety header", () => {
    const input = "Check system status and report findings";
    assert.equal(hasSafetyHeader(input), false);
  });
});

describe("Ops Planner - Forbidden Keywords Detection", () => {
  it("detects 'destructive' keyword", () => {
    const input = "### SAFETY HEADER\nTask: destructive operation";
    assert.equal(hasForbiddenKeywords(input), true);
  });

  it("detects 'delete' keyword", () => {
    const input = "### SAFETY HEADER\nDelete old logs from database";
    assert.equal(hasForbiddenKeywords(input), true);
  });

  it("detects 'drop' keyword", () => {
    const input = "### SAFETY HEADER\nDrop unused tables";
    assert.equal(hasForbiddenKeywords(input), true);
  });

  it("detects 'truncate' keyword", () => {
    const input = "### SAFETY HEADER\nTruncate temp data";
    assert.equal(hasForbiddenKeywords(input), true);
  });

  it("detects 'sql' keyword", () => {
    const input = "### SAFETY HEADER\nRun SQL migration script";
    assert.equal(hasForbiddenKeywords(input), true);
  });

  it("detects 'shell_cmd' keyword", () => {
    const input = "### SAFETY HEADER\nExecute shell_cmd to restart service";
    assert.equal(hasForbiddenKeywords(input), true);
  });

  it("detects 'rm' keyword", () => {
    const input = "### SAFETY HEADER\nUse rm -rf to clean directory";
    assert.equal(hasForbiddenKeywords(input), true);
  });

  it("detects 'format' keyword", () => {
    const input = "### SAFETY HEADER\nFormat the storage device";
    assert.equal(hasForbiddenKeywords(input), true);
  });

  it("detects 'destroy' keyword", () => {
    const input = "### SAFETY HEADER\nDestroy the old cluster";
    assert.equal(hasForbiddenKeywords(input), true);
  });

  it("allows safe operations without forbidden keywords", () => {
    const input =
      "### SAFETY HEADER\nUpdate configuration files with new values";
    assert.equal(hasForbiddenKeywords(input), false);
  });

  it("returns list of forbidden keywords found", () => {
    const input =
      "### SAFETY HEADER\nDelete old files and drop unused tables";
    const found = getForbiddenKeywordsFound(input);
    assert.deepEqual(found, ["drop", "delete"]);
  });

  it("case-insensitive keyword detection", () => {
    const input = "### SAFETY HEADER\nDESTRUCTIVE operation incoming";
    assert.equal(hasForbiddenKeywords(input), true);
  });
});

describe("Ops Planner - Operation Validation", () => {
  it("validates allowed operations", () => {
    const ops = ["config_read", "config_write", "monitoring_check"];
    assert.equal(areOperationsValid(ops), true);
  });

  it("rejects invalid operations", () => {
    const ops = ["config_read", "shell_execute"];
    assert.equal(areOperationsValid(ops), false);
  });

  it("identifies invalid operations", () => {
    const ops = ["config_read", "invalid_op", "monitoring_check", "bad_op"];
    const invalid = getInvalidOperations(ops);
    assert.deepEqual(invalid, ["invalid_op", "bad_op"]);
  });

  it("lists all allowed operations", () => {
    const allowed = [
      "config_read",
      "config_write",
      "infra_status",
      "monitoring_check",
      "log_analysis",
      "rollback_plan",
    ];
    allowed.forEach((op) => {
      assert.equal(areOperationsValid([op]), true);
    });
  });
});

describe("Ops Planner - Task Count Validation", () => {
  it("accepts 1-5 tasks", () => {
    for (let i = 1; i <= 5; i++) {
      const result = validateTaskCount(i);
      assert.equal(result.valid, true, `Should accept ${i} tasks`);
    }
  });

  it("rejects more than 5 tasks", () => {
    const result = validateTaskCount(6);
    assert.equal(result.valid, false);
    assert.ok(result.warning);
    assert.ok(
      result.warning!.includes("exceeds maximum of 5"),
      "Warning should mention max 5 constraint"
    );
  });

  it("rejects 10 tasks with warning", () => {
    const result = validateTaskCount(10);
    assert.equal(result.valid, false);
    assert.ok(result.warning);
  });
});

describe("Ops Planner - Task Structure Validation", () => {
  it("validates a complete task", () => {
    const task: Task = {
      task_id: "OPS-001",
      title: "Update config",
      description: "Update service configuration file",
      safe_operations: ["config_read", "config_write"],
      acceptance_criteria: "Config file updated and service restarted",
      estimated_duration_seconds: 300,
    };
    const result = validateTaskStructure(task);
    assert.equal(result.valid, true);
    assert.deepEqual(result.errors, []);
  });

  it("rejects task without task_id", () => {
    const task = {
      title: "Update config",
      description: "Update service configuration file",
      safe_operations: ["config_read", "config_write"],
      acceptance_criteria: "Config file updated",
      estimated_duration_seconds: 300,
    };
    const result = validateTaskStructure(task);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("task_id")));
  });

  it("rejects task without title", () => {
    const task = {
      task_id: "OPS-001",
      description: "Update service configuration file",
      safe_operations: ["config_read", "config_write"],
      acceptance_criteria: "Config file updated",
      estimated_duration_seconds: 300,
    };
    const result = validateTaskStructure(task);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("title")));
  });

  it("rejects task without description", () => {
    const task = {
      task_id: "OPS-001",
      title: "Update config",
      safe_operations: ["config_read", "config_write"],
      acceptance_criteria: "Config file updated",
      estimated_duration_seconds: 300,
    };
    const result = validateTaskStructure(task);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("description")));
  });

  it("rejects task with invalid safe_operations", () => {
    const task = {
      task_id: "OPS-001",
      title: "Update config",
      description: "Update service configuration file",
      safe_operations: ["config_read", "invalid_op"],
      acceptance_criteria: "Config file updated",
      estimated_duration_seconds: 300,
    };
    const result = validateTaskStructure(task);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("Invalid operations")));
  });

  it("rejects task without acceptance_criteria", () => {
    const task = {
      task_id: "OPS-001",
      title: "Update config",
      description: "Update service configuration file",
      safe_operations: ["config_read", "config_write"],
      estimated_duration_seconds: 300,
    };
    const result = validateTaskStructure(task);
    assert.equal(result.valid, false);
    assert.ok(
      result.errors.some((e) => e.includes("acceptance_criteria"))
    );
  });

  it("rejects task with invalid estimated_duration_seconds", () => {
    const task = {
      task_id: "OPS-001",
      title: "Update config",
      description: "Update service configuration file",
      safe_operations: ["config_read", "config_write"],
      acceptance_criteria: "Config file updated",
      estimated_duration_seconds: -1,
    };
    const result = validateTaskStructure(task);
    assert.equal(result.valid, false);
    assert.ok(
      result.errors.some((e) => e.includes("estimated_duration_seconds"))
    );
  });

  it("rejects task with string instead of number for estimated_duration_seconds", () => {
    const task = {
      task_id: "OPS-001",
      title: "Update config",
      description: "Update service configuration file",
      safe_operations: ["config_read", "config_write"],
      acceptance_criteria: "Config file updated",
      estimated_duration_seconds: "300",
    };
    const result = validateTaskStructure(task);
    assert.equal(result.valid, false);
  });

  it("accepts task with array acceptance_criteria", () => {
    const task: Task = {
      task_id: "OPS-001",
      title: "Update config",
      description: "Update service configuration file",
      safe_operations: ["config_read", "config_write"],
      acceptance_criteria: [
        "Config file exists",
        "Config file is valid",
      ],
      estimated_duration_seconds: 300,
    };
    const result = validateTaskStructure(task);
    assert.equal(result.valid, true);
  });

  it("accepts task with rollback_plan (optional)", () => {
    const task: Task = {
      task_id: "OPS-001",
      title: "Update config",
      description: "Update service configuration file",
      safe_operations: ["config_read", "config_write"],
      acceptance_criteria: "Config file updated",
      estimated_duration_seconds: 300,
      rollback_plan:
        "Restore from backup if update fails",
    };
    const result = validateTaskStructure(task);
    assert.equal(result.valid, true);
  });
});

describe("Ops Planner - Multiple Tasks Validation", () => {
  it("validates array of valid tasks", () => {
    const tasks = [
      {
        task_id: "OPS-001",
        title: "Update config",
        description: "Update service configuration file",
        safe_operations: ["config_read", "config_write"],
        acceptance_criteria: "Config file updated",
        estimated_duration_seconds: 300,
      },
      {
        task_id: "OPS-002",
        title: "Monitor logs",
        description: "Check log files for errors",
        safe_operations: ["log_analysis"],
        acceptance_criteria: "No critical errors found",
        estimated_duration_seconds: 60,
      },
    ];
    const result = validateTasks(tasks);
    assert.equal(result.valid, true);
    assert.deepEqual(result.errors, []);
  });

  it("reports errors for each invalid task", () => {
    const tasks = [
      {
        task_id: "OPS-001",
        // missing title
        description: "Update service configuration file",
        safe_operations: ["config_read", "config_write"],
        acceptance_criteria: "Config file updated",
        estimated_duration_seconds: 300,
      },
      {
        task_id: "OPS-002",
        title: "Monitor logs",
        // missing description
        safe_operations: ["log_analysis"],
        acceptance_criteria: "No critical errors found",
        estimated_duration_seconds: 60,
      },
    ];
    const result = validateTasks(tasks);
    assert.equal(result.valid, false);
    assert.equal(result.errors.length, 2);
  });

  it("rejects non-array tasks", () => {
    const result = validateTasks("not an array" as unknown as []);
    assert.equal(result.valid, false);
    assert.deepEqual(result.errors, ["Tasks must be an array"]);
  });
});

describe("Ops Planner - Task Planning Function", () => {
  it("rejects task without safety header", () => {
    const input = "Task: Check system status";
    const result = planOpsTask(input);
    assert.equal(result.status, "fail");
    assert.ok(result.error);
    assert.ok(
      result.error!.includes("Safety header"),
      "Error should mention safety header"
    );
  });

  it("rejects task with forbidden 'destructive' keyword", () => {
    const input = `
      ### SAFETY HEADER
      Do NOT run destructive commands.
      
      Task: destructive operation on database
    `;
    const result = planOpsTask(input);
    assert.equal(result.status, "fail");
    assert.ok(result.error);
    assert.ok(
      result.error!.includes("destructive"),
      "Error should mention destructive keyword"
    );
  });

  it("rejects task with forbidden 'delete' keyword", () => {
    const input = `
      ### SAFETY HEADER
      Do NOT run destructive commands.
      
      Task: delete old backup files
    `;
    const result = planOpsTask(input);
    assert.equal(result.status, "fail");
    assert.ok(result.error);
  });

  it("rejects task with multiple forbidden keywords", () => {
    const input = `
      ### SAFETY HEADER
      Do NOT run destructive commands.
      
      Task: drop tables and delete records
    `;
    const result = planOpsTask(input);
    assert.equal(result.status, "fail");
    assert.ok(result.error);
    assert.ok(
      result.error!.includes("drop") || result.error!.includes("delete"),
      "Error should mention forbidden keywords"
    );
  });

  it("accepts safe task with safety header", () => {
    const input = `
      ### SAFETY HEADER
      Workspace-safe operations only.
      
      Task: Update configuration files with new values
      Workspace: /tmp/ops-test
    `;
    const result = planOpsTask(input);
    assert.equal(result.status, "done");
    assert.ok(!result.error);
  });

  it("accepts safe task with SAFETY header variant", () => {
    const input = `
      SAFETY HEADER: Workspace-safe operations only
      
      Task: Monitor system metrics
    `;
    const result = planOpsTask(input);
    assert.equal(result.status, "done");
  });
});

describe("Ops Planner - Planner Output Validation", () => {
  it("validates successful output with tasks", () => {
    const output: PlannerOutput = {
      status: "done",
      tasks: [
        {
          task_id: "OPS-001",
          title: "Update config",
          description: "Update service configuration file",
          safe_operations: ["config_read", "config_write"],
          acceptance_criteria: "Config file updated",
          estimated_duration_seconds: 300,
        },
      ],
    };
    const result = validatePlannerOutput(output);
    assert.equal(result.valid, true);
    assert.deepEqual(result.errors, []);
  });

  it("validates failed output with error message", () => {
    const output: PlannerOutput = {
      status: "fail",
      error: "Safety header missing",
    };
    const result = validatePlannerOutput(output);
    assert.equal(result.valid, true);
  });

  it("rejects failed output without error message", () => {
    const output = {
      status: "fail",
    };
    const result = validatePlannerOutput(output);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("error message")));
  });

  it("rejects output with invalid status", () => {
    const output = {
      status: "pending",
      tasks: [],
    };
    const result = validatePlannerOutput(output);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("status")));
  });

  it("rejects output with invalid tasks array", () => {
    const output = {
      status: "done",
      tasks: "not an array",
    };
    const result = validatePlannerOutput(output);
    assert.equal(result.valid, false);
  });

  it("rejects done output with more than 5 tasks", () => {
    const tasks = Array.from({ length: 6 }, (_, i) => ({
      task_id: `OPS-${i + 1}`,
      title: `Task ${i + 1}`,
      description: "Test task",
      safe_operations: ["config_read"],
      acceptance_criteria: "Done",
      estimated_duration_seconds: 60,
    }));
    const output: PlannerOutput = {
      status: "done",
      tasks,
    };
    const result = validatePlannerOutput(output);
    assert.equal(result.valid, false);
  });

  it("validates done output with 5 tasks", () => {
    const tasks = Array.from({ length: 5 }, (_, i) => ({
      task_id: `OPS-${i + 1}`,
      title: `Task ${i + 1}`,
      description: "Test task",
      safe_operations: ["config_read"],
      acceptance_criteria: "Done",
      estimated_duration_seconds: 60,
    }));
    const output: PlannerOutput = {
      status: "done",
      tasks,
    };
    const result = validatePlannerOutput(output);
    assert.equal(result.valid, true);
  });
});

describe("Ops Planner - Integration Tests", () => {
  it("complete safe task planning workflow", () => {
    // Step 1: Validate input has safety header and no forbidden keywords
    const input = `
      ### SAFETY HEADER
      Workspace-safe operations only.
      
      Task: Update monitoring configuration
      Description: Update Prometheus config with new alerting rules
      Workspace: /tmp/ops-demo
    `;

    const hasSafetyResult = hasSafetyHeader(input);
    assert.equal(hasSafetyResult, true);

    const hasForbiddenResult = hasForbiddenKeywords(input);
    assert.equal(hasForbiddenResult, false);

    // Step 2: Plan the task
    const planResult = planOpsTask(input);
    assert.equal(planResult.status, "done");

    // Step 3: Create output with valid tasks
    const plannerOutput: PlannerOutput = {
      status: "done",
      tasks: [
        {
          task_id: "OPS-001",
          title: "Backup current config",
          description: "Create backup of current Prometheus configuration",
          safe_operations: ["config_read"],
          acceptance_criteria: "Backup file exists and is readable",
          estimated_duration_seconds: 30,
          rollback_plan: "Restore from backup if update fails",
        },
        {
          task_id: "OPS-002",
          title: "Update alerting rules",
          description: "Add new alerting rules to Prometheus config",
          safe_operations: ["config_write"],
          acceptance_criteria:
            "New rules appear in config file without syntax errors",
          estimated_duration_seconds: 60,
          rollback_plan: "Restore from OPS-001 backup",
        },
        {
          task_id: "OPS-003",
          title: "Verify configuration",
          description: "Validate Prometheus config for syntax errors",
          safe_operations: ["infra_status"],
          acceptance_criteria: "Prometheus validates config without errors",
          estimated_duration_seconds: 30,
          rollback_plan: "No rollback needed - validation only",
        },
      ],
      task_count: 3,
    };

    // Step 4: Validate output
    const outputValidation = validatePlannerOutput(plannerOutput);
    assert.equal(outputValidation.valid, true);
    assert.deepEqual(outputValidation.errors, []);

    // Step 5: Verify all tasks have required fields
    assert.ok(plannerOutput.tasks);
    plannerOutput.tasks.forEach((task, index) => {
      const taskValidation = validateTaskStructure(task);
      assert.equal(
        taskValidation.valid,
        true,
        `Task ${index} should be valid`
      );
    });
  });

  it("reject unsafe task planning workflow", () => {
    // Step 1: Input without safety header
    const inputWithoutSafety =
      "Task: Drop old database tables and clean up";
    assert.equal(hasSafetyHeader(inputWithoutSafety), false);

    const resultWithoutSafety = planOpsTask(inputWithoutSafety);
    assert.equal(resultWithoutSafety.status, "fail");
    assert.ok(resultWithoutSafety.error);

    // Step 2: Input with forbidden keyword
    const inputWithForbidden = `
      ### SAFETY HEADER
      Be careful here.
      
      Task: delete all temporary files from the system
    `;
    assert.equal(hasForbiddenKeywords(inputWithForbidden), true);

    const resultWithForbidden = planOpsTask(inputWithForbidden);
    assert.equal(resultWithForbidden.status, "fail");
    assert.ok(resultWithForbidden.error);
  });
});
