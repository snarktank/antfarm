/**
 * Deploy module - Safe, automated deployment pipeline
 *
 * Provides core types and executor for reliable, repeatable deployments
 * with built-in rollback capability and credential masking.
 */

export type {
  RollbackPlan,
  CredentialsMask,
  DeployConfig,
  DeployPhase,
  DeployStepResult,
  DeployStep,
  DeployResult,
  IDeployExecutor,
} from "./types.js";

export type { MergeCommitMetadata, MergeDetectionResult } from "./deploy-detector.js";
export type { GitOperationResult, GitLogger } from "./git-executor.js";

export { DeployExecutor } from "./deploy-executor.js";
export { DeployDetector } from "./deploy-detector.js";
export { GitExecutor } from "./git-executor.js";
