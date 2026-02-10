import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const EVENTS_DIR = path.join(os.homedir(), ".openclaw", "antfarm");
const EVENTS_FILE = path.join(EVENTS_DIR, "events.jsonl");
const MAX_EVENTS_SIZE = 10 * 1024 * 1024; // 10MB

export type EventType =
  | "run.started" | "run.completed" | "run.failed"
  | "step.pending" | "step.running" | "step.done" | "step.failed" | "step.timeout"
  | "story.started" | "story.done" | "story.verified" | "story.retry" | "story.failed"
  | "pipeline.advanced";

export interface AntfarmEvent {
  ts: string;
  event: EventType;
  runId: string;
  workflowId?: string;
  stepId?: string;
  agentId?: string;
  storyId?: string;
  storyTitle?: string;
  detail?: string;
}

export function emitEvent(evt: AntfarmEvent): void {
  try {
    fs.mkdirSync(EVENTS_DIR, { recursive: true });
    // Rotate if too large
    try {
      const stats = fs.statSync(EVENTS_FILE);
      if (stats.size > MAX_EVENTS_SIZE) {
        const rotated = EVENTS_FILE + ".1";
        try { fs.unlinkSync(rotated); } catch {}
        fs.renameSync(EVENTS_FILE, rotated);
      }
    } catch {}
    fs.appendFileSync(EVENTS_FILE, JSON.stringify(evt) + "\n");
  } catch {
    // best-effort, never throw
  }
}

// Read events for a specific run
export function getRunEvents(runId: string, limit = 200): AntfarmEvent[] {
  try {
    const content = fs.readFileSync(EVENTS_FILE, "utf-8");
    const lines = content.trim().split("\n").filter(Boolean);
    const events: AntfarmEvent[] = [];
    for (const line of lines) {
      try {
        const evt = JSON.parse(line) as AntfarmEvent;
        if (evt.runId === runId) events.push(evt);
      } catch {}
    }
    return events.slice(-limit);
  } catch {
    return [];
  }
}
