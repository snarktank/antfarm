import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { getNextStep, completeStep } from "../installer/step-runner.js";
import { listWorkflowRuns } from "../installer/run-store.js";
import type { WorkflowRunRecord } from "../installer/types.js";

export interface OrchestratorConfig {
  pollIntervalMs: number;
  openclawRoot?: string;
  verbose?: boolean;
}

function log(config: OrchestratorConfig, ...args: unknown[]) {
  if (config.verbose) {
    console.log(`[orchestrator ${new Date().toISOString()}]`, ...args);
  }
}

function getOpenclawRoot(config: OrchestratorConfig): string {
  return config.openclawRoot ?? path.join(os.homedir(), ".openclaw");
}

/**
 * Check if a session has completed by looking for completion markers in output.
 * This is a heuristic - looks for STATUS: done/fail patterns.
 */
function parseAgentOutput(output: string): { done: boolean; success: boolean; cleanOutput: string } {
  // Look for STATUS: done or STATUS: fail
  const statusMatch = output.match(/STATUS:\s*(done|fail|blocked)/i);
  
  if (statusMatch) {
    const status = statusMatch[1]?.toLowerCase();
    return {
      done: true,
      success: status === "done",
      cleanOutput: output.trim(),
    };
  }
  
  return { done: false, success: false, cleanOutput: output.trim() };
}

/**
 * Extract text content from a message content field.
 * Handles both string content and array of content blocks.
 */
function extractTextContent(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    // Extract text from content blocks like [{type: "text", text: "..."}]
    return content
      .filter((block): block is { type: string; text: string } => 
        block?.type === "text" && typeof block?.text === "string"
      )
      .map((block) => block.text)
      .join("\n");
  }
  return "";
}

/**
 * Read a JSONL transcript file and extract messages.
 */
async function readTranscript(filePath: string): Promise<Array<{ role: string; content: string }>> {
  try {
    const content = await fs.readFile(filePath, "utf-8");
    const lines = content.trim().split("\n").filter(Boolean);
    const messages: Array<{ role: string; content: string }> = [];
    
    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        
        // Try entry.message first (OpenClaw transcript format)
        if (entry.message?.role) {
          const text = extractTextContent(entry.message.content);
          if (text) {
            messages.push({ role: entry.message.role, content: text });
          }
        }
        // Fallback to direct role/content
        else if (entry.role) {
          const text = extractTextContent(entry.content);
          if (text) {
            messages.push({ role: entry.role, content: text });
          }
        }
      } catch {
        // Skip malformed lines
      }
    }
    
    return messages;
  } catch {
    return [];
  }
}

/**
 * Read sessions.json to find session by label.
 */
async function findSessionByLabel(
  agentId: string,
  sessionLabel: string,
  config: OrchestratorConfig
): Promise<{ sessionId: string; transcriptPath: string } | null> {
  const openclawRoot = getOpenclawRoot(config);
  const agentDir = path.join(openclawRoot, "agents", agentId.replace("/", "-"), "sessions");
  const sessionsFile = path.join(agentDir, "sessions.json");
  
  try {
    const content = await fs.readFile(sessionsFile, "utf-8");
    const sessions = JSON.parse(content) as Record<string, { sessionId: string; label?: string }>;
    
    for (const [key, session] of Object.entries(sessions)) {
      if (session.label === sessionLabel) {
        return {
          sessionId: session.sessionId,
          transcriptPath: path.join(agentDir, `${session.sessionId}.jsonl`),
        };
      }
    }
  } catch {
    // File doesn't exist or can't be read
  }
  
  return null;
}

/**
 * Find session transcript by searching agent session directories.
 * First checks sessions.json for label match, then falls back to content search.
 */
async function findSessionTranscript(
  agentId: string,
  sessionLabel: string,
  config: OrchestratorConfig
): Promise<string | null> {
  // Try sessions.json first
  const sessionInfo = await findSessionByLabel(agentId, sessionLabel, config);
  if (sessionInfo) {
    return sessionInfo.transcriptPath;
  }
  
  // Fallback: search transcript content
  const openclawRoot = getOpenclawRoot(config);
  const agentDir = path.join(openclawRoot, "agents", agentId.replace("/", "-"), "sessions");
  
  try {
    const files = await fs.readdir(agentDir);
    const jsonlFiles = files.filter((f) => f.endsWith(".jsonl"));
    
    for (const file of jsonlFiles) {
      const filePath = path.join(agentDir, file);
      const messages = await readTranscript(filePath);
      
      // Check if this session matches our label (look in system messages or metadata)
      const firstMessages = messages.slice(0, 5);
      for (const msg of firstMessages) {
        if (msg.content.includes(sessionLabel)) {
          return filePath;
        }
      }
    }
  } catch {
    // Directory doesn't exist or can't be read
  }
  
  return null;
}

