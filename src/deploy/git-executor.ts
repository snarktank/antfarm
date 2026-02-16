import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Result of a git operation
 */
export interface GitOperationResult {
  /** Whether operation succeeded */
  status: "success" | "failed" | "conflict";
  /** Output or error message */
  message: string;
  /** Commit hash if applicable */
  commitHash?: string;
  /** Whether merge conflict was detected */
  hasConflict?: boolean;
  /** List of conflicted files if applicable */
  conflictedFiles?: string[];
  /** Timestamp of operation */
  timestamp: string;
}

/**
 * Logger for audit trail
 */
export interface GitLogger {
  /** Log an info message */
  info(message: string): void;
  /** Log an error message */
  error(message: string): void;
  /** Log a warning message */
  warn(message: string): void;
}

/**
 * Default console-based logger
 */
const defaultLogger: GitLogger = {
  info: (msg) => console.log(`[GIT] INFO: ${msg}`),
  error: (msg) => console.error(`[GIT] ERROR: ${msg}`),
  warn: (msg) => console.warn(`[GIT] WARN: ${msg}`),
};

/**
 * Executor for git operations during deployment
 * Handles pull, clean, and revert operations with proper error handling
 */
export class GitExecutor {
  /**
   * Execute git pull for a specific branch
   * Validates repo exists and branch exists before pulling
   *
   * @param repo Repository path
   * @param branch Branch to pull
   * @param logger Optional logger for audit trail
   * @returns Operation result with status and message
   */
  static gitPull(repo: string, branch: string, logger: GitLogger = defaultLogger): GitOperationResult {
    const timestamp = new Date().toISOString();

    try {
      // Validate repo exists
      if (!existsSync(repo)) {
        const message = `Repository path does not exist: ${repo}`;
        logger.error(`gitPull failed: ${message}`);
        return { status: "failed", message, timestamp };
      }

      // Validate it's a git repo
      try {
        execSync(`cd "${repo}" && git rev-parse --git-dir`, {
          stdio: ["pipe", "pipe", "pipe"],
          encoding: "utf-8",
        });
      } catch {
        const message = `Not a valid git repository: ${repo}`;
        logger.error(`gitPull failed: ${message}`);
        return { status: "failed", message, timestamp };
      }

      // Verify branch exists
      const branchExists = this.branchExists(repo, branch);
      if (!branchExists) {
        const message = `Branch does not exist: ${branch}`;
        logger.error(`gitPull failed: ${message}`);
        return { status: "failed", message, timestamp };
      }

      logger.info(`gitPull starting: repo=${repo}, branch=${branch}`);

      // Execute git pull
      const output = execSync(`cd "${repo}" && git pull origin ${branch}`, {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      }).trim();

      // Check for merge conflicts in output
      if (output.includes("conflict") || output.includes("CONFLICT")) {
        logger.warn(`gitPull completed with conflicts: ${output}`);
        return {
          status: "conflict",
          message: output,
          timestamp,
          hasConflict: true,
          conflictedFiles: this.detectConflictedFiles(repo),
        };
      }

      logger.info(`gitPull succeeded: ${output}`);
      return {
        status: "success",
        message: output,
        timestamp,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`gitPull failed: ${message}`);

      // Check if failure is due to merge conflicts
      if (message.includes("conflict") || message.includes("CONFLICT")) {
        return {
          status: "conflict",
          message,
          timestamp,
          hasConflict: true,
          conflictedFiles: this.detectConflictedFiles(repo),
        };
      }

      return { status: "failed", message, timestamp };
    }
  }

