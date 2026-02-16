import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("Git Injection Prevention - Branch Name Validation", () => {
  // Test the regex that validates branch names
  const branchNameRegex = /^[a-zA-Z0-9_./][a-zA-Z0-9_.\-/]*$/;

  function isValidBranchName(branch: string): boolean {
    return branchNameRegex.test(branch);
  }

  describe("Valid branch names should be accepted", () => {
    it("should accept simple branch names", () => {
      const validBranches = [
        "main",
        "master",
        "develop",
        "feature",
      ];

      for (const branch of validBranches) {
        assert.ok(
          isValidBranchName(branch),
          `Branch name "${branch}" should be valid`
        );
      }
    });

    it("should accept branch names with slashes", () => {
      const validBranches = [
        "feature/new-feature",
        "bugfix/issue-123",
        "release/v1.0.0",
        "hotfix/critical-bug",
        "docs/update-readme",
      ];

      for (const branch of validBranches) {
        assert.ok(
          isValidBranchName(branch),
          `Branch name "${branch}" should be valid (contains slashes)`
        );
      }
    });

    it("should accept branch names with dashes and underscores", () => {
      const validBranches = [
        "my-feature",
        "my_feature",
        "my-feature-name",
        "my_feature_name",
        "my-feature_name",
      ];

      for (const branch of validBranches) {
        assert.ok(
          isValidBranchName(branch),
          `Branch name "${branch}" should be valid (contains dashes/underscores)`
        );
      }
    });

    it("should accept branch names with dots", () => {
      const validBranches = [
        "release.v1.0.0",
        "release.1.0",
        "feature.new",
      ];

      for (const branch of validBranches) {
        assert.ok(
          isValidBranchName(branch),
          `Branch name "${branch}" should be valid (contains dots)`
        );
      }
    });

    it("should accept branch names starting with alphanumeric", () => {
      const validBranches = [
        "1-feature",
        "123-test",
        "a-branch",
        "Z-branch",
        "_underscore-start", // underscore is allowed at start per regex
      ];

      for (const branch of validBranches) {
        assert.ok(
          isValidBranchName(branch),
          `Branch name "${branch}" should be valid (starts with alphanumeric)`
        );
      }
    });
  });

  describe("Invalid branch names should be rejected", () => {
    it("should reject branch names starting with dash (prevents flag injection)", () => {
      const invalidBranches = [
        "-invalid",
        "-f",
        "--force",
        "--allow-unrelated-histories",
        "--graph",
        "-m",
      ];

      for (const branch of invalidBranches) {
        assert.ok(
          !isValidBranchName(branch),
          `Branch name "${branch}" should be invalid (starts with dash)`
        );
      }
    });

    it("should reject branch names with special characters", () => {
      const invalidBranches = [
        "feature@new",
        "feature#new",
        "feature$new",
        "feature%new",
        "feature&new",
        "feature*new",
        "feature new", // spaces
        "feature\nnew", // newlines
      ];

      for (const branch of invalidBranches) {
        assert.ok(
          !isValidBranchName(branch),
          `Branch name "${branch}" should be invalid (contains special characters)`
        );
      }
    });

    it("should reject empty branch names", () => {
      assert.ok(
        !isValidBranchName(""),
        "Empty branch name should be invalid"
      );
    });

    it("should reject branch names with only dashes", () => {
      const invalidBranches = [
        "-",
        "--",
        "---",
      ];

      for (const branch of invalidBranches) {
        assert.ok(
          !isValidBranchName(branch),
          `Branch name "${branch}" should be invalid`
        );
      }
    });
  });

  describe("Security: Git flag injection prevention", () => {
    it("should prevent --global flag injection", () => {
      const injectedBranches = [
        "--global",
        "--local",
        "--system",
      ];

      for (const branch of injectedBranches) {
        assert.ok(
          !isValidBranchName(branch),
          `Git flag "${branch}" should be rejected to prevent injection`
        );
      }
    });

    it("should prevent dangerous git options", () => {
      const dangerousBranches = [
        "--no-verify",
        "--allow-unrelated-histories",
        "--ignore-all-space",
        "--stat",
        "--shortstat",
      ];

      for (const branch of dangerousBranches) {
        assert.ok(
          !isValidBranchName(branch),
          `Git option "${branch}" should be rejected`
        );
      }
    });

    it("should prevent command injection via semicolons (defense in depth)", () => {
      const injectionAttempts = [
        "main; rm -rf /",
        "feature; cat /etc/passwd",
      ];

      for (const branch of injectionAttempts) {
        assert.ok(
          !isValidBranchName(branch),
          `Branch name with semicolon "${branch}" should be rejected`
        );
      }
    });

    it("should prevent pipe and redirect injection attempts", () => {
      const injectionAttempts = [
        "main | cat",
        "main > /tmp/file",
        "main < /etc/passwd",
        "main >> /tmp/file",
      ];

      for (const branch of injectionAttempts) {
        assert.ok(
          !isValidBranchName(branch),
          `Branch name with pipes/redirects "${branch}" should be rejected`
        );
      }
    });
  });

  describe("Edge cases", () => {
    it("should handle very long branch names", () => {
      // Git branch names can be quite long
      const longBranch = "feature/" + "a".repeat(200);
      assert.ok(
        isValidBranchName(longBranch),
        "Long but valid branch names should be accepted"
      );
    });

    it("should handle unicode characters (should be rejected for safety)", () => {
      const unicodeBranches = [
        "feature/🚀",
        "feature/café",
        "feature/中文",
      ];

      for (const branch of unicodeBranches) {
        // These should be rejected as they're not ASCII alphanumeric
        assert.ok(
          !isValidBranchName(branch),
          `Unicode branch name "${branch}" should be rejected`
        );
      }
    });

    it("should handle consecutive slashes and dashes", () => {
      const testBranches = [
        "feature//double-slash",
        "feature--double-dash",
      ];

      for (const branch of testBranches) {
        // Our regex should accept these (they're technically valid git names)
        // The key thing is they don't start with dash
        const isValid = isValidBranchName(branch);
        assert.ok(
          isValid === true,
          `Branch name "${branch}" validation: ${isValid}`
        );
      }
    });
  });

  describe("Integration with git commands", () => {
    it("validated branch names should be safe for git diff command", () => {
      // Example of how validated branches are used:
      // git diff --name-only main..${branch}
      
      // If someone tries to inject:
      const maliciousBranch = "--allow-unrelated-histories";
      assert.ok(
        !isValidBranchName(maliciousBranch),
        "Should not allow branch that looks like git flag"
      );

      // The command would become:
      // git diff --name-only main..--allow-unrelated-histories
      // Which is safe because the injected flag comes after the ref argument
    });

    it("should allow semantic versioning style branch names", () => {
      const versionBranches = [
        "release/1.0.0",
        "release/2.3.4-beta",
      ];

      for (const branch of versionBranches) {
        assert.ok(
          isValidBranchName(branch),
          `Version branch "${branch}" should be valid`
        );
      }
    });
  });
});
