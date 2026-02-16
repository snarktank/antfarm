import { execSync } from "node:child_process";

/**
 * Result of a GitHub PR status check
 */
export interface PRStatus {
  status: string;
  approved: boolean;
  mergeable: boolean;
  number: number;
  title: string;
}

/**
 * Result of a PR merge operation
 */
export interface PRMergeResult {
  success: boolean;
  mergedCommitSha?: string;
  rollbackInstructions: string[];
  conflict?: boolean;
  message?: string;
  errors?: string[];
}

/**
 * Gets PR status from GitHub using gh CLI
 * Returns: { status, approved, mergeable, number, title }
 */
export function getPRStatus(prNumber: number, repo: string): PRStatus {
  try {
    // Get PR status using gh CLI
    // This requires gh CLI to be installed and authenticated
    const prJson = execSync(
      `gh pr view ${prNumber} --repo ${repo} --json status,reviews,mergeable,number,title`,
      {
        encoding: "utf-8",
      }
    );

    const prData = JSON.parse(prJson);

    // Check if PR is approved
    // In gh CLI JSON output, reviews contain the review state
    const reviews = prData.reviews || [];
    const approved =
      reviews.some(
        (review: { state: string }) => review.state === "APPROVED"
      ) || false;

    return {
      status: prData.status,
      approved,
      mergeable: prData.mergeable === "MERGEABLE",
      number: prData.number,
      title: prData.title,
    };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to get PR status: ${errMsg}`);
  }
}

/**
 * Detects merge conflicts for a PR before merging
 * Returns success: false with conflict: true if conflicts are detected
 */
export function detectMergeConflicts(
  prNumber: number,
  repo: string
): PRMergeResult {
  try {
    // Use gh CLI to check if PR has merge conflicts
    const prJson = execSync(
      `gh pr view ${prNumber} --repo ${repo} --json mergeable,number`,
      {
        encoding: "utf-8",
      }
    );

    const prData = JSON.parse(prJson);

    if (prData.mergeable === "CONFLICTING") {
      return {
        success: false,
        conflict: true,
        message: `PR #${prNumber} has merge conflicts and cannot be merged automatically`,
        rollbackInstructions: [
          "Manual resolution: Ask developer to resolve conflicts on the PR branch",
          "Once resolved, re-run merge operation",
        ],
      };
    }

    return {
      success: true,
      rollbackInstructions: ["No merge conflicts detected"],
    };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      message: `Failed to detect merge conflicts: ${errMsg}`,
      rollbackInstructions: [
        "Manual check: Use gh pr view to verify merge status",
      ],
      errors: [errMsg],
    };
  }
}

/**
 * Merges a PR with squash using gh CLI, with safety checks and dry-run support
 * - Verifies PR is approved before merging
 * - Detects merge conflicts
 * - Supports dry-run mode (logs command without executing)
 * - Returns { success, mergedCommitSha, rollbackInstructions } on success
 * - Returns { success: false, conflict: true, message } if conflicts exist
 */
export function mergePRWithSquash(
  prNumber: number,
  repo: string,
  dryRun: boolean
): PRMergeResult {
  try {
    // Step 1: Check PR status and approval
    const prStatus = getPRStatus(prNumber, repo);

    if (!prStatus.approved) {
      return {
        success: false,
        message: `PR #${prNumber} is not approved. Status: ${prStatus.status}`,
        rollbackInstructions: [
          "Ask for PR approval from required reviewers",
          `Once approved, re-run: gh pr merge ${prNumber} --squash --repo ${repo}`,
        ],
      };
    }

    if (!prStatus.mergeable) {
      return {
        success: false,
        message: `PR #${prNumber} is not mergeable. Status: ${prStatus.status}`,
        rollbackInstructions: [
          "Check PR status for conflicts or checks",
          "Fix failing checks or resolve conflicts",
          `Re-run merge once PR is ready`,
        ],
      };
    }

    // Step 2: Detect merge conflicts
    const conflictResult = detectMergeConflicts(prNumber, repo);
    if (!conflictResult.success) {
      return conflictResult;
    }

    // Step 3: Merge with squash
    const mergeCmd = `gh pr merge ${prNumber} --squash --repo ${repo}`;

    if (dryRun) {
      return {
        success: true,
        message: `[DRY-RUN] Would execute: ${mergeCmd}`,
        rollbackInstructions: [
          "No changes made in dry-run mode",
          "Re-run without --dry-run flag to execute merge",
        ],
      };
    }

    // Execute the merge
    const mergeOutput = execSync(mergeCmd, {
      encoding: "utf-8",
    });

    // Extract merged commit SHA from output or get it from git
    let mergedCommitSha = "";
    try {
      // The gh CLI output usually contains the commit sha
      const shaMatch = mergeOutput.match(/[a-f0-9]{40}|[a-f0-9]{7}/);
      mergedCommitSha = shaMatch ? shaMatch[0] : "unknown";
    } catch {
      mergedCommitSha = "unknown";
    }

    return {
      success: true,
      mergedCommitSha,
      message: `PR #${prNumber} merged successfully`,
      rollbackInstructions: [
        `Rollback: gh pr revert ${prNumber} --repo ${repo}`,
        `Verify: git log --oneline | head -3`,
        `If revert fails, manual: git revert ${mergedCommitSha}`,
      ],
    };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);

    // Check if error indicates merge conflicts
    if (errMsg.includes("conflict") || errMsg.includes("CONFLICT")) {
      return {
        success: false,
        conflict: true,
        message: `Merge failed due to conflicts: ${errMsg}`,
        rollbackInstructions: [
          "No merge state modified by this operation",
          "Developer must resolve conflicts and push fixes",
        ],
        errors: [errMsg],
      };
    }

    return {
      success: false,
      message: `Failed to merge PR #${prNumber}: ${errMsg}`,
      rollbackInstructions: [
        `Verify PR state: gh pr view ${prNumber} --repo ${repo}`,
        "Manual merge if needed, or contact platform team",
      ],
      errors: [errMsg],
    };
  }
}

/**
 * Gets PR number from a string identifier or branch name
 * Useful for CI/CD integration
 */
export function getPRNumber(prIdentifier: string): number {
  // Extract PR number from various formats:
  // - "123" -> 123
  // - "#123" -> 123
  // - "PR-123" -> 123
  // - Branch name like "feat/issue-123" -> extract if possible
  const match = prIdentifier.match(/\d+/);
  if (!match) {
    throw new Error(`Could not extract PR number from: ${prIdentifier}`);
  }
  return parseInt(match[0], 10);
}
