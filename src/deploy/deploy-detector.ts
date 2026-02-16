import { execSync } from "node:child_process";

/**
 * Merge commit metadata from git history
 */
export interface MergeCommitMetadata {
  /** Commit hash */
  commitHash: string;
  /** Commit message */
  message: string;
  /** Author name */
  author: string;
  /** Author email */
  email: string;
  /** Timestamp as ISO string */
  timestamp: string;
  /** PR number if extractable from commit message */
  prNumber?: number;
}

/**
 * PR merge detection result
 */
export interface MergeDetectionResult {
  /** Whether the branch was merged */
  isMerged: boolean;
  /** Latest merge commit if merged */
  latestMerge?: MergeCommitMetadata;
  /** Error message if detection failed */
  error?: string;
}

/**
 * Detector for PR merge events using git history
 * Validates merges against actual git history, not file state
 */
export class DeployDetector {
  /**
   * Check if a branch has been merged into the current branch (main/develop)
   * Uses git merge-base to validate against actual git history
   *
   * @param repo Repository path
   * @param branch Branch name to check for merge
   * @returns true if branch was merged and exists in git history
   */
  static isPRMerged(repo: string, branch: string): boolean {
    try {
      // Validate inputs
      if (!repo || typeof repo !== "string") {
        return false;
      }
      if (!branch || typeof branch !== "string") {
        return false;
      }

      // Check if repo directory exists
      try {
        execSync(`test -d "${repo}/.git"`, { stdio: "pipe" });
      } catch {
        return false;
      }

      // Get current branch
      const currentBranch = execSync(`cd "${repo}" && git rev-parse --abbrev-ref HEAD`, {
        encoding: "utf-8",
        stdio: "pipe",
      })
        .trim();

      // Check if branch exists in git history
      try {
        execSync(`cd "${repo}" && git rev-parse "${branch}" > /dev/null 2>&1`, {
          stdio: "pipe",
        });
      } catch {
        // Branch doesn't exist in git history
        return false;
      }

      // Check if branch is a direct ancestor of current branch (i.e., merged)
      // merge-base returns the common ancestor. If it equals the branch commit, the branch is merged
      try {
        const mergeBase = execSync(`cd "${repo}" && git merge-base "${currentBranch}" "${branch}"`, {
          encoding: "utf-8",
          stdio: "pipe",
        })
          .trim();

        const branchCommit = execSync(`cd "${repo}" && git rev-parse "${branch}"`, {
          encoding: "utf-8",
          stdio: "pipe",
        })
          .trim();

        // If merge-base equals branch commit, then branch is an ancestor (merged)
        return mergeBase === branchCommit;
      } catch {
        return false;
      }
    } catch {
      return false;
    }
  }

  /**
   * Get the latest merge commit with full metadata
   * Searches git log for the most recent merge commit
   *
   * @param repo Repository path
   * @returns Merge metadata or error
   */
  static getLatestMergeCommit(repo: string): MergeDetectionResult {
    try {
      // Validate input
      if (!repo || typeof repo !== "string") {
        return {
          isMerged: false,
          error: "Invalid repository path",
        };
      }

      // Check if repo directory exists
      try {
        execSync(`test -d "${repo}/.git"`, { stdio: "pipe" });
      } catch {
        return {
          isMerged: false,
          error: `Repository directory not found: ${repo}`,
        };
      }

      // Get the latest merge commit (commits with 2+ parents)
      // --grep="Merge" finds commits with "Merge" in the message
      let latestMerge: string;
      try {
        latestMerge = execSync(
          `cd "${repo}" && git log --merges --pretty=format:"%H" --max-count=1`,
          {
            encoding: "utf-8",
            stdio: "pipe",
          }
        ).trim();
      } catch {
        return {
          isMerged: false,
          error: "Failed to query git merge history",
        };
      }

      if (!latestMerge) {
        return {
          isMerged: false,
          error: "No merge commits found in history",
        };
      }

      // Extract commit details
      let commitDetails: string;
      try {
        commitDetails = execSync(
          `cd "${repo}" && git show -s --pretty=format:"%H%n%s%n%an%n%ae%n%aI" "${latestMerge}"`,
          {
            encoding: "utf-8",
            stdio: "pipe",
          }
        ).trim();
      } catch {
        return {
          isMerged: false,
          error: "Failed to extract commit details",
        };
      }

      const lines = commitDetails.split("\n");
      if (lines.length < 5) {
        return {
          isMerged: false,
          error: "Incomplete commit data",
        };
      }

      const [hash, message, author, email, timestamp] = lines;

      // Try to extract PR number from commit message
      // Common formats: "Merge pull request #123", "Merge branch 'feature' (#456)"
      let prNumber: number | undefined;
      const prMatch = message.match(/#(\d+)/);
      if (prMatch) {
        prNumber = parseInt(prMatch[1], 10);
      }

      return {
        isMerged: true,
        latestMerge: {
          commitHash: hash,
          message,
          author,
          email,
          timestamp,
          prNumber,
        },
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return {
        isMerged: false,
        error: `Failed to detect merge: ${errorMsg}`,
      };
    }
  }

  /**
   * Validate merge state for a specific branch
   * Performs comprehensive check including git history validation
   *
   * @param repo Repository path
   * @param branch Branch to validate
   * @returns Full merge detection result with metadata
   */
  static validateMergeState(repo: string, branch: string): MergeDetectionResult {
    // First check if merged
    const isMerged = this.isPRMerged(repo, branch);

    if (!isMerged) {
      // Validate why it's not merged
      if (!repo || typeof repo !== "string") {
        return {
          isMerged: false,
          error: "Invalid repository path",
        };
      }

      try {
        execSync(`test -d "${repo}/.git"`, { stdio: "pipe" });
      } catch {
        return {
          isMerged: false,
          error: `Repository not found: ${repo}`,
        };
      }

      // Check if branch exists
      try {
        execSync(`cd "${repo}" && git rev-parse "${branch}" > /dev/null 2>&1`, {
          stdio: "pipe",
        });
      } catch {
        return {
          isMerged: false,
          error: `Branch does not exist: ${branch}`,
        };
      }

      return {
        isMerged: false,
        error: `Branch has not been merged: ${branch}`,
      };
    }

    // If merged, get the merge commit details
    return this.getLatestMergeCommit(repo);
  }
}
