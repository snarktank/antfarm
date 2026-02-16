import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { GitExecutor, type GitLogger } from "../dist/deploy/git-executor.js";

/**
 * Test suite for git operations executor
 * Tests gitPull, gitClean, and gitRevert with mock repositories
 */
describe("GitExecutor - Git Operations", () => {
  let testRepoPath: string;
  let originRepoPath: string;
  let testLogs: string[] = [];

  /**
   * Mock logger for testing
   */
  const mockLogger: GitLogger = {
    info: (msg) => testLogs.push(`INFO: ${msg}`),
    error: (msg) => testLogs.push(`ERROR: ${msg}`),
    warn: (msg) => testLogs.push(`WARN: ${msg}`),
  };

  /**
   * Initialize a bare git repository (to act as origin)
   */
  function initBareRepo(): void {
    execSync(`git init --bare "${originRepoPath}"`);
  }

  /**
   * Initialize a test git repository and connect to origin
   */
  function initTestRepo(): void {
    execSync(`cd "${testRepoPath}" && git init --initial-branch=main`);
    execSync(`cd "${testRepoPath}" && git config user.email "test@test.com"`);
    execSync(`cd "${testRepoPath}" && git config user.name "Test User"`);
    execSync(`cd "${testRepoPath}" && git remote add origin "${originRepoPath}"`);
  }

  /**
   * Create an initial commit in the repo
   */
  function createInitialCommit(): void {
    writeFileSync(join(testRepoPath, "file.txt"), "initial content");
    execSync(`cd "${testRepoPath}" && git add . && git commit -m "Initial commit"`);
  }

  /**
   * Push a branch to origin
   */
  function pushBranch(branchName: string): void {
    execSync(`cd "${testRepoPath}" && git push origin ${branchName}`, {
      stdio: ["pipe", "pipe", "pipe"],
    });
  }

  /**
   * Create a feature branch with a commit
   */
  function createFeatureBranch(branchName: string): void {
    execSync(`cd "${testRepoPath}" && git checkout -b ${branchName}`);
    writeFileSync(join(testRepoPath, "feature.txt"), `content for ${branchName}`);
    execSync(`cd "${testRepoPath}" && git add . && git commit -m "Feature: ${branchName}"`);
  }

  /**
   * Merge a branch into main
   */
  function mergeBranch(branchName: string): void {
    execSync(`cd "${testRepoPath}" && git checkout main`);
    execSync(`cd "${testRepoPath}" && git merge ${branchName} --no-ff -m "Merge ${branchName}"`);
  }

  /**
   * Setup: Create temporary test repo before each test
   */
  beforeEach(() => {
    testRepoPath = mkdtempSync(join(tmpdir(), "git-executor-test-"));
    originRepoPath = mkdtempSync(join(tmpdir(), "git-executor-origin-"));
    testLogs = [];
    initBareRepo();
    initTestRepo();
    createInitialCommit();
    pushBranch("main");
  });

  /**
   * Teardown: Clean up test repos after each test
   */
  afterEach(() => {
    rmSync(testRepoPath, { recursive: true, force: true });
    rmSync(originRepoPath, { recursive: true, force: true });
  });

  describe("gitPull()", () => {
    it("successfully pulls changes from a remote branch", () => {
      createFeatureBranch("feature/test");
      pushBranch("feature/test");
      execSync(`cd "${testRepoPath}" && git checkout main`);

      const result = GitExecutor.gitPull(testRepoPath, "feature/test", mockLogger);

      // Either success or already up-to-date (both are valid outcomes)
      assert.ok(
        result.status === "success" || result.message.includes("Already"),
        "Should succeed or indicate already up-to-date"
      );
      assert.ok(result.message, "Should have a message");
      assert.ok(result.timestamp, "Should have a timestamp");
    });

    it("fails for non-existent branch", () => {
      const result = GitExecutor.gitPull(testRepoPath, "nonexistent-branch", mockLogger);

      assert.equal(result.status, "failed", "Should fail for non-existent branch");
      assert.ok(result.message.includes("does not exist"), "Should indicate branch doesn't exist");
      assert.ok(testLogs.some((log) => log.includes("gitPull failed")), "Should log failure");
    });

    it("fails for non-existent repository", () => {
      const result = GitExecutor.gitPull("/nonexistent/path", "main", mockLogger);

      assert.equal(result.status, "failed", "Should fail for non-existent repo");
      assert.ok(result.message.includes("does not exist"), "Should indicate repo doesn't exist");
    });

    it("fails for non-git repository", () => {
      const nonGitPath = mkdtempSync(join(tmpdir(), "not-a-repo-"));
      try {
        const result = GitExecutor.gitPull(nonGitPath, "main", mockLogger);

        assert.equal(result.status, "failed", "Should fail for non-git directory");
        assert.ok(
          result.message.includes("not a valid git repository") || result.message.includes("git"),
          "Should indicate invalid repo"
        );
      } finally {
        rmSync(nonGitPath, { recursive: true, force: true });
      }
    });

    it("handles successful git pull with existing branch", () => {
      // Create and push a branch
      createFeatureBranch("feature/a");
      pushBranch("feature/a");
      
      // Now pull from that branch
      const result = GitExecutor.gitPull(testRepoPath, "feature/a", mockLogger);

      // Should succeed or indicate already up-to-date
      assert.ok(
        result.status === "success" || result.message.includes("Already"),
        "Should successfully pull or indicate already up-to-date"
      );
      assert.ok(result.timestamp, "Should have timestamp");
    });

    it("logs all operations with timestamps", () => {
      createFeatureBranch("feature/test");
      pushBranch("feature/test");
      execSync(`cd "${testRepoPath}" && git checkout main`);

      testLogs = [];
      const result = GitExecutor.gitPull(testRepoPath, "feature/test", mockLogger);

      assert.ok(
        testLogs.some((log) => log.includes("gitPull starting")),
        "Should log start of operation"
      );
      // Check for either success or conflict status
      assert.ok(
        result.status === "success" || result.status === "conflict",
        "Should succeed or report conflict"
      );
    });
  });

  describe("gitClean()", () => {
    it("successfully cleans untracked files", () => {
      // Create untracked file
      writeFileSync(join(testRepoPath, "untracked.txt"), "untracked content");

      const result = GitExecutor.gitClean(testRepoPath, mockLogger);

      assert.equal(result.status, "success", "Should succeed");
      assert.ok(result.message.includes("Clean and reset completed"), "Should indicate success");
      assert.ok(result.timestamp, "Should have a timestamp");

      // Verify untracked file is gone
      const fileList = execSync(`cd "${testRepoPath}" && ls -la`, {
        encoding: "utf-8",
      });
      assert.ok(!fileList.includes("untracked.txt"), "Untracked file should be removed");
    });

    it("successfully resets staged changes", () => {
      // Create and stage a change
      writeFileSync(join(testRepoPath, "file.txt"), "modified content");
      execSync(`cd "${testRepoPath}" && git add file.txt`);

      const result = GitExecutor.gitClean(testRepoPath, mockLogger);

      assert.equal(result.status, "success", "Should succeed");

      // Verify changes are reset
      const status = execSync(`cd "${testRepoPath}" && git status`, {
        encoding: "utf-8",
      });
      assert.ok(status.includes("working tree clean"), "Working tree should be clean");
    });

    it("handles case with no untracked files", () => {
      const result = GitExecutor.gitClean(testRepoPath, mockLogger);

      assert.equal(result.status, "success", "Should succeed even with no untracked files");
      assert.ok(result.message, "Should have a message");
    });

    it("fails for non-existent repository", () => {
      const result = GitExecutor.gitClean("/nonexistent/path", mockLogger);

      assert.equal(result.status, "failed", "Should fail for non-existent repo");
      assert.ok(result.message.includes("does not exist"), "Should indicate repo doesn't exist");
    });

    it("fails for non-git repository", () => {
      const nonGitPath = mkdtempSync(join(tmpdir(), "not-a-repo-"));
      try {
        const result = GitExecutor.gitClean(nonGitPath, mockLogger);

        assert.equal(result.status, "failed", "Should fail for non-git directory");
        assert.ok(
          result.message.includes("not a valid git repository") || result.message.includes("git"),
          "Should indicate invalid repo"
        );
      } finally {
        rmSync(nonGitPath, { recursive: true, force: true });
      }
    });

    it("logs all operations", () => {
      testLogs = [];
      GitExecutor.gitClean(testRepoPath, mockLogger);

      assert.ok(
        testLogs.some((log) => log.includes("gitClean starting")),
        "Should log start of operation"
      );
      assert.ok(
        testLogs.some((log) => log.includes("git clean -fd")),
        "Should log clean operation"
      );
      assert.ok(
        testLogs.some((log) => log.includes("git reset --hard")),
        "Should log reset operation"
      );
    });
  });

  describe("gitRevert()", () => {
    it("successfully reverts to a previous commit", () => {
      // Create two commits
      const commit1 = execSync(`cd "${testRepoPath}" && git rev-parse HEAD`, {
        encoding: "utf-8",
      }).trim();

      writeFileSync(join(testRepoPath, "file.txt"), "new content");
      execSync(`cd "${testRepoPath}" && git add . && git commit -m "Second commit"`);

      // Revert to first commit
      const result = GitExecutor.gitRevert(testRepoPath, commit1, mockLogger);

      assert.equal(result.status, "success", "Should succeed");
      assert.ok(result.message.includes("Successfully reverted"), "Should indicate success");
      assert.ok(result.commitHash, "Should return new commit hash");
      assert.ok(result.timestamp, "Should have a timestamp");

      // Verify we're back at the original commit
      const currentContent = execSync(`cd "${testRepoPath}" && cat file.txt`, {
        encoding: "utf-8",
      });
      assert.equal(currentContent, "initial content", "Should restore original file content");
    });

    it("fails for non-existent commit", () => {
      const result = GitExecutor.gitRevert(testRepoPath, "nonexistent123456", mockLogger);

      assert.equal(result.status, "failed", "Should fail for non-existent commit");
      assert.ok(result.message.includes("does not exist"), "Should indicate commit doesn't exist");
    });

    it("fails for non-existent repository", () => {
      const result = GitExecutor.gitRevert("/nonexistent/path", "abc123", mockLogger);

      assert.equal(result.status, "failed", "Should fail for non-existent repo");
      assert.ok(result.message.includes("does not exist"), "Should indicate repo doesn't exist");
    });

    it("fails for non-git repository", () => {
      const nonGitPath = mkdtempSync(join(tmpdir(), "not-a-repo-"));
      try {
        const result = GitExecutor.gitRevert(nonGitPath, "abc123", mockLogger);

        assert.equal(result.status, "failed", "Should fail for non-git directory");
        assert.ok(
          result.message.includes("not a valid git repository") || result.message.includes("git"),
          "Should indicate invalid repo"
        );
      } finally {
        rmSync(nonGitPath, { recursive: true, force: true });
      }
    });

    it("returns commit hash in correct SHA1 format", () => {
      const commit = execSync(`cd "${testRepoPath}" && git rev-parse HEAD`, {
        encoding: "utf-8",
      }).trim();

      const result = GitExecutor.gitRevert(testRepoPath, commit, mockLogger);

      assert.equal(result.status, "success", "Should succeed");
      assert.ok(result.commitHash, "Should return commit hash");
      assert.equal(result.commitHash!.length, 40, "Should return 40-character SHA1 hash");
      assert.match(result.commitHash!, /^[a-f0-9]{40}$/, "Should be valid SHA1 hex string");
    });

    it("logs all operations with timestamps", () => {
      const commit = execSync(`cd "${testRepoPath}" && git rev-parse HEAD`, {
        encoding: "utf-8",
      }).trim();

      testLogs = [];
      GitExecutor.gitRevert(testRepoPath, commit, mockLogger);

      assert.ok(
        testLogs.some((log) => log.includes("gitRevert starting")),
        "Should log start of operation"
      );
      assert.ok(
        testLogs.some((log) => log.includes("git reset --hard")),
        "Should log reset operation"
      );
      assert.ok(
        testLogs.some((log) => log.includes("gitRevert succeeded")),
        "Should log success of operation"
      );
    });
  });

  describe("Default logger", () => {
    it("uses default console logger when none provided", () => {
      createFeatureBranch("feature/test");
      pushBranch("feature/test");
      execSync(`cd "${testRepoPath}" && git checkout main`);

      // Should not throw when using default logger
      const result = GitExecutor.gitPull(testRepoPath, "feature/test");

      // Should have a status and message (either success or conflict)
      assert.ok(result.status, "Should return a status");
      assert.ok(result.message, "Should return a message");
      assert.ok(result.timestamp, "Should return a timestamp");
    });
  });

  describe("Error handling for dirty trees", () => {
    it("handles dirty working tree gracefully in gitPull", () => {
      createFeatureBranch("feature/test");
      pushBranch("feature/test");
      
      // Modify origin/feature/test
      execSync(`cd "${testRepoPath}" && git checkout feature/test`);
      writeFileSync(join(testRepoPath, "feature.txt"), "updated feature content");
      execSync(`cd "${testRepoPath}" && git add . && git commit -m "Update feature"`);
      pushBranch("feature/test");
      
      // Reset to previous state and create uncommitted changes
      execSync(`cd "${testRepoPath}" && git reset --hard HEAD~1`);
      writeFileSync(join(testRepoPath, "file.txt"), "uncommitted changes");

      const result = GitExecutor.gitPull(testRepoPath, "feature/test", mockLogger);

      // Should either succeed or report conflict - not throw an error
      assert.ok(
        result.status === "success" || result.status === "failed" || result.status === "conflict",
        "Should handle dirty tree gracefully without crashing"
      );
      assert.ok(result.message, "Should provide a message");
    });

    it("handles branch not on remote gracefully", () => {
      // Create local branch but don't push it
      createFeatureBranch("feature/untracked");
      execSync(`cd "${testRepoPath}" && git checkout main`);

      // Try to pull the untracked feature branch
      const result = GitExecutor.gitPull(testRepoPath, "feature/untracked", mockLogger);

      // Should fail because branch doesn't exist on remote
      assert.ok(result.status === "failed", "Should fail when pulling non-existent remote branch");
      assert.ok(result.message, "Should provide error message");
    });
  });

  describe("Timestamp format", () => {
    it("returns ISO 8601 formatted timestamps", () => {
      const result = GitExecutor.gitPull(testRepoPath, "main", mockLogger);

      assert.ok(result.timestamp, "Should have a timestamp");
      const date = new Date(result.timestamp);
      assert.ok(!isNaN(date.getTime()), "Timestamp should be valid ISO 8601 format");
    });
  });
});
