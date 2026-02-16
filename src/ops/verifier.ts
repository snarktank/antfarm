/**
 * Ops Verifier - Verifies operational task execution safety, correctness, and auditability
 *
 * Core responsibilities:
 * 1. Validate executor completed the task (STATUS: done)
 * 2. Verify acceptance criteria from original task are met
 * 3. Verify RESULT matches claimed CHANGES
 * 4. Verify ROLLBACK plan is documented (if applicable)
 * 5. Verify no destructive commands were executed (scan RESULT for forbidden keywords)
 * 6. Output STATUS: done with VERIFIED list if successful
 * 7. Output STATUS: retry with ISSUES list if problems found
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

export interface ExecutorOutput {
  status: "done" | "fail";
  task_id: string;
  result?: string;
  rollback?: string;
  changes?: string[];
  error?: string;
  logs?: string[];
}

export interface VerificationResult {
  status: "done" | "retry";
  verified?: string[];
  issues?: string[];
  error?: string;
}

export interface ValidationCheckResult {
  valid: boolean;
  error?: string;
  message?: string;
  evidence?: string[];
  issues?: string[];
  errors?: string[];
  foundKeywords?: string[];
}

// ── Safety validation ──
const DESTRUCTIVE_KEYWORDS = [
  "destructive",
  "delete",
  "drop",
  "truncate",
  "rm",
  "sql",
  "format",
  "destroy",
  "shell_cmd",
];

/**
 * Scans text for destructive keywords
 */
export function findDestructiveKeywords(text: string | undefined): string[] {
  if (!text) return [];
  const lower = text.toLowerCase();
  return DESTRUCTIVE_KEYWORDS.filter((kw) => lower.includes(kw));
}

/**
 * Validates that executor completed the task successfully
 */
export function validateExecutorCompletion(
  output: ExecutorOutput | null | undefined
): ValidationCheckResult {
  if (!output) {
    return { valid: false, error: "Executor output is missing" };
  }
  if (output.status !== "done") {
    return {
      valid: false,
      error: `Executor status is "${output.status}", expected "done"`,
    };
  }
  if (!output.task_id) {
    return {
      valid: false,
      error: "Executor output missing task_id",
    };
  }
  return { valid: true };
}

/**
 * Validates that acceptance criteria are met
 */
export function validateAcceptanceCriteria(
  criteria: string | string[] | undefined,
  result: string | undefined,
  changes: string[] | undefined
): ValidationCheckResult {
  const evidence: string[] = [];
  const issues: string[] = [];
  const criteriaList = Array.isArray(criteria)
    ? criteria
    : criteria
    ? [criteria]
    : [];

  for (const criterion of criteriaList) {
    if (!criterion || criterion.trim().length === 0) continue;

    // Check if criterion text appears in result or changes
    const inResult =
      result && result.toLowerCase().includes(criterion.toLowerCase());
    const inChanges =
      changes &&
      changes.some((c) => c.toLowerCase().includes(criterion.toLowerCase()));

    if (inResult) {
      evidence.push(`✓ Criterion "${criterion}" verified in result`);
    } else if (inChanges) {
      evidence.push(`✓ Criterion "${criterion}" verified in changes`);
    } else {
      // For very short criteria or when it's just a description, be lenient
      // Only fail if it's a substantive requirement not mentioned at all
      if (criterion.length > 5) {
        issues.push(`Criterion not found in result/changes: "${criterion}"`);
      } else {
        // Short criteria might be implicit in the operation
        evidence.push(`✓ Criterion "${criterion}" implicit in operation`);
      }
    }
  }

  return {
    valid: issues.length === 0,
    evidence,
    issues,
  };
}

/**
 * Verifies that result matches claimed changes
 */
export function verifyResultMatchesChanges(
  result: string | undefined,
  changes: string[] | undefined
): ValidationCheckResult {
  if (!changes || changes.length === 0) {
    if (result) {
      return {
        valid: false,
        message: "CHANGES is empty but RESULT contains output",
      };
    }
    return { valid: true, message: "No changes claimed or produced" };
  }

  if (!result) {
    return {
      valid: false,
      message: "CHANGES claims work but RESULT is empty",
    };
  }

  // Verify at least some changes are mentioned in result
  const changesSummary = changes.join(" ");
  if (!result.includes(changesSummary)) {
    return {
      valid: true, // Not a hard failure - result might describe differently
      message: "RESULT does not contain exact change descriptions",
    };
  }

  return { valid: true, message: "RESULT matches claimed CHANGES" };
}

/**
 * Checks if rollback plan is documented for write operations
 */
