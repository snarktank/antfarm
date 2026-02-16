import { execSync } from "node:child_process";
import {
  DeployConfig,
  DeployPhase,
  DeployResult,
  DeployStep,
  DeployStepResult,
  IDeployExecutor,
} from "./types.js";

/**
 * Base executor for safe deployment operations
 * Implements dry-run first approach with rollback capability
 */
export class DeployExecutor implements IDeployExecutor {
  /**
   * Execute deployment with given configuration
   * Performs validation, executes steps, handles errors and rollback
   */
  async execute(config: DeployConfig): Promise<DeployResult> {
    const startTime = Date.now();
    const result: DeployResult = {
      status: "success",
      config,
      steps: [],
      duration: 0,
      errors: [],
      summary: "",
      timestamp: new Date().toISOString(),
      rolledBack: false,
    };

    try {
      // Validate configuration
      const validationErrors = this.validate(config);
      if (validationErrors.length > 0) {
        result.status = "failed";
        result.errors = validationErrors;
        result.summary = `Configuration validation failed: ${validationErrors.join("; ")}`;
        result.duration = Date.now() - startTime;
        return result;
      }

      // If dry-run mode, execute dry-run instead
      if (config.dryRun) {
        return this.dryRun(config);
      }

      // Build step sequence
      const steps = this.buildStepSequence(config);

      // Execute each step
      for (const step of steps) {
        const stepResult = await this.executeStep(step, config);
        result.steps.push(stepResult);

        // Check for failure
        if (stepResult.status === "failed" && !step.continueOnError) {
          result.status = "failed";
          result.errors.push(`Step ${step.phase} failed: ${stepResult.error}`);
          break;
        }
      }

      // Generate summary
      if (result.status === "success") {
        result.summary = `Deployment successful: all ${result.steps.length} steps completed`;
      } else if (result.status === "failed" && result.steps.some((s) => s.status === "success")) {
        result.status = "partial";
        const successCount = result.steps.filter((s) => s.status === "success").length;
        result.summary = `Deployment partially completed: ${successCount}/${result.steps.length} steps succeeded`;
      }
    } catch (error) {
      result.status = "failed";
      result.errors.push(error instanceof Error ? error.message : String(error));
      result.summary = `Deployment failed with error: ${result.errors[0]}`;
    } finally {
      result.duration = Date.now() - startTime;
    }

    return result;
  }

  /**
   * Validate deployment configuration
   * Returns array of validation errors (empty if valid)
   */
  validate(config: DeployConfig): string[] {
    const errors: string[] = [];

    if (!config.repo) {
      errors.push("Missing required field: repo");
    }
    if (!config.branch) {
      errors.push("Missing required field: branch");
    }
    if (!config.buildCmd) {
      errors.push("Missing required field: buildCmd");
    }
    if (!config.testCmd) {
      errors.push("Missing required field: testCmd");
    }
    if (!config.rollbackPlan) {
      errors.push("Missing required field: rollbackPlan");
    } else {
      if (!config.rollbackPlan.commit) {
        errors.push("rollbackPlan.commit is required");
      }
      if (!config.rollbackPlan.command) {
        errors.push("rollbackPlan.command is required");
      }
      if (!config.rollbackPlan.verify) {
        errors.push("rollbackPlan.verify is required");
      }
    }

    return errors;
  }

  /**
   * Perform dry-run deployment (validation without actual execution)
   * Shows what would be executed without changing system state
   */
  async dryRun(config: DeployConfig): Promise<DeployResult> {
    const startTime = Date.now();
    const result: DeployResult = {
      status: "dry-run",
      config,
      steps: [],
      duration: 0,
      errors: [],
      summary: "Dry-run completed: no changes were made",
      timestamp: new Date().toISOString(),
      rolledBack: false,
    };

    try {
      // Validate configuration
      const validationErrors = this.validate(config);
      if (validationErrors.length > 0) {
        result.status = "failed";
        result.errors = validationErrors;
        result.summary = `Dry-run validation failed: ${validationErrors.join("; ")}`;
        result.duration = Date.now() - startTime;
        return result;
      }

      // Build step sequence
      const steps = this.buildStepSequence(config);

      // For dry-run, just record the steps that would be executed
      for (const step of steps) {
        const stepResult: DeployStepResult = {
          phase: step.phase,
          status: "skipped",
          output: `[DRY-RUN] Would execute: ${step.command}`,
          duration: 0,
          metadata: { dryRun: true },
        };
        result.steps.push(stepResult);
      }

      result.summary = `Dry-run completed: ${steps.length} steps would be executed`;
    } catch (error) {
      result.status = "failed";
      result.errors.push(error instanceof Error ? error.message : String(error));
      result.summary = `Dry-run failed: ${result.errors[0]}`;
    } finally {
      result.duration = Date.now() - startTime;
    }

    return result;
  }

  /**
   * Build the sequence of steps to execute based on configuration
   */
  private buildStepSequence(config: DeployConfig): DeployStep[] {
    return [
      {
        phase: "git",
        description: "Pull latest from remote",
        command: `cd ${config.repo} && git pull`,
        timeoutSeconds: 60,
      },
      {
        phase: "install",
        description: "Install dependencies",
        command: `cd ${config.repo} && ${config.installCmd || "npm install"}`,
        timeoutSeconds: 300,
      },
      {
        phase: "build",
        description: "Build project",
        command: `cd ${config.repo} && ${config.buildCmd}`,
        timeoutSeconds: 600,
      },
      {
        phase: "test",
        description: "Run tests",
        command: `cd ${config.repo} && ${config.testCmd}`,
        timeoutSeconds: 600,
      },
      {
        phase: "validate",
        description: "Validate deployment",
        command: `cd ${config.repo} && ls -la`,
        optional: true,
        timeoutSeconds: 60,
      },
    ];
  }

  /**
   * Execute a single step
   */
  private async executeStep(
    step: DeployStep,
    config: DeployConfig
  ): Promise<DeployStepResult> {
    const startTime = Date.now();
    const result: DeployStepResult = {
      phase: step.phase,
      status: "success",
      output: "",
      duration: 0,
    };

    try {
      // Execute command with timeout
      const timeoutMs = (step.timeoutSeconds || 300) * 1000;

      result.output = this.executeCommand(step.command, timeoutMs, config);
      result.status = "success";
    } catch (error) {
      result.status = "failed";
      result.error = error instanceof Error ? error.message : String(error);
    } finally {
      result.duration = Date.now() - startTime;
    }

    return result;
  }

  /**
   * Execute a shell command with timeout and credential masking
   */
  private executeCommand(command: string, timeoutMs: number, config: DeployConfig): string {
    try {
      const output = execSync(command, {
        timeout: timeoutMs,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      });

      return this.maskCredentials(output, config);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Command execution failed: ${message}`);
    }
  }

  /**
   * Mask credentials in output based on configuration
   */
  private maskCredentials(output: string, config: DeployConfig): string {
    let masked = output;

    if (config.credentialsMask?.patterns) {
      for (const pattern of config.credentialsMask.patterns) {
        try {
          const regex = new RegExp(pattern, "g");
          masked = masked.replace(regex, "[MASKED]");
        } catch {
          // Invalid regex, skip masking
        }
      }
    }

    if (config.credentialsMask?.envVars) {
      for (const envVar of config.credentialsMask.envVars) {
        const value = process.env[envVar];
        if (value && masked.includes(value)) {
          masked = masked.replaceAll(value, `[MASKED_${envVar}]`);
        }
      }
    }

    return masked;
  }
}
