#!/usr/bin/env node
import { installWorkflow } from "../installer/install.js";
import { uninstallAllWorkflows, uninstallWorkflow } from "../installer/uninstall.js";
import { getWorkflowStatus } from "../installer/status.js";
import { runWorkflow, approveWorkflowPlan } from "../installer/run.js";
import { getNextStep, completeStep } from "../installer/step-runner.js";
import { orchestrateOnce, listSpawnQueue, removeFromSpawnQueue, listPlanningQueue, removeFromPlanningQueue } from "../daemon/orchestrator.js";
import { getCronSetupInstructions } from "../installer/setup-cron.js";
import { ensureOrchestratorCron } from "../installer/gateway-api.js";
import { listBundledWorkflows } from "../installer/workflow-fetch.js";
import { readRecentLogs } from "../lib/logger.js";

function printUsage() {
  process.stdout.write(
    [
      "antfarm install                      Install all bundled workflows + cron",
      "",
      "antfarm workflow list                List available workflows",
      "antfarm workflow install <name>      Install a workflow",
      "antfarm workflow uninstall <name>    Uninstall a workflow",
      "antfarm workflow uninstall --all     Uninstall all workflows",
      "antfarm workflow status <task>       Check workflow run status",
      "antfarm workflow run <name> <task>   Start a workflow run (pending plan)",
      "antfarm workflow plan <task>         Approve plan (reads from stdin JSON)",
      "antfarm workflow next <task>         Get next step info",
      "antfarm workflow complete <task> <success|fail> [output]",
      "",
      "antfarm setup                        Show cron setup instructions",
      "antfarm check [--verbose]            Run orchestration check",
      "antfarm queue                        List pending spawn requests",
      "antfarm dequeue <file>               Remove a spawn request",
      "antfarm planning                     List runs needing planning",
      "antfarm logs [<lines>]               Show recent log entries",
    ].join("\n") + "\n",
  );
}

