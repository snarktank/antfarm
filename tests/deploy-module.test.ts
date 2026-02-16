import { describe, it } from "node:test";
import assert from "node:assert";
import type {
  DeployConfig,
  DeployResult,
  DeployStep,
  DeployPhase,
  DeployStepResult,
  RollbackPlan,
} from "../dist/deploy/index.js";
import { DeployExecutor } from "../dist/deploy/index.js";

describe("Deploy Module Types", () => {
  describe("RollbackPlan type", () => {
    it("should have required fields: commit, command, verify", () => {
      const rollbackPlan: RollbackPlan = {
        commit: "abc123",
        command: "git revert abc123",
        verify: "npm test",
      };
      assert.strictEqual(rollbackPlan.commit, "abc123");
      assert.strictEqual(rollbackPlan.command, "git revert abc123");
      assert.strictEqual(rollbackPlan.verify, "npm test");
    });

    it("should support optional fields: timeoutSeconds, notifyChannels", () => {
      const rollbackPlan: RollbackPlan = {
        commit: "abc123",
        command: "git revert abc123",
        verify: "npm test",
        timeoutSeconds: 300,
        notifyChannels: ["telegram", "slack"],
      };
      assert.strictEqual(rollbackPlan.timeoutSeconds, 300);
      assert.deepStrictEqual(rollbackPlan.notifyChannels, ["telegram", "slack"]);
    });
  });

  describe("DeployConfig type", () => {
    it("should have required fields: repo, branch, buildCmd, testCmd, rollbackPlan", () => {
      const config: DeployConfig = {
        repo: "/path/to/repo",
        branch: "main",
        buildCmd: "npm run build",
        testCmd: "npm test",
        rollbackPlan: {
          commit: "prev_commit",
          command: "git revert prev_commit",
          verify: "npm test",
        },
      };
      assert.strictEqual(config.repo, "/path/to/repo");
      assert.strictEqual(config.branch, "main");
      assert.strictEqual(config.buildCmd, "npm run build");
      assert.strictEqual(config.testCmd, "npm test");
      assert.ok(config.rollbackPlan);
    });

    it("should support optional fields: installCmd, credentialsMask, env, timeoutSeconds, dryRun", () => {
      const config: DeployConfig = {
        repo: "/path/to/repo",
        branch: "main",
        buildCmd: "npm run build",
        testCmd: "npm test",
        installCmd: "npm install --ci",
        rollbackPlan: {
          commit: "prev",
          command: "git revert prev",
          verify: "npm test",
        },
        credentialsMask: {
          patterns: ["token=([\\w-]+)"],
          envVars: ["API_KEY", "DATABASE_PASSWORD"],
        },
        env: { NODE_ENV: "production" },
        timeoutSeconds: 3600,
        dryRun: true,
      };
      assert.strictEqual(config.installCmd, "npm install --ci");
      assert.ok(config.credentialsMask);
      assert.strictEqual(config.env?.NODE_ENV, "production");
      assert.strictEqual(config.timeoutSeconds, 3600);
      assert.strictEqual(config.dryRun, true);
    });
  });

  describe("DeployPhase type", () => {
    it("should accept valid phase values: git, install, build, test, validate", () => {
      const phases: DeployPhase[] = ["git", "install", "build", "test", "validate"];
      assert.strictEqual(phases.length, 5);
      assert.ok(phases.includes("git"));
      assert.ok(phases.includes("build"));
    });
  });

  describe("DeployStepResult type", () => {
    it("should have required fields: phase, status, output, duration", () => {
      const stepResult: DeployStepResult = {
        phase: "build",
        status: "success",
        output: "Build completed successfully",
        duration: 1500,
      };
      assert.strictEqual(stepResult.phase, "build");
      assert.strictEqual(stepResult.status, "success");
      assert.strictEqual(stepResult.output, "Build completed successfully");
      assert.strictEqual(stepResult.duration, 1500);
    });

    it("should support status values: success, failed, skipped", () => {
      const results = [
        { phase: "git" as DeployPhase, status: "success" as const, output: "", duration: 0 },
        { phase: "install" as DeployPhase, status: "failed" as const, output: "", duration: 0 },
        { phase: "test" as DeployPhase, status: "skipped" as const, output: "", duration: 0 },
      ];
      assert.strictEqual(results.length, 3);
    });

    it("should support optional fields: error, metadata", () => {
      const stepResult: DeployStepResult = {
        phase: "test",
        status: "failed",
        output: "Tests failed",
        error: "Test suite exited with code 1",
        duration: 2000,
        metadata: { failedTests: 5, passedTests: 45 },
      };
      assert.strictEqual(stepResult.error, "Test suite exited with code 1");
      assert.ok(stepResult.metadata);
      assert.strictEqual(stepResult.metadata.failedTests, 5);
    });
  });

  describe("DeployStep type", () => {
    it("should have required fields: phase, description, command", () => {
      const step: DeployStep = {
        phase: "build",
        description: "Compile TypeScript and bundle assets",
        command: "npm run build",
      };
      assert.strictEqual(step.phase, "build");
      assert.strictEqual(step.description, "Compile TypeScript and bundle assets");
      assert.strictEqual(step.command, "npm run build");
    });

    it("should support optional fields: optional, continueOnError, timeoutSeconds", () => {
      const step: DeployStep = {
        phase: "validate",
        description: "Post-deploy validation",
        command: "npm run validate",
        optional: true,
        continueOnError: true,
        timeoutSeconds: 120,
      };
      assert.strictEqual(step.optional, true);
      assert.strictEqual(step.continueOnError, true);
      assert.strictEqual(step.timeoutSeconds, 120);
    });
  });

  describe("DeployResult type", () => {
    it("should have required fields: status, config, steps, duration, errors, summary, timestamp, rolledBack", () => {
      const config: DeployConfig = {
        repo: "/repo",
        branch: "main",
        buildCmd: "npm run build",
        testCmd: "npm test",
        rollbackPlan: { commit: "x", command: "y", verify: "z" },
      };

      const result: DeployResult = {
        status: "success",
        config,
        steps: [],
        duration: 5000,
        errors: [],
        summary: "Deployment successful",
        timestamp: new Date().toISOString(),
        rolledBack: false,
      };

      assert.strictEqual(result.status, "success");
      assert.ok(result.config);
      assert.strictEqual(result.steps.length, 0);
      assert.strictEqual(result.duration, 5000);
      assert.deepStrictEqual(result.errors, []);
      assert.strictEqual(result.summary, "Deployment successful");
      assert.ok(result.timestamp);
      assert.strictEqual(result.rolledBack, false);
    });

    it("should support status values: success, failed, partial, dry-run", () => {
      const config: DeployConfig = {
        repo: "/repo",
        branch: "main",
        buildCmd: "npm run build",
        testCmd: "npm test",
        rollbackPlan: { commit: "x", command: "y", verify: "z" },
      };

      const statuses: DeployResult["status"][] = ["success", "failed", "partial", "dry-run"];
      assert.strictEqual(statuses.length, 4);

      for (const status of statuses) {
        const result: DeployResult = {
          status,
          config,
          steps: [],
          duration: 0,
          errors: [],
          summary: `Deployment status: ${status}`,
          timestamp: new Date().toISOString(),
          rolledBack: false,
        };
        assert.strictEqual(result.status, status);
      }
    });

    it("should support optional field: rollbackDetails", () => {
      const config: DeployConfig = {
        repo: "/repo",
        branch: "main",
        buildCmd: "npm run build",
        testCmd: "npm test",
        rollbackPlan: { commit: "x", command: "y", verify: "z" },
      };

      const result: DeployResult = {
        status: "failed",
        config,
        steps: [],
        duration: 10000,
        errors: ["Build failed"],
        summary: "Deployment failed, rolled back",
        timestamp: new Date().toISOString(),
        rolledBack: true,
        rollbackDetails: {
          status: "success",
          duration: 5000,
        },
      };

      assert.strictEqual(result.rolledBack, true);
      assert.ok(result.rollbackDetails);
      assert.strictEqual(result.rollbackDetails.status, "success");
    });
  });
});

