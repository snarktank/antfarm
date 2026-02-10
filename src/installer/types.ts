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
  workspace: WorkflowAgentFiles;
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
  agents: WorkflowAgent[];
  steps: WorkflowStep[];
  context?: Record<string, string>;
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
  createdAt: string;
  updatedAt: string;
};
