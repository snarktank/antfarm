import { getDb } from "../db.js";

export type RunInfo = {
  id: string;
  workflow_id: string;
  task: string;
  status: string;
  context: string;
  created_at: string;
  updated_at: string;
};

export type StepInfo = {
  id: string;
  run_id: string;
  step_id: string;
  agent_id: string;
  step_index: number;
  input_template: string;
  expects: string;
  status: string;
  output: string | null;
  retry_count: number;
  max_retries: number;
  created_at: string;
  updated_at: string;
};

export type WorkflowStatusResult =
  | { status: "ok"; run: RunInfo; steps: StepInfo[] }
  | { status: "not_found"; message: string };

export function getWorkflowStatus(query: string): WorkflowStatusResult {
  const db = getDb();

  // Try exact match first, then substring match, then prefix match
  let run = db.prepare("SELECT * FROM runs WHERE LOWER(task) = LOWER(?) ORDER BY created_at DESC LIMIT 1").get(query) as RunInfo | undefined;

  if (!run) {
    run = db.prepare("SELECT * FROM runs WHERE LOWER(task) LIKE '%' || LOWER(?) || '%' ORDER BY created_at DESC LIMIT 1").get(query) as RunInfo | undefined;
  }

  // Also try matching by run ID (prefix or full)
  if (!run) {
    run = db.prepare("SELECT * FROM runs WHERE id LIKE ? || '%' ORDER BY created_at DESC LIMIT 1").get(query) as RunInfo | undefined;
  }

  if (!run) {
    const allRuns = db.prepare("SELECT id, task, status, created_at FROM runs ORDER BY created_at DESC LIMIT 20").all() as Array<{ id: string; task: string; status: string; created_at: string }>;
    const available = allRuns.map((r) => `  [${r.status}] ${r.id.slice(0, 8)} ${r.task.slice(0, 60)}`);
    return {
      status: "not_found",
      message: available.length
        ? `No run matching "${query}". Recent runs:\n${available.join("\n")}`
        : "No workflow runs found.",
    };
  }

  const steps = db.prepare("SELECT * FROM steps WHERE run_id = ? ORDER BY step_index ASC").all(run.id) as StepInfo[];
  return { status: "ok", run, steps };
}

export function getWorkflowStatusJson(
  query: string,
  storiesFn?: (runId: string) => Array<{ storyId: string; status: string; title: string }>,
): Record<string, unknown> {
  const result = getWorkflowStatus(query);
  if (result.status === "not_found") {
    return { status: "not_found", message: result.message };
  }
  const { run, steps } = result;

  const json: Record<string, unknown> = {
    runId: run.id,
    workflow: run.workflow_id,
    task: run.task,
    status: run.status,
    steps: steps.map((s) => ({ name: s.step_id, status: s.status, agent: s.agent_id })),
    createdAt: run.created_at,
  };

  if (storiesFn) {
    const stories = storiesFn(run.id);
    if (stories.length > 0) {
      const done = stories.filter((s) => s.status === "done").length;
      const running = stories.filter((s) => s.status === "running").length;
      const failed = stories.filter((s) => s.status === "failed").length;
      json.storySummary = { total: stories.length, done, running, failed };
      json.stories = stories.map((s) => ({ id: s.storyId, status: s.status, title: s.title }));
    }
  }

  return json;
}

export function listRuns(): RunInfo[] {
  const db = getDb();
  return db.prepare("SELECT * FROM runs ORDER BY created_at DESC").all() as RunInfo[];
}
