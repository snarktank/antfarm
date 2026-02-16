/**
 * Ops Planner - Validates and decomposes operational tasks into safe, executable steps.
 * 
 * Core responsibilities:
 * 1. Validate safety header presence
 * 2. Check for forbidden keywords (destructive operations)
 * 3. Decompose tasks into safe operations
 * 4. Enforce max 5 tasks per run
 * 5. Output structured TASKS_JSON
 */

export interface Task {
  task_id: string;
  title: string;
  description: string;
  safe_operations: string[];
  acceptance_criteria: string | string[];
  estimated_duration_seconds: number;
  rollback_plan?: string;
}

export interface PlannerOutput {
  status: "done" | "fail";
  tasks?: Task[];
  task_count?: number;
  warnings?: string[];
  error?: string;
}

const ALLOWED_OPERATIONS = [
  "config_read",
  "config_write",
  "infra_status",
  "monitoring_check",
  "log_analysis",
  "rollback_plan",
];

const FORBIDDEN_KEYWORDS = [
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

const SAFETY_HEADER_MARKER = "SAFETY HEADER";

/**
 * Validates that the task input includes a safety header
 */
export function hasSafetyHeader(input: string): boolean {
  return input.includes(SAFETY_HEADER_MARKER) || input.includes("### SAFETY");
}

/**
 * Checks if the task contains any forbidden keywords
 */
export function hasForbiddenKeywords(input: string): boolean {
  const lowerInput = input.toLowerCase();
  return FORBIDDEN_KEYWORDS.some((keyword) => lowerInput.includes(keyword));
}

/**
 * Gets the forbidden keywords found in the input
 */
export function getForbiddenKeywordsFound(input: string): string[] {
  const lowerInput = input.toLowerCase();
  return FORBIDDEN_KEYWORDS.filter((keyword) =>
    lowerInput.includes(keyword)
  );
}

/**
 * Validates that all operations in a task are from the allowed list
 */
export function areOperationsValid(operations: string[]): boolean {
  return operations.every((op) => ALLOWED_OPERATIONS.includes(op));
}

/**
 * Gets invalid operations found in a task
 */
export function getInvalidOperations(operations: string[]): string[] {
  return operations.filter((op) => !ALLOWED_OPERATIONS.includes(op));
}

/**
 * Validates task count against max 5 per run
 */
export function validateTaskCount(taskCount: number): {
  valid: boolean;
  warning?: string;
} {
  if (taskCount > 5) {
    return {
      valid: false,
      warning: `Task count (${taskCount}) exceeds maximum of 5 per run. Please decompose into fewer tasks or split into multiple runs.`,
    };
  }
  return { valid: true };
}

/**
 * Validates a single task structure
 */
export function validateTaskStructure(
  task: unknown
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (typeof task !== "object" || task === null) {
    errors.push("Task must be an object");
    return { valid: false, errors };
  }

  const t = task as Record<string, unknown>;

  // Check required fields
  if (!t.task_id || typeof t.task_id !== "string") {
    errors.push("Task must have task_id (string)");
  }
  if (!t.title || typeof t.title !== "string") {
    errors.push("Task must have title (string)");
  }
  if (!t.description || typeof t.description !== "string") {
    errors.push("Task must have description (string)");
  }
  if (!Array.isArray(t.safe_operations)) {
    errors.push("Task must have safe_operations (array)");
  } else {
    const invalidOps = getInvalidOperations(
      t.safe_operations as string[]
    );
    if (invalidOps.length > 0) {
      errors.push(
        `Invalid operations: ${invalidOps.join(", ")}. Allowed: ${ALLOWED_OPERATIONS.join(", ")}`
      );
    }
  }
  if (!t.acceptance_criteria) {
    errors.push("Task must have acceptance_criteria (string or array)");
  }
  if (
    typeof t.estimated_duration_seconds !== "number" ||
    t.estimated_duration_seconds <= 0
  ) {
    errors.push("Task must have estimated_duration_seconds (positive number)");
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validates all tasks in an array
 */
export function validateTasks(tasks: unknown[]): {
  valid: boolean;
  errors: string[];
} {
  const allErrors: string[] = [];

  if (!Array.isArray(tasks)) {
    return {
      valid: false,
      errors: ["Tasks must be an array"],
    };
  }

  tasks.forEach((task, index) => {
    const validation = validateTaskStructure(task);
    if (!validation.valid) {
      allErrors.push(
        `Task ${index}: ${validation.errors.join("; ")}`
      );
    }
  });

  return { valid: allErrors.length === 0, errors: allErrors };
}

/**
 * Plans an operational task with safety validation
 * 
 * @param input - The full input including safety header and task description
 * @returns PlannerOutput with status and tasks (if successful) or error message
 */
export function planOpsTask(input: string): PlannerOutput {
  const warnings: string[] = [];

  // Step 1: Validate safety header
  if (!hasSafetyHeader(input)) {
    return {
      status: "fail",
      error: "Safety header missing. All ops tasks must include 'SAFETY HEADER' section.",
    };
  }

  // Step 2: Check for forbidden keywords
  const forbiddenFound = getForbiddenKeywordsFound(input);
  if (forbiddenFound.length > 0) {
    return {
      status: "fail",
      error: `Forbidden keywords detected: ${forbiddenFound.join(", ")}. These operations are not allowed in ops tasks.`,
    };
  }

  // Note: In a real implementation, this would use an AI to actually decompose the task.
  // For now, this validates the structure and provides the framework.
  // The actual task decomposition would happen via the AI agent in the workflow.

  return {
    status: "done",
    task_count: 0,
    warnings,
  };
}

/**
 * Validates a planner output structure
 */
export function validatePlannerOutput(output: unknown): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (typeof output !== "object" || output === null) {
    errors.push("Output must be an object");
    return { valid: false, errors };
  }

  const o = output as Record<string, unknown>;

  if (!["done", "fail"].includes(o.status as string)) {
    errors.push("Output must have status: 'done' or 'fail'");
  }

  if (o.status === "done" && o.tasks) {
    if (!Array.isArray(o.tasks)) {
      errors.push("If status is 'done', tasks must be an array");
    } else {
      const taskValidation = validateTasks(o.tasks);
      if (!taskValidation.valid) {
        errors.push(...taskValidation.errors);
      }

      const countValidation = validateTaskCount(o.tasks.length);
      if (!countValidation.valid && countValidation.warning) {
        errors.push(countValidation.warning);
      }
    }
  }

  if (o.status === "fail" && !o.error) {
    errors.push("If status is 'fail', error message must be provided");
  }

  return { valid: errors.length === 0, errors };
}
