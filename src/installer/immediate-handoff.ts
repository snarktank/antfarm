import { getDb } from "../db.js";
import { onEvent, type AntfarmEvent } from "./events.js";
import { listCronJobs, runCronJobNow } from "./gateway-api.js";
import { logger } from "../lib/logger.js";

export type StepRow = {
  id: string;
  run_id: string;
  status: string;
  updated_at: string;
  agent_id: string;
  workflow_id: string;
  run_status: string;
};

export function createStepVersionGate() {
  const seen = new Map<string, string>();
  return {
    shouldKick(stepId: string, updatedAt: string): boolean {
      const prev = seen.get(stepId);
      if (prev === updatedAt) return false;
      seen.set(stepId, updatedAt);
      return true;
    },
  };
}

const versionGate = createStepVersionGate();
const inFlight = new Set<string>();

function deriveCronName(workflowId: string, agentId: string): string {
  const prefix = `${workflowId}/`;
  const normalized = String(agentId || "").replace(/@run:[^/]+$/, "");
  const suffix = normalized.startsWith(prefix) ? normalized.slice(prefix.length) : normalized;
  return `antfarm/${workflowId}/${suffix}`;
}

type HandoffDeps = {
  selectStep: (stepId: string) => StepRow | undefined;
  listCronJobs: typeof listCronJobs;
  runCronJobNow: typeof runCronJobNow;
  logInfo: (msg: string, ctx?: { runId?: string; stepId?: string }) => Promise<void>;
  logWarn: (msg: string, ctx?: { runId?: string; stepId?: string }) => Promise<void>;
  shouldKick: (stepId: string, updatedAt: string) => boolean;
  inFlight: Set<string>;
};

function selectStepFromDb(stepId: string): StepRow | undefined {
  const db = getDb();
  return db.prepare(
    `SELECT s.id, s.run_id, s.status, s.updated_at, s.agent_id,
            r.workflow_id, r.status AS run_status
     FROM steps s
     JOIN runs r ON r.id = s.run_id
     WHERE s.id = ?
     LIMIT 1`
  ).get(stepId) as StepRow | undefined;
}

function defaultDeps(): HandoffDeps {
  return {
    selectStep: selectStepFromDb,
    listCronJobs,
    runCronJobNow,
    logInfo: logger.info,
    logWarn: logger.warn,
    shouldKick: versionGate.shouldKick,
    inFlight,
  };
}

export function createImmediateHandoffHandler(overrides: Partial<HandoffDeps> = {}): (evt: AntfarmEvent) => Promise<void> {
  const deps = { ...defaultDeps(), ...overrides };
  return async (evt: AntfarmEvent) => {
    if (evt.event !== "step.pending") return;
    const stepId = evt.stepId;
    if (!stepId) return;
    if (deps.inFlight.has(stepId)) return;
    deps.inFlight.add(stepId);
    try {
      const row = deps.selectStep(stepId);
      if (!row || row.status !== "pending" || row.run_status !== "running") return;
      if (!deps.shouldKick(row.id, row.updated_at)) return;

      const desiredName = deriveCronName(row.workflow_id, row.agent_id);
      const cronJobs = await deps.listCronJobs();
      if (!cronJobs.ok || !cronJobs.jobs) {
        await deps.logWarn(`Immediate handoff skipped: failed to list cron jobs for ${row.agent_id}`, {
          runId: row.run_id,
          stepId: row.id,
        });
        return;
      }

      const cron = cronJobs.jobs.find((j) => j.name === desiredName);
      if (!cron) return;

      const kicked = await deps.runCronJobNow(cron.id);
      if (!kicked.ok) {
        await deps.logWarn(`Immediate handoff failed: cron run-now failed for ${row.agent_id}`, {
          runId: row.run_id,
          stepId: row.id,
        });
        return;
      }

      await deps.logInfo(`Immediate handoff kick sent for ${row.agent_id}`, {
        runId: row.run_id,
        stepId: row.id,
      });
    } finally {
      deps.inFlight.delete(stepId);
    }
  };
}

if (process.env.ANTFARM_DISABLE_DEFAULT_HANDOFF_LISTENER !== "1") {
  const onAntfarmEvent = createImmediateHandoffHandler();
  onEvent((evt) => void onAntfarmEvent(evt));
}