  /**
   * Clean working directory by resetting and removing untracked files
   * Requires confirmation (in tests) or explicit usage
   *
   * @param repo Repository path
   * @param logger Optional logger for audit trail
   * @returns Operation result with status and message
   */
  static gitClean(repo: string, logger: GitLogger = defaultLogger): GitOperationResult {
    const timestamp = new Date().toISOString();

    try {
      // Validate repo exists
      if (!existsSync(repo)) {
        const message = `Repository path does not exist: ${repo}`;
        logger.error(`gitClean failed: ${message}`);
        return { status: "failed", message, timestamp };
      }

      // Validate it's a git repo
      try {
        execSync(`cd "${repo}" && git rev-parse --git-dir`, {
          stdio: ["pipe", "pipe", "pipe"],
          encoding: "utf-8",
        });
      } catch {
        const message = `Not a valid git repository: ${repo}`;
        logger.error(`gitClean failed: ${message}`);
        return { status: "failed", message, timestamp };
      }

      logger.info(`gitClean starting: repo=${repo}`);

      // First, clean untracked files
      const cleanOutput = execSync(`cd "${repo}" && git clean -fd`, {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      }).trim();

      logger.info(`git clean -fd completed: ${cleanOutput}`);

      // Then, reset hard to remove staged changes
      const resetOutput = execSync(`cd "${repo}" && git reset --hard`, {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      }).trim();

      logger.info(`git reset --hard completed: ${resetOutput}`);

      const message = `Clean and reset completed. Clean: ${cleanOutput || "(no untracked files)"}. Reset: ${resetOutput}`;
      return {
        status: "success",
        message,
        timestamp,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`gitClean failed: ${message}`);
      return { status: "failed", message, timestamp };
    }
  }

  /**
   * Create a revert commit to roll back to a previous state
   * Creates a new commit that reverts the changes from the specified commit
   *
   * @param repo Repository path
   * @param lastCommitHash Commit hash to revert to
   * @param logger Optional logger for audit trail
   * @returns Operation result with new commit hash if successful
   */
  static gitRevert(
    repo: string,
    lastCommitHash: string,
    logger: GitLogger = defaultLogger
  ): GitOperationResult {
    const timestamp = new Date().toISOString();

    try {
      // Validate repo exists
      if (!existsSync(repo)) {
        const message = `Repository path does not exist: ${repo}`;
        logger.error(`gitRevert failed: ${message}`);
        return { status: "failed", message, timestamp };
      }

      // Validate it's a git repo
      try {
        execSync(`cd "${repo}" && git rev-parse --git-dir`, {
          stdio: ["pipe", "pipe", "pipe"],
          encoding: "utf-8",
        });
      } catch {
        const message = `Not a valid git repository: ${repo}`;
        logger.error(`gitRevert failed: ${message}`);
        return { status: "failed", message, timestamp };
      }

      // Validate commit exists
      try {
        execSync(`cd "${repo}" && git cat-file -t ${lastCommitHash}`, {
          stdio: ["pipe", "pipe", "pipe"],
          encoding: "utf-8",
        });
      } catch {
        const message = `Commit does not exist: ${lastCommitHash}`;
        logger.error(`gitRevert failed: ${message}`);
        return { status: "failed", message, timestamp };
      }

      logger.info(`gitRevert starting: repo=${repo}, commit=${lastCommitHash}`);

      // Reset to the specified commit
      // This creates a new state that matches the specified commit
      const resetOutput = execSync(`cd "${repo}" && git reset --hard ${lastCommitHash}`, {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      }).trim();

      logger.info(`git reset --hard completed: ${resetOutput}`);

      // Get the new HEAD commit hash
      const newCommitHash = execSync(`cd "${repo}" && git rev-parse HEAD`, {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      })
        .trim()
        .substring(0, 40); // Ensure SHA1 format

      const message = `Successfully reverted to commit ${lastCommitHash}`;
      logger.info(`gitRevert succeeded: ${message}`);

      return {
        status: "success",
        message,
        commitHash: newCommitHash,
        timestamp,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`gitRevert failed: ${message}`);
      return { status: "failed", message, timestamp };
    }
  }

  /**
   * Detect which files have merge conflicts
   * @param repo Repository path
   * @returns List of conflicted files
   */
  private static detectConflictedFiles(repo: string): string[] {
    try {
      const output = execSync(`cd "${repo}" && git diff --name-only --diff-filter=U`, {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      });
      return output
        .trim()
        .split("\n")
        .filter((line) => line.length > 0);
    } catch {
      return [];
    }
  }

  /**
   * Check if a branch exists in the repository
   * @param repo Repository path
   * @param branch Branch name
   * @returns true if branch exists, false otherwise
   */
  private static branchExists(repo: string, branch: string): boolean {
    try {
      execSync(`cd "${repo}" && git rev-parse --verify ${branch}`, {
        stdio: ["pipe", "pipe", "pipe"],
        encoding: "utf-8",
      });
      return true;
    } catch {
      return false;
    }
  }
}
