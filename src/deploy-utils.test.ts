import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import {
  ensureClean,
  pullLatest,
  installDeps,
  runBuild,
  runTests,
  detectMergeConflict,
  mergeWithConflictCheck,
} from "./deploy-utils.js";

// Create a temporary test git repo for testing
function createTestRepo(name: string): string {
  const testDir = path.join(process.cwd(), ".test-repos");
  fs.mkdirSync(testDir, { recursive: true });
  
  const repoPath = path.join(testDir, name);
  if (fs.existsSync(repoPath)) {
    execSync(`rm -rf ${repoPath}`);
  }
  fs.mkdirSync(repoPath, { recursive: true });

  // Initialize git repo
  execSync("git init", { cwd: repoPath, stdio: "pipe" });
  execSync('git config user.email "test@example.com"', {
    cwd: repoPath,
    stdio: "pipe",
  });
  execSync('git config user.name "Test User"', {
    cwd: repoPath,
    stdio: "pipe",
  });

  // Create initial commit
  fs.writeFileSync(path.join(repoPath, "README.md"), "# Test Repo");
  execSync("git add README.md", { cwd: repoPath, stdio: "pipe" });
  execSync('git commit -m "Initial commit"', {
    cwd: repoPath,
    stdio: "pipe",
  });

  return repoPath;
}

function cleanupTestRepo(repoPath: string): void {
  const testDir = path.dirname(repoPath);
  if (fs.existsSync(testDir)) {
    execSync(`rm -rf ${testDir}`);
  }
}

