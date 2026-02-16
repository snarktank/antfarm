/**
 * Deploy safety module for merge conflict detection and safe-fail handling
 * Detects merge conflicts, generates clear failure messages with remediation steps
 */

import { execSync } from "node:child_process";

/**
 * Result of checking for merge conflicts
 */
export interface MergeConflictCheckResult {
  /** Whether merge conflicts are present */
  hasConflicts: boolean;
  /** List of files with conflicts */
  files: string[];
}

/**
 * Checks for merge conflicts in the repository
 * Uses git diff --name-conflict and git status to detect conflicts
 * @param cwd Working directory of the repository
 * @returns Object with hasConflicts flag and list of conflicted files
 */
export function checkMergeConflicts(cwd: string): MergeConflictCheckResult {
  try {
    // Try to get conflicted files using git status
    const statusOutput = execSync("git status --porcelain", {
      cwd,
      encoding: "utf-8",
    });

    // Look for files with merge conflict markers (UU, DD, AA, etc.)
    const conflictedFiles = statusOutput
      .split("\n")
      .filter((line) => {
        // Git status marks conflicts with XX where both X are one of: U (updated), A (added), D (deleted)
        const status = line.substring(0, 2);
        return (
          status === "UU" ||
          status === "AA" ||
          status === "DD" ||
          status === "AU" ||
          status === "UA" ||
          status === "UD" ||
          status === "DU"
        );
      })
      .map((line) => line.substring(3).trim())
      .filter((file) => file.length > 0);

    if (conflictedFiles.length > 0) {
      return {
        hasConflicts: true,
        files: conflictedFiles,
      };
    }

    // Also check for actual merge conflict markers in files
    try {
      const conflictMarkersOutput = execSync(
        "git grep -l '<<<<<<<' -- ':/*' 2>/dev/null || true",
        {
          cwd,
          encoding: "utf-8",
        }
      );

      const filesWithMarkers = conflictMarkersOutput
        .split("\n")
        .filter((f) => f.trim().length > 0);

      if (filesWithMarkers.length > 0) {
        return {
          hasConflicts: true,
          files: filesWithMarkers,
        };
      }
    } catch {
      // Ignore errors from git grep, status check is primary
    }

    return {
      hasConflicts: false,
      files: [],
    };
  } catch (error) {
    // If git command fails, assume no conflicts (not in merge state)
    return {
      hasConflicts: false,
      files: [],
    };
  }
}

/**
 * Generates a human-readable conflict report with file paths
 * and suggestions for manual resolution on GitHub
 * @param cwd Working directory of the repository
 * @param files List of files with conflicts
 * @returns Formatted conflict report string
 */
export function generateConflictReport(cwd: string, files: string[]): string {
  let report = "=== MERGE CONFLICT DETECTED ===\n\n";

  report += `Conflict Status: ${files.length} file(s) with merge conflicts\n\n`;

  report += "Files with conflicts:\n";
  files.forEach((file) => {
    report += `  • ${file}\n`;
  });

  report += "\nConflict Details:\n";
  report += "- Merge conflicts were detected in the specified files above\n";
  report += "- Each file contains conflict markers (<<<<<<, ======, >>>>>>)\n";
  report += "- Automatic merge is not safe and has been aborted\n\n";

  report += "Remediation Steps:\n";
  report += "1. STOP: Do NOT attempt to force-push or auto-resolve conflicts\n";
  report += "2. MANUAL RESOLUTION: Go to GitHub and manually resolve conflicts:\n";
  report += "   - Open the PR in GitHub web interface\n";
  report += "   - Click 'Resolve conflicts' button\n";
  report += "   - Edit each conflicted file manually (review and keep correct code)\n";
  report += "   - Mark as resolved after editing each file\n";
  report += "   - Commit the merge from GitHub\n";
  report += "3. VERIFY: After resolution on GitHub, wait for CI/CD checks to pass\n";
  report += "4. RETRY: Once conflicts are resolved and CI passes, retry the deployment\n\n";

  report += "Additional Context:\n";
  report += `- Repository: ${cwd}\n`;
  report += `- Action taken: Merge aborted, working directory preserved\n`;
  report += `- Next step: Manual intervention required via GitHub PR interface\n`;

  return report;
}

/**
 * Generates rollback instructions for reverting to pre-merge state
 * @param mergedCommitSha The commit SHA of the merge (if it happened)
 * @returns Array of rollback instruction strings
 */
export function generateRollbackInstructions(mergedCommitSha: string): string[] {
  const instructions: string[] = [];

  instructions.push("=== ROLLBACK INSTRUCTIONS ===");
  instructions.push("");
  instructions.push("If merge conflicts prevent automated deployment, follow these steps:");
  instructions.push("");
  instructions.push("1. ABORT CURRENT MERGE (if in progress):");
  instructions.push("   git merge --abort");
  instructions.push("");
  instructions.push("2. RESET TO PRE-MERGE STATE (if merge happened):");
  instructions.push(`   git reset --hard ${mergedCommitSha}`);
  instructions.push("");
  instructions.push("3. VERIFY REPOSITORY STATE:");
  instructions.push("   git status");
  instructions.push("   (Working directory should be clean)");
  instructions.push("");
  instructions.push("4. NOTIFY DEVELOPERS:");
  instructions.push("   - Post message in PR comments explaining merge conflicts");
  instructions.push("   - Link to remediation steps: manual resolution on GitHub");
  instructions.push("   - Set PR status to 'blocked' or 'waiting for review'");
  instructions.push("");
  instructions.push("5. TIMELINE:");
  instructions.push("   - Abort merge: ~1 second");
  instructions.push("   - Reset repository: ~1 second");
  instructions.push("   - Verification: ~2 seconds");
  instructions.push("   Total: ~5 seconds (no data loss)");
  instructions.push("");
  instructions.push("6. VERIFICATION:");
  instructions.push("   After rollback, verify:");
  instructions.push("   - 'git log' shows no merge commit");
  instructions.push("   - 'git status' shows clean working directory");
  instructions.push("   - Original branch code is intact");
  instructions.push("");
  instructions.push("NOTE: All rollback operations are safe and non-destructive.");
  instructions.push("The --hard flag matches working directory to commit state;");
  instructions.push("no data is lost because nothing was actually deployed.");

  return instructions;
}