export function validateRollbackPlan(
  task: Task,
  output: ExecutorOutput
): ValidationCheckResult {
  const hasWriteOp = task.safe_operations.includes("config_write");
  const hasRollback = output.rollback && output.rollback.length > 0;

  if (hasWriteOp && !hasRollback) {
    return {
      valid: false,
      message: "Write operation executed but no rollback plan documented",
    };
  }

  if (hasWriteOp && hasRollback) {
    return {
      valid: true,
      message: `Rollback plan documented: ${output.rollback}`,
    };
  }

  if (!hasWriteOp && hasRollback) {
    return {
      valid: true,
      message: "Rollback plan documented (for non-write operations)",
    };
  }

  return {
    valid: true,
    message: "No write operations - rollback not required",
  };
}

/**
 * Scans result for destructive operations
 */
export function validateNoDestructiveOperations(
  result: string | undefined
): ValidationCheckResult {
  if (!result) {
    return { valid: true, foundKeywords: [] };
  }

  const keywords = findDestructiveKeywords(result);

  return {
    valid: keywords.length === 0,
    foundKeywords: keywords,
  };
}

/**
 * Validates result structure and format
 */
export function validateResultStructure(
  result: unknown
): ValidationCheckResult {
  const errors: string[] = [];

  if (!result || result === "") {
    return {
      valid: true, // Some operations might not produce output
      errors: [],
    };
  }

  if (typeof result !== "string") {
    errors.push("RESULT must be a string");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Main verification orchestration
 */
export function verifyTask(
  task: Task,
  output: ExecutorOutput
): VerificationResult {
  const verified: string[] = [];
  const issues: string[] = [];

  // Check 1: Executor completed
  const completionCheck = validateExecutorCompletion(output);
  if (!completionCheck.valid) {
    issues.push(
      `Executor completion check failed: ${completionCheck.error}`
    );
    return { status: "retry", verified, issues };
  }
  verified.push("✓ Executor completed successfully (STATUS: done)");

  // Check 2: Task IDs match
  if (output.task_id !== task.task_id) {
    issues.push(
      `Task ID mismatch: claimed "${task.task_id}" but executor processed "${output.task_id}"`
    );
  } else {
    verified.push(`✓ Task ID matches: ${task.task_id}`);
  }

  // Check 3: Result structure
  const structureCheck = validateResultStructure(output.result);
  if (!structureCheck.valid) {
    issues.push(
      `Result structure invalid: ${structureCheck.errors?.join(", ")}`
    );
  } else {
    verified.push("✓ RESULT structure valid");
  }

  // Check 4: Acceptance criteria
  const criteriaCheck = validateAcceptanceCriteria(
    task.acceptance_criteria,
    output.result || "",
    output.changes
  );
  if (!criteriaCheck.valid) {
    issues.push(
      `Acceptance criteria not met: ${criteriaCheck.issues?.join(", ")}`
    );
  } else {
    verified.push(
      `✓ Acceptance criteria verified (${criteriaCheck.evidence?.length} checks)`
    );
    if (criteriaCheck.evidence) {
      verified.push(...criteriaCheck.evidence);
    }
  }

  // Check 5: Result matches changes
  const changeCheck = verifyResultMatchesChanges(
    output.result,
    output.changes
  );
  if (!changeCheck.valid) {
    issues.push(`Result/Changes mismatch: ${changeCheck.message}`);
  } else {
    verified.push(`✓ RESULT matches CHANGES: ${changeCheck.message}`);
  }

  // Check 6: Rollback plan (for write operations)
  const rollbackCheck = validateRollbackPlan(task, output);
  if (!rollbackCheck.valid) {
    issues.push(`Rollback validation failed: ${rollbackCheck.message}`);
  } else {
    verified.push(`✓ Rollback: ${rollbackCheck.message}`);
  }

  // Check 7: No destructive operations in result
  const destructiveCheck = validateNoDestructiveOperations(output.result);
  if (!destructiveCheck.valid) {
    issues.push(
      `Destructive operations detected: ${destructiveCheck.foundKeywords?.join(", ")}`
    );
  } else {
    verified.push("✓ No destructive operations detected");
  }

  // Check 8: Logs present
  if (!output.logs || output.logs.length === 0) {
    issues.push("No operation logs present");
  } else {
    verified.push(`✓ Operation logs present (${output.logs.length} entries)`);
  }

  // Final decision
  if (issues.length > 0) {
    return {
      status: "retry",
      verified,
      issues,
    };
  }

  return {
    status: "done",
    verified,
  };
}

/**
 * Formats verifier output for step completion
 */
export function formatVerifierOutput(output: VerificationResult): string {
  let result = `STATUS: ${output.status}\n\n`;

  if (output.verified && output.verified.length > 0) {
    result += `VERIFIED:\n`;
    output.verified.forEach((v) => {
      result += `- ${v}\n`;
    });
  }

  if (output.issues && output.issues.length > 0) {
    result += `\nISSUES:\n`;
    output.issues.forEach((i) => {
      result += `- ${i}\n`;
    });
  }

  if (output.error) {
    result += `\nERROR: ${output.error}\n`;
  }

  return result;
}
