export type ResearchPlanType = "feature" | "bug";

export interface ResearchEvidenceInput {
  file: string;
  line?: number;
  snippet: string;
}

export interface ResearchPlan {
  type: ResearchPlanType;
  workflow: "feature-dev" | "bug-fix";
  task: string;
  repoPath: string;
  goal: string;
  evidence: string[];
  deliverables: string[];
  acceptanceCriteria: string[];
}

interface BuildResearchPromptInput {
  type: ResearchPlanType;
  task: string;
  workflow: "feature-dev" | "bug-fix";
  repoPath: string;
  goal: string;
  evidence: string[];
  deliverables: string[];
  acceptanceCriteria: string[];
}

function classifyResearchPlanType(evidenceText: string): ResearchPlanType {
  const text = evidenceText.toLowerCase();
  if (/(\bbug\b|\berror\b|\bfail(?:ed|ure)?\b|\bexception\b|\bcrash\b|\bnull\b)/.test(text)) {
    return "bug";
  }
  return "feature";
}

function formatEvidence(input: ResearchEvidenceInput): string {
  const prefix = typeof input.line === "number" ? `${input.file}:${input.line}` : input.file;
  return `${prefix} ${input.snippet}`.trim();
}

export function buildResearchPrompt(input: BuildResearchPromptInput): string {
  const acceptanceCriteria = input.acceptanceCriteria.length
    ? input.acceptanceCriteria
    : [
      "Implementation uses production-ready behavior only.",
      "Tests cover expected success and failure paths.",
    ];

  return [
    `Task: ${input.task}`,
    `Preferred workflow: ${input.workflow}`,
    `Base repo path: ${input.repoPath}`,
    "",
    "Goal:",
    input.goal,
    "",
    "Evidence:",
    ...input.evidence.map((line) => `- ${line}`),
    "",
    "Expected deliverables:",
    ...input.deliverables.map((line) => `- ${line}`),
    "",
    "Acceptance criteria:",
    ...acceptanceCriteria.map((line) => `- ${line}`),
  ].join("\n");
}

export function generateResearchPlans(input: {
  task: string;
  repoPath: string;
  evidence: ResearchEvidenceInput[];
}): ResearchPlan[] {
  const plans: ResearchPlan[] = [];
  for (const item of input.evidence) {
    const evidenceLine = formatEvidence(item);
    const type = classifyResearchPlanType(`${item.file} ${item.snippet}`);
    const workflow = type === "bug" ? "bug-fix" : "feature-dev";
    const goal = type === "bug"
      ? "Fix the identified production bug behavior with durable logic and tests."
      : "Replace temporary or incomplete logic with production behavior and tests.";
    plans.push({
      type,
      workflow,
      task: input.task,
      repoPath: input.repoPath,
      goal,
      evidence: [evidenceLine],
      deliverables: [
        "Implementation changes scoped to this task.",
        "Tests added/updated for behavior changes.",
        "Short PR-ready summary of what changed and why.",
      ],
      acceptanceCriteria: [
        "Production behavior is implemented and placeholder stubs are removed.",
        "Tests cover success and failure paths.",
        "Temporary markers are removed or explicitly documented.",
      ],
    });
  }
  return plans;
}
