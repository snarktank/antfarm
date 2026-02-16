import { execSync } from "node:child_process";
import path from "node:path";

export interface DeployResult {
  success: boolean;
  output: string;
  rollbackInstructions: string[];
  errors?: string[];
}

/**
 * Ensures git working directory is clean (no uncommitted changes)
 */
export function ensureClean(cwd: string, dryRun: boolean): DeployResult {
  const rollbackInstructions: string[] = [];
  const errors: string[] = [];

  try {
    if (dryRun) {
      return {
        success: true,
        output: "[DRY-RUN] Would check git status for uncommitted changes",
        rollbackInstructions: [],
      };
    }

    const status = execSync("git status --porcelain", { cwd, encoding: "utf-8" });

    if (status.trim()) {
      errors.push("Working directory not clean: uncommitted changes exist");
      return {
        success: false,
        output: `Git status: ${status}`,
        rollbackInstructions: [],
        errors,
      };
    }

    return {
      success: true,
      output: "Working directory is clean",
      rollbackInstructions: [],
    };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    errors.push(`Failed to check git status: ${errMsg}`);
    return {
      success: false,
      output: "",
      rollbackInstructions: [],
      errors,
    };
  }
}

/**
 * Pulls latest changes from remote branch
 */
export function pullLatest(cwd: string, dryRun: boolean, branch: string): DeployResult {
  const rollbackInstructions: string[] = [];
  const errors: string[] = [];

  try {
    if (dryRun) {
      return {
        success: true,
        output: `[DRY-RUN] Would pull latest from origin/${branch}`,
        rollbackInstructions: [],
      };
    }

    // Get current commit SHA before pull
    const beforeSha = execSync("git rev-parse HEAD", {
      cwd,
      encoding: "utf-8",
    }).trim();

    // Perform the pull
    const output = execSync(`git pull origin ${branch}`, {
      cwd,
      encoding: "utf-8",
    });

    rollbackInstructions.push(
      `Rollback: git reset --hard ${beforeSha}`,
      `Verify: git log -1 --oneline`
    );

    return {
      success: true,
      output,
      rollbackInstructions,
    };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    errors.push(`Failed to pull latest: ${errMsg}`);
    rollbackInstructions.push("No changes made - no rollback needed");
    return {
      success: false,
      output: "",
      rollbackInstructions,
      errors,
    };
  }
}

/**
 * Installs dependencies using specified package manager
 */
export function installDeps(
  cwd: string,
  dryRun: boolean,
  packageManager: "npm" | "bun"
): DeployResult {
  const rollbackInstructions: string[] = [];
  const errors: string[] = [];

  try {
    const installCmd = packageManager === "bun" ? "bun install" : "npm install";

    if (dryRun) {
      return {
        success: true,
        output: `[DRY-RUN] Would run: ${installCmd}`,
        rollbackInstructions: [
          "Rollback: delete node_modules/ and package-lock.json (or bun.lockb)",
          "Verify: npm list (or bun list) to check installed versions"
        ],
      };
    }

    const output = execSync(installCmd, {
      cwd,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });

    rollbackInstructions.push(
      "Rollback: delete node_modules/ and package-lock.json (or bun.lockb)",
      "Verify: npm list (or bun list) to check installed versions"
    );

    return {
      success: true,
      output,
      rollbackInstructions,
    };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    errors.push(`Failed to install dependencies: ${errMsg}`);
    rollbackInstructions.push("Remove node_modules/ to clean up partial installation");
    return {
      success: false,
      output: "",
      rollbackInstructions,
      errors,
    };
  }
}

/**
 * Runs build command
 */
export function runBuild(cwd: string, dryRun: boolean, buildCmd: string): DeployResult {
  const rollbackInstructions: string[] = [];
  const errors: string[] = [];

  try {
    if (dryRun) {
      return {
        success: true,
        output: `[DRY-RUN] Would run: ${buildCmd}`,
        rollbackInstructions: [
          "Rollback: rm -rf dist/ (or equivalent build output directory)",
          "Verify: ls -la dist/ to confirm build artifacts removed"
        ],
      };
    }

    const output = execSync(buildCmd, {
      cwd,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });

    rollbackInstructions.push(
      "Rollback: rm -rf dist/ (or equivalent build output directory)",
      `Verify: ls -la dist/ to confirm build artifacts removed`
    );

    return {
      success: true,
      output,
      rollbackInstructions,
    };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    errors.push(`Build failed: ${errMsg}`);
    rollbackInstructions.push("No persistent changes made by build - check source code for issues");
    return {
      success: false,
      output: "",
      rollbackInstructions,
      errors,
    };
  }
}