describe("DeployExecutor class", () => {
  describe("instantiation", () => {
    it("should create a new DeployExecutor instance", () => {
      const executor = new DeployExecutor();
      assert.ok(executor);
      assert.strictEqual(typeof executor, "object");
    });

    it("should have execute method", () => {
      const executor = new DeployExecutor();
      assert.strictEqual(typeof executor.execute, "function");
    });

    it("should have validate method", () => {
      const executor = new DeployExecutor();
      assert.strictEqual(typeof executor.validate, "function");
    });

    it("should have dryRun method", () => {
      const executor = new DeployExecutor();
      assert.strictEqual(typeof executor.dryRun, "function");
    });
  });

  describe("validate method", () => {
    it("should return no errors for valid configuration", () => {
      const executor = new DeployExecutor();
      const config: DeployConfig = {
        repo: "/repo",
        branch: "main",
        buildCmd: "npm run build",
        testCmd: "npm test",
        rollbackPlan: {
          commit: "abc",
          command: "git revert abc",
          verify: "npm test",
        },
      };

      const errors = executor.validate(config);
      assert.deepStrictEqual(errors, []);
    });

    it("should detect missing repo field", () => {
      const executor = new DeployExecutor();
      const config: any = {
        branch: "main",
        buildCmd: "npm run build",
        testCmd: "npm test",
        rollbackPlan: {
          commit: "abc",
          command: "git revert abc",
          verify: "npm test",
        },
      };

      const errors = executor.validate(config);
      assert.ok(errors.some((e) => e.includes("repo")));
    });

    it("should detect missing branch field", () => {
      const executor = new DeployExecutor();
      const config: any = {
        repo: "/repo",
        buildCmd: "npm run build",
        testCmd: "npm test",
        rollbackPlan: {
          commit: "abc",
          command: "git revert abc",
          verify: "npm test",
        },
      };

      const errors = executor.validate(config);
      assert.ok(errors.some((e) => e.includes("branch")));
    });

    it("should detect missing buildCmd field", () => {
      const executor = new DeployExecutor();
      const config: any = {
        repo: "/repo",
        branch: "main",
        testCmd: "npm test",
        rollbackPlan: {
          commit: "abc",
          command: "git revert abc",
          verify: "npm test",
        },
      };

      const errors = executor.validate(config);
      assert.ok(errors.some((e) => e.includes("buildCmd")));
    });

    it("should detect missing testCmd field", () => {
      const executor = new DeployExecutor();
      const config: any = {
        repo: "/repo",
        branch: "main",
        buildCmd: "npm run build",
        rollbackPlan: {
          commit: "abc",
          command: "git revert abc",
          verify: "npm test",
        },
      };

      const errors = executor.validate(config);
      assert.ok(errors.some((e) => e.includes("testCmd")));
    });

    it("should detect missing rollbackPlan field", () => {
      const executor = new DeployExecutor();
      const config: any = {
        repo: "/repo",
        branch: "main",
        buildCmd: "npm run build",
        testCmd: "npm test",
      };

      const errors = executor.validate(config);
      assert.ok(errors.some((e) => e.includes("rollbackPlan")));
    });

    it("should detect missing rollbackPlan.commit", () => {
      const executor = new DeployExecutor();
      const config: any = {
        repo: "/repo",
        branch: "main",
        buildCmd: "npm run build",
        testCmd: "npm test",
        rollbackPlan: {
          command: "git revert",
          verify: "npm test",
        },
      };

      const errors = executor.validate(config);
      assert.ok(errors.some((e) => e.includes("rollbackPlan.commit")));
    });

    it("should detect missing rollbackPlan.command", () => {
      const executor = new DeployExecutor();
      const config: any = {
        repo: "/repo",
        branch: "main",
        buildCmd: "npm run build",
        testCmd: "npm test",
        rollbackPlan: {
          commit: "abc",
          verify: "npm test",
        },
      };

      const errors = executor.validate(config);
      assert.ok(errors.some((e) => e.includes("rollbackPlan.command")));
    });

    it("should detect missing rollbackPlan.verify", () => {
      const executor = new DeployExecutor();
      const config: any = {
        repo: "/repo",
        branch: "main",
        buildCmd: "npm run build",
        testCmd: "npm test",
        rollbackPlan: {
          commit: "abc",
          command: "git revert abc",
        },
      };

      const errors = executor.validate(config);
      assert.ok(errors.some((e) => e.includes("rollbackPlan.verify")));
    });

    it("should return multiple errors for multiple missing fields", () => {
      const executor = new DeployExecutor();
      const config: any = {
        buildCmd: "npm run build",
      };

      const errors = executor.validate(config);
      assert.ok(errors.length > 2);
    });
  });

  describe("dryRun method", () => {
    it("should return dry-run status for valid configuration", async () => {
      const executor = new DeployExecutor();
      const config: DeployConfig = {
        repo: "/repo",
        branch: "main",
        buildCmd: "npm run build",
        testCmd: "npm test",
        rollbackPlan: {
          commit: "abc",
          command: "git revert abc",
          verify: "npm test",
        },
        dryRun: true,
      };

      const result = await executor.dryRun(config);
      assert.strictEqual(result.status, "dry-run");
      assert.ok(result.steps.length > 0);
      assert.ok(result.steps.every((s) => s.status === "skipped"));
    });

    it("should skip execution in dry-run mode", async () => {
      const executor = new DeployExecutor();
      const config: DeployConfig = {
        repo: "/repo",
        branch: "main",
        buildCmd: "npm run build",
        testCmd: "npm test",
        rollbackPlan: {
          commit: "abc",
          command: "git revert abc",
          verify: "npm test",
        },
        dryRun: true,
      };

      const result = await executor.dryRun(config);
      assert.ok(result.steps.every((s) => s.output.includes("[DRY-RUN]")));
    });

    it("should validate configuration in dry-run", async () => {
      const executor = new DeployExecutor();
      const config: any = {
        branch: "main",
        buildCmd: "npm run build",
        testCmd: "npm test",
        // missing repo
      };

      const result = await executor.dryRun(config);
      assert.strictEqual(result.status, "failed");
      assert.ok(result.errors.length > 0);
    });

    it("should record steps that would be executed", async () => {
      const executor = new DeployExecutor();
      const config: DeployConfig = {
        repo: "/repo",
        branch: "main",
        buildCmd: "npm run build",
        testCmd: "npm test",
        rollbackPlan: {
          commit: "abc",
          command: "git revert abc",
          verify: "npm test",
        },
        dryRun: true,
      };

      const result = await executor.dryRun(config);
      const phases = result.steps.map((s) => s.phase);
      assert.ok(phases.includes("git"));
      assert.ok(phases.includes("install"));
      assert.ok(phases.includes("build"));
      assert.ok(phases.includes("test"));
    });
  });

  describe("execute method", () => {
    it("should return failed status for invalid configuration", async () => {
      const executor = new DeployExecutor();
      const config: any = {
        repo: "/repo",
        // missing required fields
      };

      const result = await executor.execute(config);
      assert.strictEqual(result.status, "failed");
      assert.ok(result.errors.length > 0);
    });

    it("should execute dry-run when dryRun flag is set", async () => {
      const executor = new DeployExecutor();
      const config: DeployConfig = {
        repo: "/repo",
        branch: "main",
        buildCmd: "npm run build",
        testCmd: "npm test",
        rollbackPlan: {
          commit: "abc",
          command: "git revert abc",
          verify: "npm test",
        },
        dryRun: true,
      };

      const result = await executor.execute(config);
      assert.strictEqual(result.status, "dry-run");
    });

    it("should set timestamp on execution", async () => {
      const executor = new DeployExecutor();
      const config: DeployConfig = {
        repo: "/repo",
        branch: "main",
        buildCmd: "npm run build",
        testCmd: "npm test",
        rollbackPlan: {
          commit: "abc",
          command: "git revert abc",
          verify: "npm test",
        },
        dryRun: true,
      };

      const result = await executor.execute(config);
      assert.ok(result.timestamp);
      assert.strictEqual(typeof result.timestamp, "string");
      // Should be ISO format
      assert.ok(!isNaN(new Date(result.timestamp).getTime()));
    });

    it("should measure execution duration", async () => {
      const executor = new DeployExecutor();
      const config: DeployConfig = {
        repo: "/repo",
        branch: "main",
        buildCmd: "npm run build",
        testCmd: "npm test",
        rollbackPlan: {
          commit: "abc",
          command: "git revert abc",
          verify: "npm test",
        },
        dryRun: true,
      };

      const result = await executor.execute(config);
      assert.ok(result.duration >= 0);
      assert.strictEqual(typeof result.duration, "number");
    });

    it("should include config in result", async () => {
      const executor = new DeployExecutor();
      const config: DeployConfig = {
        repo: "/repo",
        branch: "main",
        buildCmd: "npm run build",
        testCmd: "npm test",
        rollbackPlan: {
          commit: "abc",
          command: "git revert abc",
          verify: "npm test",
        },
        dryRun: true,
      };

      const result = await executor.execute(config);
      assert.deepStrictEqual(result.config, config);
    });

    it("should generate summary message", async () => {
      const executor = new DeployExecutor();
      const config: DeployConfig = {
        repo: "/repo",
        branch: "main",
        buildCmd: "npm run build",
        testCmd: "npm test",
        rollbackPlan: {
          commit: "abc",
          command: "git revert abc",
          verify: "npm test",
        },
        dryRun: true,
      };

      const result = await executor.execute(config);
      assert.ok(result.summary);
      assert.strictEqual(typeof result.summary, "string");
      assert.ok(result.summary.length > 0);
    });
  });
});
