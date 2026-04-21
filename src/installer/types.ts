export type WorkflowAgentFiles = {
  baseDir: string;
  files: Record<string, string>;
  skills?: string[];
};

/**
 * Agent roles control tool access during install.
 *
 * - analysis:      Read-only code exploration (planner, prioritizer, reviewer, investigator, triager)
 * - coding:        Full read/write/exec for implementation (developer, fixer, setup)
 * - verification:  Read + exec but NO write — independent verification integrity (verifier)
 * - testing:       Read + exec + browser/web for E2E testing, NO write (tester)
 * - pr:            Read + exec only — just runs `gh pr create` (pr)
 * - scanning:      Read + exec + web search for CVE lookups, NO write (scanner)
 */
export type AgentRole = "analysis" | "coding" | "verification" | "testing" | "pr" | "scanning";

export type WorkflowAgent = {
  id: string;
  name?: string;
  description?: string;
  role?: AgentRole;
  model?: string;
  pollingModel?: string;
  executor?: WorkflowAgentExecutor;
  timeoutSeconds?: number;
  workspace: WorkflowAgentFiles;
};

export type WorkflowAgentExecutor = {
  kind: "claude-code-wrapper";
  command: string;
  model?: string;
  effort?: "low" | "medium" | "high";
  maxTurns?: number;
};

export type PollingConfig = {
  model?: string;
  timeoutSeconds?: number;
};

export type WorkflowStepFailure = {
  retry_step?: string;
  max_retries?: number;
  on_exhausted?: { escalate_to: string } | { escalate_to?: string } | undefined;
  escalate_to?: string;
};

export type LoopConfig = {
  over: "stories";
  completion: "all_done";
  freshSession?: boolean;
  verifyEach?: boolean;
  verifyStep?: string;
};

export type WorkflowStep = {
  id: string;
  agent: string;
  type?: "single" | "loop";
  loop?: LoopConfig;
  input: string;
  expects: string;
  max_retries?: number;
  on_fail?: WorkflowStepFailure;
};

/**
 * How a step must be scheduled against its target repo checkout.
 *
 * - `shared_checkout_exclusive`: v1 serialization. The step mutates the shared
 *   repo checkout, so at most one such step may be active per `repo_key` at a
 *   time. Other same-repo steps queue until the lock is released.
 * - `no_lock`: The step does not need exclusive access to the repo checkout
 *   (read-only analysis, verification of already-committed code, etc.) and
 *   may run alongside other steps.
 *
 * Future modes (e.g. `worktree_isolated`) can be added here once explicit
 * per-run worktrees exist — the scheduler seam is designed so `no_lock`
 * behavior is the fallback and exclusivity is opt-in by mode value.
 */
export type StepExecutionMode = "shared_checkout_exclusive" | "no_lock";

export type Story = {
  id: string;
  runId: string;
  storyIndex: number;
  storyId: string;
  title: string;
  description: string;
  acceptanceCriteria: string[];
  status: "pending" | "running" | "done" | "failed";
  output?: string;
  retryCount: number;
  maxRetries: number;
};

export type WorkflowSpec = {
  id: string;
  name?: string;
  version?: number;
  polling?: PollingConfig;
  agents: WorkflowAgent[];
  steps: WorkflowStep[];
  context?: Record<string, string>;
  notifications?: {
    url?: string;
  };
};

export type WorkflowInstallResult = {
  workflowId: string;
  workflowDir: string;
};

export type StepResult = {
  stepId: string;
  agentId: string;
  output: string;
  status: "done" | "retry" | "blocked";
  completedAt: string;
};

export type WorkflowRunRecord = {
  id: string;
  workflowId: string;
  workflowName?: string;
  taskTitle: string;
  status: "running" | "paused" | "blocked" | "completed" | "canceled";
  leadAgentId: string;
  leadSessionLabel: string;
  currentStepIndex: number;
  currentStepId?: string;
  stepResults: StepResult[];
  retryCount: number;
  context: Record<string, string>;
  /** Set when a cooperative pause has been requested but the current step is still running. */
  pauseRequestedAt?: string | null;
  /** Set once the run has actually settled into a paused state between steps. */
  pausedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};
