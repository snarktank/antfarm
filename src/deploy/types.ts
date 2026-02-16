/**
 * Deploy module types for safe, automated deployment pipeline
 */

/**
 * Rollback plan specifies how to reverse a failed deployment
 */
export interface RollbackPlan {
  /** Commit hash or ref to revert to */
  commit: string;
  /** Command to execute for rollback (e.g., npm run rollback) */
  command: string;
  /** How to verify rollback succeeded */
  verify: string;
  /** Estimated time in seconds for rollback */
  timeoutSeconds?: number;
  /** Who to notify on rollback execution */
  notifyChannels?: string[];
}

/**
 * Credentials masking rules for deploy logs
 */
export interface CredentialsMask {
  /** Regex patterns to mask in output */
  patterns?: string[];
  /** Environment variable names to mask */
  envVars?: string[];
}

/**
 * Deploy configuration with all required settings and safety constraints
 */
export interface DeployConfig {
  /** Repository path to deploy */
  repo: string;
  /** Branch to deploy */
  branch: string;
  /** Build command (e.g., npm run build) */
  buildCmd: string;
  /** Test command (e.g., npm test) */
  testCmd: string;
  /** Install command (default: npm install) */
  installCmd?: string;
  /** Rollback plan for safe reversal */
  rollbackPlan: RollbackPlan;
  /** Credentials masking for logs */
  credentialsMask?: CredentialsMask;
  /** Environment variables for deployment (secrets excluded) */
  env?: Record<string, string>;
  /** Timeout in seconds for entire deploy (default: 3600) */
  timeoutSeconds?: number;
  /** Dry-run mode (no actual deployment) */
  dryRun?: boolean;
}

/**
 * Individual deploy step phases
 */
export type DeployPhase = "git" | "install" | "build" | "test" | "validate";

/**
 * Result of a single deploy step
 */
export interface DeployStepResult {
  /** The phase this step executed */
  phase: DeployPhase;
  /** Success or failure status */
  status: "success" | "failed" | "skipped";
  /** Standard output (with secrets masked) */
  output: string;
  /** Standard error (with secrets masked) */
  error?: string;
  /** Duration in milliseconds */
  duration: number;
  /** Any metadata specific to this phase */
  metadata?: Record<string, unknown>;
}

/**
 * Represents a single step in the deploy sequence
 */
export interface DeployStep {
  /** Phase identifier */
  phase: DeployPhase;
  /** Human-readable description */
  description: string;
  /** Command to execute */
  command: string;
  /** Whether this step is optional */
  optional?: boolean;
  /** Whether to continue on failure */
  continueOnError?: boolean;
  /** Timeout in seconds for this step */
  timeoutSeconds?: number;
}

/**
 * Final result of a complete deployment
 */
export interface DeployResult {
  /** Overall deployment status */
  status: "success" | "failed" | "partial" | "dry-run";
  /** Configuration that was used */
  config: DeployConfig;
  /** Results of each step executed */
  steps: DeployStepResult[];
  /** Total duration in milliseconds */
  duration: number;
  /** Any errors that occurred */
  errors: string[];
  /** Summary message for reporting */
  summary: string;
  /** Timestamp of deployment */
  timestamp: string;
  /** Whether rollback was triggered */
  rolledBack: boolean;
  /** Rollback execution details if triggered */
  rollbackDetails?: {
    status: "success" | "failed";
    error?: string;
    duration: number;
  };
}

/**
 * Executor interface for deploy operations
 */
export interface IDeployExecutor {
  /**
   * Execute a deployment with the given configuration
   * @param config Deployment configuration
   * @returns Deployment result with all step details
   */
  execute(config: DeployConfig): Promise<DeployResult>;

  /**
   * Validate configuration before execution
   * @param config Configuration to validate
   * @returns Validation errors, if any
   */
  validate(config: DeployConfig): string[];

  /**
   * Perform a dry-run deployment
   * @param config Deployment configuration
   * @returns Dry-run result
   */
  dryRun(config: DeployConfig): Promise<DeployResult>;
}
