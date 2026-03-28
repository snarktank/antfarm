/**
 * Regression test for fix-005: Sanitize git command inputs.
 * Verifies that:
 * 1. Branch name validation rejects unsafe characters
 * 2. Valid branch names are accepted
 * 3. computeHasFrontendChanges validates branch input before git operations
 * 4. CLI git operations use execFileSync instead of execSync
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { validateBranchName, computeHasFrontendChanges } from "../dist/installer/step-ops.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const srcRoot = join(__dirname, "..", "src");

describe("fix-005: git input sanitization", () => {
  describe("validateBranchName", () => {
    it("accepts valid branch names", () => {
      const validNames = [
        "main",
        "feature/my-branch",
        "fix-001",
        "release/v1.2.3",
        "security-audit-2026-03-28",
        "user_branch.name",
        "a",
      ];
      for (const name of validNames) {
        assert.doesNotThrow(() => validateBranchName(name), `Should accept: ${name}`);
      }
    });

    it("rejects branch names with shell metacharacters", () => {
      const dangerous = [
        "branch; rm -rf /",
        "branch && echo pwned",
        "branch | cat /etc/passwd",
        "branch$(whoami)",
        "branch`id`",
        "branch name with spaces",
        "branch\nnewline",
      ];
      for (const name of dangerous) {
        assert.throws(() => validateBranchName(name), /Invalid branch name/, `Should reject: ${name}`);
      }
    });

    it("rejects branch names with path traversal (..)", () => {
      assert.throws(() => validateBranchName("feature/../../../etc/passwd"), /Invalid branch name/);
      assert.throws(() => validateBranchName("a..b"), /Invalid branch name/);
    });

    it("rejects empty and overly long branch names", () => {
      assert.throws(() => validateBranchName(""), /Invalid branch name/);
      assert.throws(() => validateBranchName("a".repeat(256)), /Invalid branch name/);
    });

    it("rejects branch names starting with a hyphen", () => {
      assert.throws(() => validateBranchName("-flag-injection"), /Invalid branch name/);
    });
  });

  describe("computeHasFrontendChanges with unsafe input", () => {
    it("returns 'false' for malicious branch names instead of executing them", () => {
      // Should not throw — the function catches errors and returns "false"
      // The important thing is it doesn't execute the malicious input
      const result = computeHasFrontendChanges("/tmp", "; echo pwned");
      assert.equal(result, "false");
    });
  });

  describe("source code uses execFileSync instead of execSync for git", () => {
    it("cli.ts does not use execSync", () => {
      const cliSrc = readFileSync(join(srcRoot, "cli", "cli.ts"), "utf-8");
      // Should not import execSync (only execFileSync)
      assert.ok(
        !cliSrc.includes('import { execSync }'),
        "cli.ts should not import execSync directly"
      );
      // Should not call execSync("git ...")
      assert.ok(
        !cliSrc.includes('execSync("git'),
        "cli.ts should not call execSync for git operations"
      );
      // Should use execFileSync for git
      assert.ok(
        cliSrc.includes('execFileSync("git"'),
        "cli.ts should use execFileSync for git operations"
      );
    });

    it("step-ops.ts does not import execSync", () => {
      const stepOpsSrc = readFileSync(join(srcRoot, "installer", "step-ops.ts"), "utf-8");
      // Should not have execSync in import (only execFileSync)
      assert.ok(
        !stepOpsSrc.includes("execSync,") && !stepOpsSrc.includes("{ execSync }"),
        "step-ops.ts should not import execSync"
      );
    });

    it("uninstall.ts does not use execSync", () => {
      const uninstallSrc = readFileSync(join(srcRoot, "installer", "uninstall.ts"), "utf-8");
      assert.ok(
        !uninstallSrc.includes('import { execSync }'),
        "uninstall.ts should not import execSync directly"
      );
    });
  });
});
