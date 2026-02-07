export type WorkflowAgentFiles = {
  baseDir: string;
  files: Record<string, string>;
  skills?: string[];
};

export type WorkflowAgent = {
  id: string;
  name?: string;
  description?: string;
  workspace: WorkflowAgentFiles;
};

export type WorkflowStepFailure = {
  retry_step?: string;
  max_retries?: number;
  on_exhausted?: { escalate_to: string } | { escalate_to?: string } | undefined;
  escalate_to?: string;
};

export type WorkflowStep = {
  id: string;
  agent: string;
  input: string;
  expects: string;
  max_retries?: number;
  on_fail?: WorkflowStepFailure;
};

export type WorkflowSpec = {
  id: string;
  name?: string;
  version?: number;
  agents: WorkflowAgent[];
  steps: WorkflowStep[];
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
  status: "pending_plan" | "running" | "paused" | "blocked" | "completed" | "canceled";
  leadAgentId: string;
  leadSessionLabel: string;
  currentStepIndex: number;
  currentStepId?: string;
  stepResults: StepResult[];
  retryCount: number;
  context: Record<string, string>;
  // Planning fields - required before execution
  plan?: string;
  acceptanceCriteria?: string[];
  plannedAt?: string;
  plannedBy?: string;
  // Tracking for planning pings
  lastPlanPingAt?: string;
  createdAt: string;
  updatedAt: string;
};