/**
 * Check session status by reading transcript file directly.
 */
async function getSessionStatus(
  agentId: string,
  sessionLabel: string,
  config: OrchestratorConfig
): Promise<{ found: boolean; completed: boolean; output?: string }> {
  const transcriptPath = await findSessionTranscript(agentId, sessionLabel, config);
  
  if (!transcriptPath) {
    log(config, `No transcript found for: ${sessionLabel}`);
    return { found: false, completed: false };
  }
  
  const messages = await readTranscript(transcriptPath);
  
  // Find the last assistant message with STATUS marker
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role === "assistant" && /STATUS:\s*(done|fail|blocked)/i.test(msg.content)) {
      const parsed = parseAgentOutput(msg.content);
      return { found: true, completed: parsed.done, output: parsed.cleanOutput };
    }
  }
  
  return { found: true, completed: false };
}

/**
 * Check if there's already a pending spawn request for this session label.
 */
async function hasSpawnRequest(sessionLabel: string, config: OrchestratorConfig): Promise<boolean> {
  const openclawRoot = getOpenclawRoot(config);
  const queueDir = path.join(openclawRoot, "antfarm", "spawn-queue");
  
  try {
    const files = await fs.readdir(queueDir);
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      try {
        const content = await fs.readFile(path.join(queueDir, file), "utf-8");
        const request = JSON.parse(content);
        if (request.sessionLabel === sessionLabel) {
          return true;
        }
      } catch {
        // Skip malformed files
      }
    }
  } catch {
    // Queue dir doesn't exist yet
  }
  return false;
}

/**
 * Write spawn request to queue file for the main agent to pick up.
 * This is a coordination mechanism when direct API access isn't available.
 * Deduplicates by sessionLabel - won't create duplicate requests.
 */
async function writeSpawnRequest(
  agentId: string,
  task: string,
  sessionLabel: string,
  config: OrchestratorConfig
): Promise<void> {
  // Check for existing request with same sessionLabel
  if (await hasSpawnRequest(sessionLabel, config)) {
    log(config, `Spawn request already exists for: ${sessionLabel}`);
    return;
  }
  
  const openclawRoot = getOpenclawRoot(config);
  const queueDir = path.join(openclawRoot, "antfarm", "spawn-queue");
  await fs.mkdir(queueDir, { recursive: true });
  
  const request = {
    agentId,
    task,
    sessionLabel,
    createdAt: new Date().toISOString(),
  };
  
  const filename = `${Date.now()}-${agentId.replace("/", "-")}.json`;
  await fs.writeFile(path.join(queueDir, filename), JSON.stringify(request, null, 2));
  log(config, `Wrote spawn request: ${filename}`);
}

/**
 * Spawn the next agent in the workflow.
 * First tries gateway HTTP API, falls back to spawn queue.
 */