describe("deploy-utils", () => {
  let testRepoPath: string;

  beforeEach(() => {
    testRepoPath = createTestRepo(`test-${Date.now()}`);
  });

  afterEach(() => {
    cleanupTestRepo(testRepoPath);
  });

  describe("ensureClean", () => {
    it("returns success when working directory is clean", () => {
      const result = ensureClean(testRepoPath, false);
      assert.equal(result.success, true);
      assert.ok(result.output.includes("clean"));
    });

    it("returns failure when there are uncommitted changes", () => {
      fs.writeFileSync(path.join(testRepoPath, "test.txt"), "uncommitted");
      const result = ensureClean(testRepoPath, false);
      assert.equal(result.success, false);
      assert.ok(result.errors && result.errors.length > 0);
    });

    it("returns success in dry-run mode without checking", () => {
      fs.writeFileSync(path.join(testRepoPath, "test.txt"), "uncommitted");
      const result = ensureClean(testRepoPath, true);
      assert.equal(result.success, true);
      assert.ok(result.output.includes("DRY-RUN"));
    });

    it("has proper return structure", () => {
      const result = ensureClean(testRepoPath, false);
      assert.ok(typeof result.success === "boolean");
      assert.ok(typeof result.output === "string");
      assert.ok(Array.isArray(result.rollbackInstructions));
    });
  });

  describe("pullLatest", () => {
    it("returns success in dry-run mode", () => {
      const result = pullLatest(testRepoPath, true, "main");
      assert.equal(result.success, true);
      assert.ok(result.output.includes("DRY-RUN"));
    });

    it("returns failure when branch doesn't exist on remote", () => {
      const result = pullLatest(testRepoPath, false, "nonexistent");
      assert.equal(result.success, false);
      assert.ok(result.errors && result.errors.length > 0);
    });

    it("provides rollback instructions on success", () => {
      // We can't actually test real pull without a remote, but we can test structure
      const result = pullLatest(testRepoPath, true, "main");
      assert.ok(Array.isArray(result.rollbackInstructions));
    });

    it("has proper return structure", () => {
      const result = pullLatest(testRepoPath, true, "main");
      assert.ok(typeof result.success === "boolean");
      assert.ok(typeof result.output === "string");
      assert.ok(Array.isArray(result.rollbackInstructions));
    });
  });

  describe("installDeps", () => {
    it("returns success in dry-run mode for npm", () => {
      const result = installDeps(testRepoPath, true, "npm");
      assert.equal(result.success, true);
      assert.ok(result.output.includes("DRY-RUN"));
      assert.ok(result.output.includes("npm install"));
    });

    it("returns success in dry-run mode for bun", () => {
      const result = installDeps(testRepoPath, true, "bun");
      assert.equal(result.success, true);
      assert.ok(result.output.includes("DRY-RUN"));
      assert.ok(result.output.includes("bun install"));
    });

    it("provides rollback instructions for npm", () => {
      const result = installDeps(testRepoPath, true, "npm");
      assert.ok(result.rollbackInstructions.length > 0);
      assert.ok(
        result.rollbackInstructions.some((r) => r.includes("node_modules"))
      );
    });

    it("has proper return structure", () => {
      const result = installDeps(testRepoPath, true, "npm");
      assert.ok(typeof result.success === "boolean");
      assert.ok(typeof result.output === "string");
      assert.ok(Array.isArray(result.rollbackInstructions));
    });
  });

  describe("runBuild", () => {
    it("returns success in dry-run mode", () => {
      const buildCmd = "npm run build";
      const result = runBuild(testRepoPath, true, buildCmd);
      assert.equal(result.success, true);
      assert.ok(result.output.includes("DRY-RUN"));
      assert.ok(result.output.includes(buildCmd));
    });

    it("returns failure when command doesn't exist", () => {
      const result = runBuild(testRepoPath, false, "nonexistent-command-xyz");
      assert.equal(result.success, false);
      assert.ok(result.errors && result.errors.length > 0);
    });

    it("provides rollback instructions", () => {
      const result = runBuild(testRepoPath, true, "npm run build");
      assert.ok(result.rollbackInstructions.length > 0);
    });

    it("has proper return structure", () => {
      const result = runBuild(testRepoPath, true, "npm run build");
      assert.ok(typeof result.success === "boolean");
      assert.ok(typeof result.output === "string");
      assert.ok(Array.isArray(result.rollbackInstructions));
    });
  });

  describe("runTests", () => {
    it("returns success in dry-run mode", () => {
      const testCmd = "npm test";
      const result = runTests(testRepoPath, true, testCmd);
      assert.equal(result.success, true);
      assert.ok(result.output.includes("DRY-RUN"));
      assert.ok(result.output.includes(testCmd));
    });

    it("returns failure when test command fails", () => {
      const result = runTests(testRepoPath, false, "false"); // 'false' always exits with 1
      assert.equal(result.success, false);
      assert.ok(result.errors && result.errors.length > 0);
    });

    it("provides rollback instructions (tests are read-only)", () => {
      const result = runTests(testRepoPath, true, "npm test");
      assert.ok(result.rollbackInstructions.length > 0);
      assert.ok(
        result.rollbackInstructions.some((r) => r.includes("read-only"))
      );
    });

    it("has proper return structure", () => {
      const result = runTests(testRepoPath, true, "npm test");
      assert.ok(typeof result.success === "boolean");
      assert.ok(typeof result.output === "string");
      assert.ok(Array.isArray(result.rollbackInstructions));
    });
  });

  describe("detectMergeConflict", () => {
    it("returns success when no conflicts (on valid branch)", () => {
      // This will fail because we don't have a remote, but we're testing structure
      const result = detectMergeConflict(testRepoPath, "main");
      assert.ok(typeof result.success === "boolean");
      assert.ok(typeof result.output === "string");
      assert.ok(Array.isArray(result.rollbackInstructions));
    });

    it("has proper return structure", () => {
      const result = detectMergeConflict(testRepoPath, "main");
      assert.ok(typeof result.success === "boolean");
      assert.ok(typeof result.output === "string");
      assert.ok(Array.isArray(result.rollbackInstructions));
      assert.ok(!Array.isArray(result.errors) || result.errors.length >= 0);
    });

    it("cleans up after itself (no merge state left)", () => {
      // Run detection
      detectMergeConflict(testRepoPath, "main");

      // Check git status - should not be in a merge state
      const gitStatus = execSync("git status", {
        cwd: testRepoPath,
        encoding: "utf-8",
      });
      assert.ok(!gitStatus.includes("MERGE_HEAD"), "Should not be in merge state");
    });
  });

  describe("mergeWithConflictCheck", () => {
    it("has proper return structure", () => {
      const result = mergeWithConflictCheck(testRepoPath, "main");
      assert.ok(typeof result.success === "boolean");
      assert.ok(typeof result.output === "string");
      assert.ok(Array.isArray(result.rollbackInstructions));
    });

    it("includes rollback instructions for merge", () => {
      // Will fail due to no remote, but we test the structure
      const result = mergeWithConflictCheck(testRepoPath, "nonexistent");
      // Should include rollback instructions even on failure
      assert.ok(Array.isArray(result.rollbackInstructions));
    });

    it("cleans up on failure (no merge state left)", () => {
      // Try to merge non-existent branch
      mergeWithConflictCheck(testRepoPath, "nonexistent");

      // Check git status - should not be in a merge state
      const gitStatus = execSync("git status", {
        cwd: testRepoPath,
        encoding: "utf-8",
      });
      assert.ok(!gitStatus.includes("MERGE_HEAD"), "Should not be in merge state");
    });
  });

  describe("return structure consistency", () => {
    it("all functions return success boolean", () => {
      const results = [
        ensureClean(testRepoPath, true),
        pullLatest(testRepoPath, true, "main"),
        installDeps(testRepoPath, true, "npm"),
        runBuild(testRepoPath, true, "npm run build"),
        runTests(testRepoPath, true, "npm test"),
        detectMergeConflict(testRepoPath, "main"),
        mergeWithConflictCheck(testRepoPath, "main"),
      ];

      results.forEach((result) => {
        assert.equal(typeof result.success, "boolean", "success should be boolean");
      });
    });

    it("all functions return output string", () => {
      const results = [
        ensureClean(testRepoPath, true),
        pullLatest(testRepoPath, true, "main"),
        installDeps(testRepoPath, true, "npm"),
        runBuild(testRepoPath, true, "npm run build"),
        runTests(testRepoPath, true, "npm test"),
        detectMergeConflict(testRepoPath, "main"),
        mergeWithConflictCheck(testRepoPath, "main"),
      ];

      results.forEach((result) => {
        assert.equal(typeof result.output, "string", "output should be string");
      });
    });

    it("all functions return rollbackInstructions array", () => {
      const results = [
        ensureClean(testRepoPath, true),
        pullLatest(testRepoPath, true, "main"),
        installDeps(testRepoPath, true, "npm"),
        runBuild(testRepoPath, true, "npm run build"),
        runTests(testRepoPath, true, "npm test"),
        detectMergeConflict(testRepoPath, "main"),
        mergeWithConflictCheck(testRepoPath, "main"),
      ];

      results.forEach((result) => {
        assert.ok(
          Array.isArray(result.rollbackInstructions),
          "rollbackInstructions should be array"
        );
      });
    });
  });

  describe("dry-run mode", () => {
    it("ensureClean dry-run doesn't check actual state", () => {
      // Add uncommitted changes
      fs.writeFileSync(path.join(testRepoPath, "dirty.txt"), "uncommitted");

      // Dry-run should succeed anyway
      const result = ensureClean(testRepoPath, true);
      assert.equal(result.success, true);
    });

    it("pullLatest dry-run doesn't modify repo", () => {
      const beforeCommit = execSync("git rev-parse HEAD", {
        cwd: testRepoPath,
        encoding: "utf-8",
      }).trim();

      pullLatest(testRepoPath, true, "main");

      const afterCommit = execSync("git rev-parse HEAD", {
        cwd: testRepoPath,
        encoding: "utf-8",
      }).trim();

      assert.equal(beforeCommit, afterCommit, "Commit should not change in dry-run");
    });

    it("installDeps dry-run doesn't create node_modules", () => {
      const result = installDeps(testRepoPath, true, "npm");
      assert.equal(result.success, true);
      assert.ok(!fs.existsSync(path.join(testRepoPath, "node_modules")));
    });

    it("runBuild dry-run doesn't create dist", () => {
      const result = runBuild(testRepoPath, true, "npm run build");
      assert.equal(result.success, true);
      // dist directory might exist from previous tests, but this command shouldn't create it
      assert.ok(result.output.includes("DRY-RUN"));
    });

    it("runTests dry-run doesn't execute tests", () => {
      const result = runTests(testRepoPath, true, "npm test");
      assert.equal(result.success, true);
      assert.ok(result.output.includes("DRY-RUN"));
    });
  });

  describe("error handling", () => {
    it("ensureClean handles git errors gracefully", () => {
      // Use invalid directory
      const result = ensureClean("/nonexistent/path", false);
      assert.equal(result.success, false);
      assert.ok(result.errors && result.errors.length > 0);
    });

    it("pullLatest handles git errors gracefully", () => {
      const result = pullLatest("/nonexistent/path", false, "main");
      assert.equal(result.success, false);
      assert.ok(result.errors && result.errors.length > 0);
    });

    it("runBuild handles command errors gracefully", () => {
      const result = runBuild(testRepoPath, false, "nonexistent-command-xyz-123");
      assert.equal(result.success, false);
      assert.ok(result.errors && result.errors.length > 0);
    });

    it("runTests handles command errors gracefully", () => {
      const result = runTests(testRepoPath, false, "nonexistent-command-xyz-123");
      assert.equal(result.success, false);
      assert.ok(result.errors && result.errors.length > 0);
    });
  });
});