async function main() {
  const args = process.argv.slice(2);
  const [group, action, target] = args;
  
  // antfarm install - install all bundled workflows + cron
  if (group === "install" && !args[1]) {
    const workflows = await listBundledWorkflows();
    if (workflows.length === 0) {
      console.log("No bundled workflows found.");
      return;
    }
    
    console.log(`Installing ${workflows.length} workflow(s)...`);
    const results: { id: string; ok: boolean; error?: string }[] = [];
    
    for (const workflowId of workflows) {
      try {
        await installWorkflow({ workflowId });
        results.push({ id: workflowId, ok: true });
        console.log(`  ✓ ${workflowId}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        results.push({ id: workflowId, ok: false, error: msg });
        console.log(`  ✗ ${workflowId}: ${msg}`);
      }
    }
    
    // Set up orchestrator cron
    console.log(`\nSetting up orchestrator cron...`);
    const cronResult = await ensureOrchestratorCron();
    if (cronResult.ok) {
      console.log(cronResult.created ? "  ✓ Created cron job" : "  ✓ Cron already exists");
    } else {
      console.log(`  ✗ ${cronResult.error}`);
      console.log(`  Run 'antfarm setup' for manual instructions.`);
    }
    
    const successCount = results.filter((r) => r.ok).length;
    console.log(`\n✓ Installed ${successCount}/${workflows.length} workflows`);
    console.log(`\nStart a workflow with: antfarm workflow run <name> "your task"`);
    return;
  }
  
  if (group === "setup") {
    process.stdout.write(getCronSetupInstructions());
    return;
  }
  
  if (group === "check") {
    await handleCheck(args.slice(1));
    return;
  }
  
  if (group === "queue") {
    await handleQueue(args.slice(1));
    return;
  }
  
  if (group === "dequeue") {
    await handleDequeue(args.slice(1));
    return;
  }
  
  if (group === "planning") {
    await handlePlanning();
    return;
  }
  
  if (group === "logs") {
    const lines = parseInt(args[1], 10) || 50;
    const logs = await readRecentLogs(lines);
    if (logs.length === 0) {
      console.log("No logs yet.");
    } else {
      for (const line of logs) {
        console.log(line);
      }
    }
    return;
  }
  
  // Legacy alias
  if (group === "daemon") {
    await handleCheck(args.slice(1));
    return;
  }
  
  // Workflow commands require at least 2 args
  if (args.length < 2) {
    printUsage();
    process.exit(1);
  }
  
  if (group !== "workflow") {
    printUsage();
    process.exit(1);
  }
  if (!target && action !== "list" && action !== "next" && action !== "complete") {
    printUsage();
    process.exit(1);
  }

  if (action === "list") {
    const workflows = await listBundledWorkflows();
    if (workflows.length === 0) {
      process.stdout.write("No workflows available.\n");
    } else {
      process.stdout.write("Available workflows:\n");
      for (const w of workflows) {
        process.stdout.write(`  ${w}\n`);
      }
    }
    return;
  }

  if (action === "install") {
    const result = await installWorkflow({ workflowId: target });
    process.stdout.write(`Installed workflow: ${result.workflowId}\n`);
    
    // Automatically set up the orchestrator cron
    process.stdout.write(`Setting up orchestrator cron...\n`);
    const cronResult = await ensureOrchestratorCron();
    if (cronResult.ok) {
      if (cronResult.created) {
        process.stdout.write(`Created antfarm-orchestrator cron job (runs every 30s)\n`);
      } else {
        process.stdout.write(`Orchestrator cron already exists\n`);
      }
      process.stdout.write(`\nReady! Start a workflow with: antfarm workflow run ${result.workflowId} "your task"\n`);
    } else {
      process.stdout.write(`Could not auto-create cron: ${cronResult.error}\n`);
      process.stdout.write(`Run 'antfarm setup' for manual instructions.\n`);
    }
    return;
  }

  if (action === "uninstall") {
    if (target === "--all" || target === "all") {
      await uninstallAllWorkflows();
      return;
    }
    await uninstallWorkflow({ workflowId: target });
    return;
  }

  if (action === "status") {
    const result = await getWorkflowStatus(target);
    if (result.status === "not_found") {
      process.stdout.write(`${result.message}\n`);
      return;
    }
    const run = result.run;
    process.stdout.write(
      [
        `Workflow: ${run.workflowName ?? run.workflowId}`,
        `Task: ${run.taskTitle}`,
        `Status: ${run.status}`,
        `Lead: ${run.leadAgentId}`,
        `Lead Session: ${run.leadSessionLabel}`,
        `Updated: ${run.updatedAt}`,
      ].join("\n") + "\n",
    );
    return;
  }

  if (action === "run") {
    const taskTitle = args.slice(3).join(" ").trim();
    if (!taskTitle) {
      process.stderr.write("Missing task title.\n");
      printUsage();
      process.exit(1);
    }
    const run = await runWorkflow({ workflowId: target, taskTitle });
    process.stdout.write(
      [
        `Run: ${run.id}`,
        `Status: ${run.status}`,
        `Workflow: ${run.workflowName ?? run.workflowId}`,
        `Task: ${run.taskTitle}`,
        ``,
        `⏳ Waiting for plan approval.`,
        `The orchestrator will ping the main agent to discuss planning.`,
        `Once planned, approve with: antfarm workflow plan "${run.taskTitle}"`,
      ].join("\n") + "\n",
    );
    return;
  }

  if (action === "plan") {
    // Read plan from stdin as JSON
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk);
    }
    const input = Buffer.concat(chunks).toString("utf-8").trim();
    if (!input) {
      process.stderr.write("No plan provided on stdin. Expected JSON: {plan, acceptanceCriteria}\n");
      process.exit(1);
    }
    
    let planData: { plan: string; acceptanceCriteria: string[] };
    try {
      planData = JSON.parse(input);
    } catch {
      process.stderr.write("Invalid JSON on stdin.\n");
      process.exit(1);
    }
    
    if (!planData.plan || !Array.isArray(planData.acceptanceCriteria)) {
      process.stderr.write("JSON must have 'plan' (string) and 'acceptanceCriteria' (array).\n");
      process.exit(1);
    }
    
    const run = await approveWorkflowPlan({
      taskTitle: target,
      plan: planData.plan,
      acceptanceCriteria: planData.acceptanceCriteria,
    });
    
    if (!run) {
      process.stderr.write(`No pending_plan run found for: ${target}\n`);
      process.exit(1);
    }
    
    // Remove from planning queue
    const config = { pollIntervalMs: 0, verbose: false };
    await removeFromPlanningQueue(run.id, config);
    
    process.stdout.write(`Plan approved. Run is now: ${run.status}\n`);
    process.stdout.write(`Plan:\n${run.plan}\n`);
    process.stdout.write(`Acceptance Criteria:\n${run.acceptanceCriteria?.map((c) => `  - ${c}`).join("\n")}\n`);
    return;
  }

  if (action === "next") {
    const result = await getNextStep(target);
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    return;
  }

  if (action === "complete") {
    const success = args[3] === "success";
    const output = args.slice(4).join(" ").trim() || "";
    const result = await completeStep({ taskTitle: target, output, success });
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    return;
  }

  process.stderr.write(`Unknown action: ${action}\n`);
  printUsage();
  process.exit(1);
}

async function handleCheck(args: string[]): Promise<void> {
  const verbose = args.includes("--verbose") || args.includes("-v");
  const config = { pollIntervalMs: 0, verbose };
  await orchestrateOnce(config);
}

async function handleQueue(args: string[]): Promise<void> {
  const config = { pollIntervalMs: 0, verbose: false };
  const queue = await listSpawnQueue(config);
  if (queue.length === 0) {
    process.stdout.write("No pending spawn requests.\n");
  } else {
    for (const req of queue) {
      process.stdout.write(`${req.file}: ${req.agentId} - ${req.task.slice(0, 50)}...\n`);
    }
  }
}

async function handleDequeue(args: string[]): Promise<void> {
  const file = args[0];
  if (!file) {
    process.stderr.write("Missing file name.\n");
    process.exit(1);
  }
  const config = { pollIntervalMs: 0, verbose: false };
  await removeFromSpawnQueue(file, config);
  process.stdout.write(`Removed: ${file}\n`);
}

async function handlePlanning(): Promise<void> {
  const config = { pollIntervalMs: 0, verbose: false };
  const queue = await listPlanningQueue(config);
  if (queue.length === 0) {
    process.stdout.write("No runs waiting for planning.\n");
  } else {
    process.stdout.write("Runs waiting for planning:\n");
    for (const req of queue) {
      process.stdout.write(`  ${req.workflowName ?? req.workflowId}: ${req.taskTitle}\n`);
    }
  }
}

main().catch((err) => {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