async function spawnAgent(
  agentId: string,
  task: string,
  sessionLabel: string,
  config: OrchestratorConfig
): Promise<boolean> {
  // Try gateway HTTP API first (if available)
  const gatewayUrl = process.env.OPENCLAW_GATEWAY_URL ?? "http://127.0.0.1:45289";
  const gatewayToken = process.env.OPENCLAW_GATEWAY_TOKEN;
  
  if (gatewayToken) {
    try {
      const response = await fetch(`${gatewayUrl}/api/sessions/spawn`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${gatewayToken}`,
        },
        body: JSON.stringify({
          agentId,
          task,
          label: sessionLabel,
        }),
      });
      
      if (response.ok) {
        log(config, `Spawned agent via API: ${agentId}`);
        return true;
      }
      
      log(config, `API spawn failed: ${response.status}`);
    } catch (err) {
      log(config, `API spawn error: ${err}`);
    }
  }
  
  // Fall back to spawn queue
  await writeSpawnRequest(agentId, task, sessionLabel, config);
  return true;
}

/**
 * Write a planning request to the planning queue.
 * The main agent checks this queue and initiates planning conversations.
 */
async function writePlanningRequest(run: WorkflowRunRecord, config: OrchestratorConfig): Promise<boolean> {
  const openclawRoot = getOpenclawRoot(config);
  const queueDir = path.join(openclawRoot, "antfarm", "planning-queue");
  await fs.mkdir(queueDir, { recursive: true });
  
  const request = {
    runId: run.id,
    workflowId: run.workflowId,
    workflowName: run.workflowName,
    taskTitle: run.taskTitle,
    createdAt: new Date().toISOString(),
  };
  
  // Use runId as filename to avoid duplicates
  const filename = `${run.id}.json`;
  const filePath = path.join(queueDir, filename);
  
  try {
    // Check if already exists
    try {
      await fs.access(filePath);
      log(config, `Planning request already exists for: ${run.taskTitle}`);
      return true;
    } catch {
      // File doesn't exist, create it
    }
    
    await fs.writeFile(filePath, JSON.stringify(request, null, 2));
    log(config, `Wrote planning request: ${filename}`);
    return true;
  } catch (err) {
    log(config, `Failed to write planning request: ${err}`);
    return false;
  }
}

/**
 * Read pending planning requests from the queue.
 */
export async function listPlanningQueue(config: OrchestratorConfig): Promise<
  Array<{ file: string; runId: string; workflowId: string; workflowName?: string; taskTitle: string; createdAt: string }>
> {
  const openclawRoot = getOpenclawRoot(config);
  const queueDir = path.join(openclawRoot, "antfarm", "planning-queue");
  
  try {
    const files = await fs.readdir(queueDir);
    const requests = [];
    
    for (const file of files.filter((f) => f.endsWith(".json"))) {
      try {
        const content = await fs.readFile(path.join(queueDir, file), "utf-8");
        const request = JSON.parse(content);
        requests.push({ file, ...request });
      } catch {
        // Skip malformed files
      }
    }
    
    return requests.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  } catch {
    return [];
  }
}

/**
 * Remove a planning request from the queue (after planning is complete).
 */
export async function removeFromPlanningQueue(runId: string, config: OrchestratorConfig): Promise<void> {
  const openclawRoot = getOpenclawRoot(config);
  const queueDir = path.join(openclawRoot, "antfarm", "planning-queue");
  
  try {
    await fs.unlink(path.join(queueDir, `${runId}.json`));
  } catch {
    // Already removed
  }
}

/**
 * Process a single workflow run - check status, advance if needed.
 */
async function processRun(run: WorkflowRunRecord, config: OrchestratorConfig): Promise<void> {
  // Handle pending_plan runs - write to planning queue
  if (run.status === "pending_plan") {
    log(config, `Run needs planning: ${run.taskTitle}`);
    await writePlanningRequest(run, config);
    return;
  }
  
  if (run.status !== "running") {
    return;
  }
  
  log(config, `Processing run: ${run.taskTitle} (step ${run.currentStepIndex})`);
  
  // Get next step info
  const nextStep = await getNextStep(run.taskTitle);
  
  if (nextStep.status === "completed") {
    log(config, `Workflow completed: ${run.taskTitle}`);
    return;
  }
  
  if (nextStep.status === "blocked") {
    log(config, `Workflow blocked: ${run.taskTitle}`);
    return;
  }
  
  if (nextStep.status !== "ready" || !nextStep.step) {
    log(config, `Workflow not ready: ${run.taskTitle}`);
    return;
  }
  
  const stepKey = getStepKey(run.id, nextStep.step.id);
  
  // Build session label for current step (must fit in 64 chars)
  // Format: wf-{workflowId}-{stepId}-{runId-first8}
  const shortRunId = run.id.slice(0, 8);
  const stepSessionLabel = `wf-${run.workflowId}-${nextStep.step.id}-${shortRunId}`.slice(0, 64);
  
  // Check if there's an active session for this step
  const sessionStatus = await getSessionStatus(nextStep.step.agentId, stepSessionLabel, config);
  
  if (!sessionStatus.found) {
    // No session yet - spawn the agent (if not already spawned this session)
    if (spawnedSteps.has(stepKey)) {
      log(config, `Already spawned, waiting for session: ${nextStep.step.id}`);
      return;
    }
    
    log(config, `Spawning agent for step: ${nextStep.step.id}`);
    const spawned = await spawnAgent(
      nextStep.step.agentId,
      nextStep.step.input,
      stepSessionLabel,
      config
    );
    if (spawned) {
      spawnedSteps.add(stepKey);
    } else {
      log(config, `Failed to spawn agent for step: ${nextStep.step.id}`);
    }
    return;
  }
  
  if (!sessionStatus.completed) {
    // Session exists but not done yet
    log(config, `Waiting for step to complete: ${nextStep.step.id}`);
    return;
  }
  
  // Session completed - advance the workflow
  log(config, `Step completed: ${nextStep.step.id}`);
  
  const output = sessionStatus.output ?? "";
  const parsed = parseAgentOutput(output);
  
  const result = await completeStep({
    taskTitle: run.taskTitle,
    output: parsed.cleanOutput,
    success: parsed.success,
  });
  
  log(config, `Step result: ${result.status}`);
  
  // If there's a next step, spawn it immediately
  if (result.nextStep?.status === "ready" && result.nextStep.step) {
    const nextStepKey = getStepKey(run.id, result.nextStep.step.id);
    const nextSessionLabel = `wf-${run.workflowId}-${result.nextStep.step.id}-${shortRunId}`.slice(0, 64);
    
    const spawned = await spawnAgent(
      result.nextStep.step.agentId,
      result.nextStep.step.input,
      nextSessionLabel,
      config
    );
    if (spawned) {
      spawnedSteps.add(nextStepKey);
    }
  }
}

// Track spawned steps to avoid duplicates (in-memory for this session)
const spawnedSteps = new Set<string>();

function getStepKey(runId: string, stepId: string): string {
  return `${runId}:${stepId}`;
}

/**
 * Main orchestrator loop - polls for active runs and processes them.
 */
export async function runOrchestrator(config: OrchestratorConfig): Promise<void> {
  console.log(`[orchestrator] Starting with poll interval ${config.pollIntervalMs}ms`);
  
  const poll = async () => {
    try {
      const runs = await listWorkflowRuns();
      const activeRuns = runs.filter((r) => r.status === "running" || r.status === "pending_plan");
      
      if (activeRuns.length > 0) {
        log(config, `Found ${activeRuns.length} active run(s)`);
      }
      
      for (const run of activeRuns) {
        await processRun(run, config);
      }
    } catch (err) {
      console.error("[orchestrator] Error in poll loop:", err);
    }
  };
  
  // Initial poll
  await poll();
  
  // Set up interval
  setInterval(poll, config.pollIntervalMs);
  
  // Keep process alive
  console.log("[orchestrator] Running... Press Ctrl+C to stop.");
}

/**
 * Run a single orchestration pass (for testing or one-shot mode).
 */
export async function orchestrateOnce(config: OrchestratorConfig): Promise<void> {
  const runs = await listWorkflowRuns();
  const activeRuns = runs.filter((r) => r.status === "running" || r.status === "pending_plan");
  
  console.log(`[orchestrator] Found ${activeRuns.length} active run(s)`);
  
  for (const run of activeRuns) {
    await processRun(run, config);
  }
}

/**
 * Read pending spawn requests from the queue.
 */
export async function listSpawnQueue(config: OrchestratorConfig): Promise<
  Array<{ file: string; agentId: string; task: string; sessionLabel: string; createdAt: string }>
> {
  const openclawRoot = getOpenclawRoot(config);
  const queueDir = path.join(openclawRoot, "antfarm", "spawn-queue");
  
  try {
    const files = await fs.readdir(queueDir);
    const requests = [];
    
    for (const file of files.filter((f) => f.endsWith(".json"))) {
      try {
        const content = await fs.readFile(path.join(queueDir, file), "utf-8");
        const request = JSON.parse(content);
        requests.push({ file, ...request });
      } catch {
        // Skip malformed files
      }
    }
    
    return requests.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  } catch {
    return [];
  }
}

/**
 * Remove a processed spawn request from the queue.
 */
export async function removeFromSpawnQueue(file: string, config: OrchestratorConfig): Promise<void> {
  const openclawRoot = getOpenclawRoot(config);
  const queueDir = path.join(openclawRoot, "antfarm", "spawn-queue");
  
  try {
    await fs.unlink(path.join(queueDir, file));
  } catch {
    // Already removed
  }
}
