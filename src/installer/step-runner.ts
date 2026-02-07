import { loadWorkflowSpec } from "./workflow-spec.js";
import { resolveWorkflowDir } from "./paths.js";
import { readWorkflowRun, writeWorkflowRun } from "./run-store.js";
import { logger } from "../lib/logger.js";
import type { WorkflowRunRecord, WorkflowStep, StepResult } from "./types.js";

export type NextStepResult = {
  status: "ready" | "completed" | "blocked" | "not_found";
  step?: {
    id: string;
    agentId: string;
    input: string;
    expects: string;
  };
  run?: WorkflowRunRecord;
  message?: string;
};

function interpolateInput(input: string, context: Record<string, string>): string {
  return input.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (match, key) => {
    const keys = key.split(".");
    let value: unknown = context;
    for (const k of keys) {
      if (value && typeof value === "object" && k in value) {
        value = (value as Record<string, unknown>)[k];
      } else {
        return match; // Keep original if not found
      }
    }
    return typeof value === "string" ? value : match;
  });
}

export async function getNextStep(taskTitle: string): Promise<NextStepResult> {
  const run = await readWorkflowRun(taskTitle);
  if (!run) {
    return { status: "not_found", message: `No run found for task: ${taskTitle}` };
  }

  if (run.status === "completed") {
    return { status: "completed", run, message: "Workflow completed" };
  }

  if (run.status === "blocked") {
    return { status: "blocked", run, message: "Workflow is blocked" };
  }

  const workflowDir = resolveWorkflowDir(run.workflowId);
  const workflow = await loadWorkflowSpec(workflowDir);

  if (run.currentStepIndex >= workflow.steps.length) {
    run.status = "completed";
    run.updatedAt = new Date().toISOString();
    await writeWorkflowRun(run);
    return { status: "completed", run, message: "All steps completed" };
  }

  const step = workflow.steps[run.currentStepIndex];
  const agentId = `${workflow.id}/${step.agent}`;
  const input = interpolateInput(step.input, run.context);

  return {
    status: "ready",
    step: {
      id: step.id,
      agentId,
      input,
      expects: step.expects,
    },
    run,
  };
}

export async function completeStep(params: {
  taskTitle: string;
  output: string;
  success: boolean;
}): Promise<{ status: string; nextStep?: NextStepResult; message?: string }> {
  const run = await readWorkflowRun(params.taskTitle);
  if (!run) {
    return { status: "error", message: `No run found for task: ${params.taskTitle}` };
  }

  const workflowDir = resolveWorkflowDir(run.workflowId);
  const workflow = await loadWorkflowSpec(workflowDir);
  const step = workflow.steps[run.currentStepIndex];

  if (!step) {
    return { status: "error", message: "No current step" };
  }

  const now = new Date().toISOString();

  if (params.success) {
    // Step succeeded - record result and move to next step
    const result: StepResult = {
      stepId: step.id,
      agentId: `${workflow.id}/${step.agent}`,
      output: params.output,
      status: "done",
      completedAt: now,
    };
    run.stepResults.push(result);

    // Extract context from output (look for PLAN:, ACCEPTANCE:, SUMMARY:, etc.)
    // Parse sections by splitting on lines that start with ALL-CAPS-KEY:
    const lines = params.output.split("\n");
    let currentKey: string | null = null;
    let currentValue: string[] = [];
    
    const saveSection = () => {
      if (currentKey && currentValue.length > 0) {
        run.context[currentKey] = currentValue.join("\n").trim();
      }
    };
    
    for (const line of lines) {
      const keyMatch = line.match(/^([A-Z][A-Z_]+):\s*(.*)/);
      if (keyMatch) {
        // Save previous section
        saveSection();
        // Start new section
        currentKey = keyMatch[1].toLowerCase();
        currentValue = keyMatch[2] ? [keyMatch[2]] : [];
      } else if (currentKey) {
        // Continue current section
        currentValue.push(line);
      }
    }
    // Save final section
    saveSection();

    run.currentStepIndex++;
    run.currentStepId = workflow.steps[run.currentStepIndex]?.id;
    run.retryCount = 0;
    run.updatedAt = now;
    await writeWorkflowRun(run);

    await logger.info(`Step completed: ${step.id} (success)`, {
      workflowId: run.workflowId,
      runId: run.id,
      stepId: step.id,
    });

    const nextStep = await getNextStep(params.taskTitle);
    
    if (nextStep.status === "completed") {
      await logger.info(`Workflow completed`, {
        workflowId: run.workflowId,
        runId: run.id,
      });
    } else if (nextStep.status === "ready" && nextStep.step) {
      await logger.info(`Step started: ${nextStep.step.id}`, {
        workflowId: run.workflowId,
        runId: run.id,
        stepId: nextStep.step.id,
      });
    }
    
    return { status: "ok", nextStep };
  } else {
    // Step failed - check retry logic
    const maxRetries = step.on_fail?.max_retries ?? step.max_retries ?? 3;

    if (run.retryCount < maxRetries) {
      run.retryCount++;
      run.updatedAt = now;
      await writeWorkflowRun(run);

      const retryStep = step.on_fail?.retry_step;
      if (retryStep) {
        // Jump back to a previous step
        const retryIndex = workflow.steps.findIndex((s) => s.id === retryStep);
        if (retryIndex >= 0) {
          run.currentStepIndex = retryIndex;
          run.currentStepId = workflow.steps[retryIndex].id;
          await writeWorkflowRun(run);
        }
      }

      await logger.warn(`Step retry ${run.retryCount}/${maxRetries}: ${step.id}`, {
        workflowId: run.workflowId,
        runId: run.id,
        stepId: step.id,
      });

      const nextStep = await getNextStep(params.taskTitle);
      return { status: "retry", nextStep, message: `Retry ${run.retryCount}/${maxRetries}` };
    } else {
      // Exhausted retries - escalate or block
      const escalateTo = step.on_fail?.on_exhausted?.escalate_to ?? step.on_fail?.escalate_to;
      if (escalateTo) {
        run.status = "blocked";
        run.updatedAt = now;
        await writeWorkflowRun(run);
        
        await logger.error(`Step failed, escalated to ${escalateTo}: ${step.id}`, {
          workflowId: run.workflowId,
          runId: run.id,
          stepId: step.id,
        });
        
        return { status: "escalated", message: `Escalated to ${escalateTo}` };
      } else {
        run.status = "blocked";
        run.updatedAt = now;
        await writeWorkflowRun(run);
        
        await logger.error(`Step failed, workflow blocked: ${step.id}`, {
          workflowId: run.workflowId,
          runId: run.id,
          stepId: step.id,
        });
        
        return { status: "blocked", message: "Max retries exceeded, no escalation defined" };
      }
    }
  }
}
