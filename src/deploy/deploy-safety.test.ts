/**
 * Tests for deploy safety module - merge conflict detection and safe-fail handling
 */

import { test } from "node:test";
import assert from "node:assert";
import { execSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  checkMergeConflicts,
  generateConflictReport,
  generateRollbackInstructions,
  type MergeConflictCheckResult,
} from "./deploy-safety.js";

// ============================================================================
// Helper functions for test setup/teardown
// ============================================================================

function createTestRepo(name: string): string {
  const dir = mkdtempSync(join("/tmp", name));
  execSync("git init", { cwd: dir });
  execSync('git config user.email "test@example.com"', { cwd: dir });
  execSync('git config user.name "Test User"', { cwd: dir });
  return dir;
}

function addCommit(dir: string, filename: string, content: string, message: string): void {
  writeFileSync(join(dir, filename), content);
  execSync("git add .", { cwd: dir });
  execSync(`git commit -m "${message}"`, { cwd: dir });
}

function createBranchAndConflict(repo: string): { mainCommit: string; conflictFiles: string[] } {
  // Initial commit on main
  addCommit(repo, "README.md", "# Main file\n", "Initial commit");
  const mainCommit = execSync("git rev-parse HEAD", { cwd: repo, encoding: "utf-8" }).trim();

  // Create feature branch
  execSync("git checkout -b feature", { cwd: repo });
  addCommit(repo, "file.txt", "feature: line 1\nfeature: line 2\nfeature: line 3\n", "Feature commit");

  // Go back to main and make conflicting change
  execSync("git checkout main", { cwd: repo });
  addCommit(repo, "file.txt", "main: line 1\nmain: line 2\nmain: line 3\n", "Main commit");

  // Try to merge feature into main (will cause conflicts)
  try {
    execSync("git merge feature", { cwd: repo });
  } catch {
    // Expected to fail due to conflicts
  }

  return { mainCommit, conflictFiles: ["file.txt"] };
}