/**
 * Runs test command
 */
export function runTests(cwd: string, dryRun: boolean, testCmd: string): DeployResult {
  const rollbackInstructions: string[] = [];
  const errors: string[] = [];

  try {
    if (dryRun) {
      return {
        success: true,
        output: `[DRY-RUN] Would run: ${testCmd}`,
        rollbackInstructions: [
          "Rollback: No state changes - tests are read-only"
        ],
      };
    }

    const output = execSync(testCmd, {
      cwd,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });

    rollbackInstructions.push(
      "Rollback: No state changes - tests are read-only"
    );

    return {
      success: true,
      output,
      rollbackInstructions,
    };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    errors.push(`Tests failed: ${errMsg}`);
    rollbackInstructions.push("No state changes - fix test failures and retry");
    return {
      success: false,
      output: "",
      rollbackInstructions,
      errors,
    };
  }
}

/**
 * Detects merge conflicts when attempting to merge target branch
 */
export function detectMergeConflict(cwd: string, targetBranch: string): DeployResult {
  const rollbackInstructions: string[] = [];
  const errors: string[] = [];

  try {
    // Fetch latest to ensure we have the latest remote branch
    try {
      execSync("git fetch origin", { cwd, encoding: "utf-8", stdio: "pipe" });
    } catch {
      // Fetch might fail but we'll continue to check
    }

    // Try a dry-run merge to detect conflicts without modifying state
    const mergeTest = execSync(
      `git merge --no-commit --no-ff origin/${targetBranch} --dry-run 2>&1 || true`,
      {
        cwd,
        encoding: "utf-8",
        shell: "/bin/bash",
      }
    ) as string;

    // Check if output indicates conflicts
    if (mergeTest.includes("CONFLICT") || mergeTest.includes("Merge made by")) {
      errors.push(`Merge conflicts detected with ${targetBranch}`);
      rollbackInstructions.push(
        "No changes made in dry-run",
        `Manual resolution: git merge --abort`,
        "Ask developers to resolve conflicts manually before deployment"
      );
      return {
        success: false,
        output: mergeTest,
        rollbackInstructions,
        errors,
      };
    }

    // Abort the test merge if it was created
    try {
      execSync("git merge --abort 2>&1 || true", {
        cwd,
        shell: "/bin/bash",
        stdio: "pipe",
      });
    } catch {
      // Ignore if abort fails (might not be in a merge state)
    }

    return {
      success: true,
      output: `No conflicts detected with ${targetBranch}`,
      rollbackInstructions: ["No merge state created - no rollback needed"],
    };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    errors.push(`Failed to detect merge conflicts: ${errMsg}`);
    
    // Ensure we're not in a merge state
    try {
      execSync("git merge --abort 2>&1 || true", {
        cwd,
        shell: "/bin/bash",
        stdio: "pipe",
      });
    } catch {
      // Ignore
    }

    rollbackInstructions.push("git merge --abort (if merge state was created)");
    return {
      success: false,
      output: "",
      rollbackInstructions,
      errors,
    };
  }
}

/**
 * Merges specified branch into current branch (with conflict detection)
 */
export function mergeWithConflictCheck(cwd: string, sourceBranch: string): DeployResult {
  const rollbackInstructions: string[] = [];
  const errors: string[] = [];

  try {
    // First detect conflicts
    const conflictCheck = detectMergeConflict(cwd, sourceBranch);
    if (!conflictCheck.success) {
      return conflictCheck;
    }

    // Get current commit SHA before merge
    const beforeSha = execSync("git rev-parse HEAD", {
      cwd,
      encoding: "utf-8",
    }).trim();

    // Perform the merge
    const output = execSync(`git merge --no-ff -m "Merge ${sourceBranch}" origin/${sourceBranch}`, {
      cwd,
      encoding: "utf-8",
    });

    rollbackInstructions.push(
      `Rollback: git reset --hard ${beforeSha}`,
      `Verify: git log --oneline | head -5`
    );

    return {
      success: true,
      output,
      rollbackInstructions,
    };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    errors.push(`Failed to merge ${sourceBranch}: ${errMsg}`);

    // Attempt to abort merge
    try {
      execSync("git merge --abort", { cwd, stdio: "pipe", encoding: "utf-8" });
      rollbackInstructions.push("Merge automatically aborted");
    } catch {
      rollbackInstructions.push("git merge --abort (manual intervention required)");
    }

    return {
      success: false,
      output: "",
      rollbackInstructions,
      errors,
    };
  }
}