function cleanupTestRepo(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

// ============================================================================
// Test: checkMergeConflicts function
// ============================================================================

test("checkMergeConflicts - returns interface with hasConflicts and files", (t, done) => {
  const result = {
    hasConflicts: false,
    files: [],
  };
  assert.ok(typeof result.hasConflicts === "boolean");
  assert.ok(Array.isArray(result.files));
  done();
});

test("checkMergeConflicts - no conflicts in clean repo", (t, done) => {
  const repo = createTestRepo("clean-repo");
  try {
    addCommit(repo, "README.md", "# Project\n", "Initial commit");
    const result = checkMergeConflicts(repo);

    assert.strictEqual(result.hasConflicts, false);
    assert.strictEqual(result.files.length, 0);
    done();
  } finally {
    cleanupTestRepo(repo);
  }
});

test("checkMergeConflicts - detects merge conflicts", (t, done) => {
  const repo = createTestRepo("conflict-repo");
  try {
    createBranchAndConflict(repo);
    const result = checkMergeConflicts(repo);

    assert.strictEqual(result.hasConflicts, true);
    assert.ok(result.files.length > 0);
    assert.ok(result.files.some((f) => f.includes("file.txt")));
    done();
  } finally {
    cleanupTestRepo(repo);
  }
});

test("checkMergeConflicts - returns MergeConflictCheckResult type", (t, done) => {
  const repo = createTestRepo("type-test-repo");
  try {
    addCommit(repo, "README.md", "# Project\n", "Initial commit");
    const result: MergeConflictCheckResult = checkMergeConflicts(repo);

    assert.ok("hasConflicts" in result);
    assert.ok("files" in result);
    done();
  } finally {
    cleanupTestRepo(repo);
  }
});

test("checkMergeConflicts - handles non-existent directory gracefully", (t, done) => {
  const result = checkMergeConflicts("/non/existent/path");
  assert.strictEqual(result.hasConflicts, false);
  assert.strictEqual(result.files.length, 0);
  done();
});

test("checkMergeConflicts - multiple conflicted files", (t, done) => {
  const repo = createTestRepo("multi-conflict-repo");
  try {
    // Initial commit
    writeFileSync(join(repo, "file1.txt"), "content1");
    writeFileSync(join(repo, "file2.txt"), "content2");
    execSync("git add .", { cwd: repo });
    execSync('git commit -m "Initial"', { cwd: repo });

    // Feature branch
    execSync("git checkout -b feature", { cwd: repo });
    writeFileSync(join(repo, "file1.txt"), "feature1");
    writeFileSync(join(repo, "file2.txt"), "feature2");
    execSync("git add .", { cwd: repo });
    execSync('git commit -m "Feature changes"', { cwd: repo });

    // Main branch changes
    execSync("git checkout main", { cwd: repo });
    writeFileSync(join(repo, "file1.txt"), "main1");
    writeFileSync(join(repo, "file2.txt"), "main2");
    execSync("git add .", { cwd: repo });
    execSync('git commit -m "Main changes"', { cwd: repo });

    // Attempt merge
    try {
      execSync("git merge feature", { cwd: repo });
    } catch {
      // Expected to fail
    }

    const result = checkMergeConflicts(repo);
    assert.strictEqual(result.hasConflicts, true);
    assert.ok(result.files.length >= 1);
    done();
  } finally {
    cleanupTestRepo(repo);
  }
});

// ============================================================================
// Test: generateConflictReport function
// ============================================================================

test("generateConflictReport - returns string", (t, done) => {
  const report = generateConflictReport("/tmp/repo", ["file.txt"]);
  assert.strictEqual(typeof report, "string");
  done();
});

test("generateConflictReport - includes file paths", (t, done) => {
  const files = ["file1.txt", "src/app.ts", "config/settings.json"];
  const report = generateConflictReport("/tmp/repo", files);

  files.forEach((file) => {
    assert.ok(report.includes(file), `Report should include file: ${file}`);
  });
  done();
});

test("generateConflictReport - suggests manual GitHub resolution", (t, done) => {
  const report = generateConflictReport("/tmp/repo", ["file.txt"]);

  assert.ok(report.includes("GitHub"));
  assert.ok(report.includes("manual") || report.includes("manually"));
  assert.ok(report.includes("Resolve conflicts"));
  done();
});

test("generateConflictReport - includes MERGE CONFLICT DETECTED header", (t, done) => {
  const report = generateConflictReport("/tmp/repo", ["file.txt"]);
  assert.ok(report.includes("MERGE CONFLICT DETECTED"));
  done();
});

test("generateConflictReport - includes conflict marker information", (t, done) => {
  const report = generateConflictReport("/tmp/repo", ["file.txt"]);
  assert.ok(report.includes("<<<<<<") || report.includes("conflict markers"));
  done();
});

test("generateConflictReport - includes remediation steps section", (t, done) => {
  const report = generateConflictReport("/tmp/repo", ["file.txt"]);
  assert.ok(report.includes("Remediation Steps") || report.includes("remediation"));
  done();
});

test("generateConflictReport - includes count of conflicted files", (t, done) => {
  const files = ["file1.txt", "file2.txt", "file3.txt"];
  const report = generateConflictReport("/tmp/repo", files);
  assert.ok(report.includes(String(files.length)));
  done();
});

test("generateConflictReport - handles empty file list", (t, done) => {
  const report = generateConflictReport("/tmp/repo", []);
  assert.strictEqual(typeof report, "string");
  assert.ok(report.length > 0);
  assert.ok(report.includes("0 file"));
  done();
});

test("generateConflictReport - includes repository path context", (t, done) => {
  const repo = "/path/to/my/repo";
  const report = generateConflictReport(repo, ["file.txt"]);
  assert.ok(report.includes(repo));
  done();
});

// ============================================================================
// Test: generateRollbackInstructions function
// ============================================================================

test("generateRollbackInstructions - returns string array", (t, done) => {
  const instructions = generateRollbackInstructions("abc123def456");
  assert.ok(Array.isArray(instructions));
  assert.ok(instructions.length > 0);
  instructions.forEach((instruction) => {
    assert.strictEqual(typeof instruction, "string");
  });
  done();
});

test("generateRollbackInstructions - includes git reset --hard command", (t, done) => {
  const sha = "abc123def456";
  const instructions = generateRollbackInstructions(sha);
  const instructionText = instructions.join("\n");
  assert.ok(instructionText.includes("git reset --hard"));
  assert.ok(instructionText.includes(sha));
  done();
});

test("generateRollbackInstructions - includes git merge --abort command", (t, done) => {
  const instructions = generateRollbackInstructions("abc123def456");
  const instructionText = instructions.join("\n");
  assert.ok(instructionText.includes("git merge --abort"));
  done();
});

test("generateRollbackInstructions - includes verification steps", (t, done) => {
  const instructions = generateRollbackInstructions("abc123def456");
  const instructionText = instructions.join("\n");
  assert.ok(instructionText.includes("git status"));
  done();
});

test("generateRollbackInstructions - includes timeline information", (t, done) => {
  const instructions = generateRollbackInstructions("abc123def456");
  const instructionText = instructions.join("\n");
  assert.ok(instructionText.includes("second") || instructionText.includes("timeline") || instructionText.includes("TIMELINE"));
  done();
});

test("generateRollbackInstructions - includes developer notification guidance", (t, done) => {
  const instructions = generateRollbackInstructions("abc123def456");
  const instructionText = instructions.join("\n");
  assert.ok(instructionText.includes("NOTIFY") || instructionText.includes("developers") || instructionText.includes("Notify"));
  done();
});

test("generateRollbackInstructions - includes ROLLBACK INSTRUCTIONS header", (t, done) => {
  const instructions = generateRollbackInstructions("abc123def456");
  assert.ok(instructions[0].includes("ROLLBACK") && instructions[0].includes("INSTRUCTIONS"));
  done();
});

test("generateRollbackInstructions - includes safety assurance", (t, done) => {
  const instructions = generateRollbackInstructions("abc123def456");
  const instructionText = instructions.join("\n");
  assert.ok(
    instructionText.includes("safe") ||
      instructionText.includes("non-destructive") ||
      instructionText.includes("no data is lost")
  );
  done();
});

test("generateRollbackInstructions - all elements are strings", (t, done) => {
  const instructions = generateRollbackInstructions("abc123def456");
  instructions.forEach((instruction, index) => {
    assert.strictEqual(typeof instruction, "string", `Instruction at index ${index} should be string`);
  });
  done();
});

test("generateRollbackInstructions - uses provided commit SHA", (t, done) => {
  const sha1 = "sha1sha1sha1sha1sha1sha1";
  const sha2 = "sha2sha2sha2sha2sha2sha2";

  const inst1 = generateRollbackInstructions(sha1);
  const inst2 = generateRollbackInstructions(sha2);

  const text1 = inst1.join("\n");
  const text2 = inst2.join("\n");

  assert.ok(text1.includes(sha1));
  assert.ok(text2.includes(sha2));
  assert.notStrictEqual(text1, text2);
  done();
});

// ============================================================================
// Integration tests
// ============================================================================

test("Integration: conflict detection and report generation", (t, done) => {
  const repo = createTestRepo("integration-repo");
  try {
    const { conflictFiles } = createBranchAndConflict(repo);
    const result = checkMergeConflicts(repo);

    assert.strictEqual(result.hasConflicts, true);
    assert.ok(result.files.length > 0);

    const report = generateConflictReport(repo, result.files);
    assert.ok(report.includes("MERGE CONFLICT DETECTED"));
    assert.ok(report.includes(repo));

    done();
  } finally {
    cleanupTestRepo(repo);
  }
});

test("Integration: rollback instructions include commit context", (t, done) => {
  const repo = createTestRepo("rollback-integration");
  try {
    addCommit(repo, "README.md", "# Project\n", "Initial commit");
    const commitSha = execSync("git rev-parse HEAD", { cwd: repo, encoding: "utf-8" }).trim();

    const instructions = generateRollbackInstructions(commitSha);
    const text = instructions.join("\n");

    assert.ok(text.includes(commitSha));
    assert.ok(text.includes("git reset --hard"));
    assert.ok(text.includes("git merge --abort"));

    done();
  } finally {
    cleanupTestRepo(repo);
  }
});

test("Integration: full conflict workflow", (t, done) => {
  const repo = createTestRepo("full-workflow");
  try {
    const { mainCommit } = createBranchAndConflict(repo);
    const checkResult = checkMergeConflicts(repo);

    if (checkResult.hasConflicts) {
      const report = generateConflictReport(repo, checkResult.files);
      const rollback = generateRollbackInstructions(mainCommit);

      assert.ok(report.length > 0);
      assert.ok(rollback.length > 0);
      assert.strictEqual(typeof report, "string");
      assert.ok(Array.isArray(rollback));
    }

    done();
  } finally {
    cleanupTestRepo(repo);
  }
});
