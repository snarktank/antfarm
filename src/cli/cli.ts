#!/usr/bin/env node

// Runtime check: node:sqlite requires Node.js >= 22 (real Node, not Bun's wrapper)
try {
  await import("node:sqlite");
} catch {
  console.error(
    `Error: node:sqlite is not available.\n\n` +
    `Antfarm requires Node.js >= 22 with native SQLite support.\n` +
    `If you have Bun installed, its \`node\` wrapper does not support node:sqlite via ESM.\n\n` +
    `Fix: ensure the real Node.js 22+ is first on your PATH.\n` +
    `  Check: node -e "require('node:sqlite')"\n` +
    `  See: https://github.com/snarktank/antfarm/issues/54`
  );
  process.exit(1);
}

import { installWorkflow } from "../installer/install.js";
import { uninstallAllWorkflows, uninstallWorkflow, checkActiveRuns } from "../installer/uninstall.js";
import { archiveWorkflow, getWorkflowStatus, listRuns, pauseWorkflow, resumeWorkflow, stopWorkflow } from "../installer/status.js";
import { formatStepStatusLine } from "../installer/repo-visibility.js";
import { runWorkflow } from "../installer/run.js";
import { listBundledWorkflows } from "../installer/workflow-fetch.js";
import { readRecentLogs } from "../lib/logger.js";
import { getRecentEvents, getRunEvents, type AntfarmEvent } from "../installer/events.js";
import { startDaemon, stopDaemon, getDaemonStatus, isRunning } from "../server/daemonctl.js";
import { getDashboardServeStatus } from "../server/tailscale-serve.js";
import { claimStep, completeStep, failStep, getStories, peekStep } from "../installer/step-ops.js";
import { ensureCliSymlink } from "../installer/symlink.js";
import { runMedicCheck, getMedicStatus, getRecentMedicChecks } from "../medic/medic.js";
import { installMedicCron, uninstallMedicCron, isMedicCronInstalled } from "../medic/medic-cron.js";
import { runConfiguredExecutor } from "../installer/executor.js";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const pkgPath = join(__dirname, "..", "..", "package.json");

function getVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    return pkg.version ?? "unknown";
  } catch {
    return "unknown";
  }
}

function formatEventTime(ts: string): string {
  const d = new Date(ts);
  return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
}

function formatEventLabel(evt: AntfarmEvent): string {
  const labels: Record<string, string> = {
    "run.started": "Run started",
    "run.completed": "Run completed",
    "run.failed": "Run failed",
    "run.archived": "Run archived",
    "executor.started": "Executor started",
    "executor.completed": "Executor completed",
    "executor.failed": "Executor failed",
    "step.pending": "Step pending",
    "step.running": "Claimed step",
    "step.done": "Step completed",
    "step.failed": "Step failed",
    "step.timeout": "Step timed out",
    "story.started": "Story started",
    "story.done": "Story done",
    "story.verified": "Story verified",
    "story.retry": "Story retry",
    "story.failed": "Story failed",
    "pipeline.advanced": "Pipeline advanced",
  };
  return labels[evt.event] ?? evt.event;
}

function printEvents(events: AntfarmEvent[]): void {
  if (events.length === 0) { console.log("No events yet."); return; }
  for (const evt of events) {
    const time = formatEventTime(evt.ts);
    const agent = evt.agentId ? `  ${evt.agentId.split("_").slice(-1)[0]}` : "";
    const label = formatEventLabel(evt);
    const story = evt.storyTitle ? ` — ${evt.storyTitle}` : "";
    const detail = evt.detail ? ` (${evt.detail})` : "";
    const run = evt.runId ? `  [${evt.runId.slice(0, 8)}]` : "";
    console.log(`${time}${run}${agent}  ${label}${story}${detail}`);
  }
}

function printUsage() {
  process.stdout.write(
    [
      "antfarm install                      Install all bundled workflows",
      "antfarm uninstall [--force]          Full uninstall (workflows, agents, crons, DB)",
      "",
      "antfarm workflow list                List available workflows",
      "antfarm workflow install <name>      Install a workflow",
      "antfarm workflow uninstall <name>    Uninstall a workflow (blocked if runs active)",
      "antfarm workflow uninstall --all     Uninstall all workflows (--force to override)",
      "antfarm workflow run <name> <task>   Start a workflow run",
      "antfarm workflow status <query>      Check run status (task substring, run ID prefix)",
      "antfarm workflow runs [--all|--archived]  List workflow runs (active by default)",
      "antfarm workflow resume <run-id>     Resume a paused or failed run",
      "antfarm workflow pause <run-id>       Pause a running workflow (cooperative)",
      "antfarm workflow stop <run-id>        Stop/cancel a running workflow",
      "antfarm workflow archive <run-id>     Archive a completed, failed, or cancelled run",
      "antfarm workflow ensure-crons <name>  Recreate agent crons for a workflow",
      "",
      "antfarm dashboard [start] [--port N]   Start dashboard daemon (default: 3333)",
      "antfarm dashboard stop                  Stop dashboard daemon",
      "antfarm dashboard status                Check dashboard status",
      "",
      "antfarm step peek <agent-id>        Lightweight check for pending work (HAS_WORK or NO_WORK)",
      "antfarm step claim <agent-id>       Claim pending step, output resolved input as JSON",
      "antfarm step complete <step-id>      Complete step (reads output from stdin)",
      "antfarm step complete-file <step-id> <file>  Complete step using output read from a file",
      "antfarm step fail <step-id> <error>  Fail step with retry logic",
      "antfarm step stories <run-id>       List stories for a run",
      "antfarm executor run <workflow> <agent> <run-id> <step-id> <input-file> <output-file>  Run configured code executor",
      "",
      "antfarm medic install                Install medic watchdog cron",
      "antfarm medic uninstall              Remove medic cron",
      "antfarm medic run [--json]           Run medic check now (manual trigger)",
      "antfarm medic status                 Show medic health summary",
      "antfarm medic log [<count>]          Show recent medic check history",
      "",
      "antfarm logs [<lines>]               Show recent activity (from events)",
      "antfarm logs <run-id>                Show activity for a specific run",
      "",
      "antfarm version                      Show installed version",
      "antfarm update                       Pull latest, rebuild, and reinstall workflows",
    ].join("\n") + "\n",
  );
}

async function main() {
  const args = process.argv.slice(2);
  const [group, action, target] = args;

  if (group === "version" || group === "--version" || group === "-v") {
    console.log(`antfarm v${getVersion()}`);
    return;
  }

  if (group === "ant") {
    const { printAnt } = await import("./ant.js");
    printAnt();
    return;
  }

  if (group === "update") {
    const repoRoot = join(__dirname, "..", "..");
    console.log("Pulling latest...");
    try {
      execSync("git pull", { cwd: repoRoot, stdio: "inherit" });
    } catch {
      process.stderr.write("Failed to git pull. Are you in the antfarm repo?\n");
      process.exit(1);
    }
    console.log("Installing dependencies...");
    execSync("npm install", { cwd: repoRoot, stdio: "inherit" });
    console.log("Building...");
    execSync("npm run build", { cwd: repoRoot, stdio: "inherit" });

    // Reinstall workflows
    const workflows = await listBundledWorkflows();
    if (workflows.length > 0) {
      console.log(`Reinstalling ${workflows.length} workflow(s)...`);
      for (const workflowId of workflows) {
        try {
          await installWorkflow({ workflowId });
          console.log(`  ✓ ${workflowId}`);
        } catch (err) {
          console.log(`  ✗ ${workflowId}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }
    ensureCliSymlink();
    console.log(`\nUpdated to v${getVersion()}.`);
    return;
  }

  if (group === "uninstall" && (!args[1] || args[1] === "--force")) {
    const force = args.includes("--force");
    const activeRuns = checkActiveRuns();
    if (activeRuns.length > 0 && !force) {
      process.stderr.write(`Cannot uninstall: ${activeRuns.length} active run(s):\n`);
      for (const run of activeRuns) {
        process.stderr.write(`  - ${run.id} (${run.workflow_id}): ${run.task}\n`);
      }
      process.stderr.write(`\nUse --force to uninstall anyway.\n`);
      process.exit(1);
    }

    // Stop dashboard if running
    if (isRunning().running) {
      stopDaemon();
      console.log("Dashboard stopped.");
    }

    await uninstallAllWorkflows();
    console.log("Antfarm fully uninstalled (workflows, agents, crons, database, skill).");
    return;
  }

  if (group === "install" && !args[1]) {
    const workflows = await listBundledWorkflows();
    if (workflows.length === 0) { console.log("No bundled workflows found."); return; }

    console.log(`Installing ${workflows.length} workflow(s)...`);
    for (const workflowId of workflows) {
      try {
        await installWorkflow({ workflowId });
        console.log(`  ✓ ${workflowId}`);
      } catch (err) {
        console.log(`  ✗ ${workflowId}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    ensureCliSymlink();
    console.log(`\nDone. Start a workflow with: antfarm workflow run <name> "your task"`);

    // Auto-start dashboard if not already running
    if (!isRunning().running) {
      try {
        const result = await startDaemon(3333);
        console.log(`\nDashboard started (PID ${result.pid}): http://localhost:${result.port}`);
      } catch (err) {
        console.log(`\nNote: Could not start dashboard: ${err instanceof Error ? err.message : String(err)}`);
      }
    } else {
      console.log("\nDashboard already running.");
    }
    return;
  }

  if (group === "dashboard") {
    const sub = args[1];

    if (sub === "stop") {
      if (stopDaemon()) {
        console.log("Dashboard stopped.");
      } else {
        console.log("Dashboard is not running.");
      }
      return;
    }

    if (sub === "status") {
      const st = getDaemonStatus();
      if (st && st.running) {
        console.log(`Dashboard running (PID ${st.pid ?? "unknown"})`);
        const serve = await getDashboardServeStatus();
        console.log(`Tailscale serve: ${serve.configured ? `ok (${serve.url ?? ":4443 -> 127.0.0.1:3333"})` : "missing"}`);
      } else {
        console.log("Dashboard is not running.");
      }
      return;
    }

    // start (explicit or implicit)
    let port = 3333;
    const portIdx = args.indexOf("--port");
    if (portIdx !== -1 && args[portIdx + 1]) {
      port = parseInt(args[portIdx + 1], 10) || 3333;
    } else if (sub && sub !== "start" && !sub.startsWith("-")) {
      // legacy: antfarm dashboard 4000
      const parsed = parseInt(sub, 10);
      if (!Number.isNaN(parsed)) port = parsed;
    }

    if (isRunning().running) {
      const result = await startDaemon(port);
      const serve = await getDashboardServeStatus(port);
      console.log(`Dashboard already running (PID ${result.pid})`);
      console.log(`  http://localhost:${port}`);
      if (serve.configured && serve.url) console.log(`  ${serve.url}`);
      return;
    }

    const result = await startDaemon(port);
    const serve = await getDashboardServeStatus(port);
    console.log(`Dashboard started (PID ${result.pid})`);
    console.log(`  http://localhost:${result.port}`);
    if (serve.configured && serve.url) console.log(`  ${serve.url}`);
    return;
  }

  if (group === "medic") {
    if (action === "install") {
      const result = await installMedicCron();
      if (result.ok) {
        console.log("Medic watchdog installed (checks every 5 minutes).");
      } else {
        console.error(`Failed to install medic: ${result.error}`);
        process.exit(1);
      }
      return;
    }

    if (action === "uninstall") {
      const result = await uninstallMedicCron();
      if (result.ok) {
        console.log("Medic watchdog removed.");
      } else {
        console.error(`Failed to uninstall medic: ${result.error}`);
        process.exit(1);
      }
      return;
    }

    if (action === "run") {
      const wantsJson = args.includes("--json");
      const result = await runMedicCheck();
      if (wantsJson) {
        console.log(JSON.stringify({
          id: result.id,
          checkedAt: result.checkedAt,
          issuesFound: result.issuesFound,
          actionsTaken: result.actionsTaken,
          summary: result.summary,
          findings: result.findings,
        }));
        return;
      }

      if (result.issuesFound === 0) {
        console.log(`All clear — no issues found (${result.checkedAt})`);
      } else {
        console.log(`Medic check complete: ${result.summary}`);
        console.log("");
        for (const f of result.findings) {
          const icon = f.severity === "critical" ? "!!!" : f.severity === "warning" ? " ! " : "   ";
          const fix = f.remediated ? " [FIXED]" : "";
          console.log(`  ${icon} ${f.message}${fix}`);
        }
      }
      return;
    }

    if (action === "status") {
      const status = getMedicStatus();
      const cronInstalled = await isMedicCronInstalled();

      console.log("Antfarm Medic");
      console.log(`  Cron: ${cronInstalled ? "installed (every 5 min)" : "not installed"}`);

      if (status.lastCheck) {
        const ago = Math.round((Date.now() - new Date(status.lastCheck.checkedAt).getTime()) / 60000);
        console.log(`  Last check: ${ago}min ago — ${status.lastCheck.summary}`);
      } else {
        console.log("  Last check: never");
      }

      console.log(`  Last 24h: ${status.recentChecks} checks, ${status.recentIssues} issues found, ${status.recentActions} auto-fixed`);
      return;
    }

    if (action === "log") {
      const limit = target ? parseInt(target, 10) || 20 : 20;
      const checks = getRecentMedicChecks(limit);
      if (checks.length === 0) {
        console.log("No medic checks recorded yet.");
        return;
      }
      for (const check of checks) {
        const ts = new Date(check.checkedAt).toLocaleString("en-US", {
          month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: true,
        });
        const icon = check.issuesFound > 0 ? (check.actionsTaken > 0 ? "~" : "X") : ".";
        console.log(`  ${icon} ${ts} — ${check.summary}`);
      }
      return;
    }

    printUsage();
    process.exit(1);
  }

  if (group === "step") {
    if (action === "peek") {
      if (!target) { process.stderr.write("Missing agent-id.\n"); process.exit(1); }
      const result = peekStep(target);
      process.stdout.write(result + "\n");
      return;
    }
    if (action === "claim") {
      if (!target) { process.stderr.write("Missing agent-id.\n"); process.exit(1); }
      const result = claimStep(target);
      if (!result.found) {
        process.stdout.write("NO_WORK\n");
      } else {
        process.stdout.write(JSON.stringify({ stepId: result.stepId, runId: result.runId, input: result.resolvedInput }) + "\n");
      }
      return;
    }
    if (action === "complete") {
      if (!target) { process.stderr.write("Missing step-id.\n"); process.exit(1); }
      // Read output from args or stdin
      let output = args.slice(3).join(" ").trim();
      if (!output) {
        // Read from stdin (piped input)
        const chunks: Buffer[] = [];
        for await (const chunk of process.stdin) {
          chunks.push(chunk);
        }
        output = Buffer.concat(chunks).toString("utf-8").trim();
      }
      const result = completeStep(target, output);
      process.stdout.write(JSON.stringify(result) + "\n");
      return;
    }
    if (action === "complete-file") {
      if (!target) { process.stderr.write("Missing step-id.\n"); process.exit(1); }
      const filePath = args[3];
      if (!filePath) { process.stderr.write("Missing output-file path.\n"); process.exit(1); }
      const { readFileSync } = await import("node:fs");
      const output = readFileSync(filePath, "utf-8").trim();
      const result = completeStep(target, output);
      process.stdout.write(JSON.stringify(result) + "\n");
      return;
    }
    if (action === "fail") {
      if (!target) { process.stderr.write("Missing step-id.\n"); process.exit(1); }
      const error = args.slice(3).join(" ").trim() || "Unknown error";
      const result = await failStep(target, error);
      process.stdout.write(JSON.stringify(result) + "\n");
      return;
    }
    if (action === "stories") {
      if (!target) { process.stderr.write("Missing run-id.\n"); process.exit(1); }
      const stories = getStories(target);
      if (stories.length === 0) { console.log("No stories found for this run."); return; }
      for (const s of stories) {
        const retryInfo = s.retryCount > 0 ? ` (retry ${s.retryCount})` : "";
        console.log(`${s.storyId.padEnd(8)} [${s.status.padEnd(7)}] ${s.title}${retryInfo}`);
      }
      return;
    }
    process.stderr.write(`Unknown step action: ${action}\n`);
    printUsage();
    process.exit(1);
  }

  if (group === "executor") {
    if (action === "run") {
      const workflowId = target;
      const agentId = args[3];
      const runId = args[4];
      const stepId = args[5];
      const inputFile = args[6];
      const outputFile = args[7];
      if (!workflowId || !agentId || !runId || !stepId || !inputFile || !outputFile) {
        process.stderr.write("Usage: antfarm executor run <workflow> <agent> <run-id> <step-id> <input-file> <output-file>\n");
        process.exit(1);
      }
      const input = readFileSync(inputFile, "utf-8");
      const result = await runConfiguredExecutor({ workflowId, agentId, runId, stepId, input, outputFile });
      process.stdout.write(JSON.stringify(result) + "\n");
      if (!result.ok) process.exit(1);
      return;
    }

    printUsage();
    process.exit(1);
  }

  if (group === "logs") {
    const arg = args[1];
    if (arg && !/^\d+$/.test(arg)) {
      // Looks like a run ID (or prefix)
      const events = getRunEvents(arg);
      if (events.length === 0) {
        console.log(`No events found for run matching "${arg}".`);
      } else {
        printEvents(events);
      }
      return;
    }
    // Also support "antfarm logs #3" to show events for run number 3
    if (arg && /^#\d+$/.test(arg)) {
      const runNum = parseInt(arg.slice(1), 10);
      const db2 = (await import("../db.js")).getDb();
      const r = db2.prepare("SELECT id FROM runs WHERE run_number = ?").get(runNum) as { id: string } | undefined;
      if (r) {
        const events = getRunEvents(r.id);
        if (events.length === 0) { console.log(`No events for run #${runNum}.`); }
        else { printEvents(events); }
      } else {
        console.log(`No run found with number #${runNum}.`);
      }
      return;
    }
    const limit = parseInt(arg, 10) || 50;
    const events = getRecentEvents(limit);
    printEvents(events);
    return;
  }

  if (args.length < 2) { printUsage(); process.exit(1); }
  if (group !== "workflow") { printUsage(); process.exit(1); }

  if (action === "runs") {
    const onlyArchived = args.includes("--archived");
    const includeArchived = args.includes("--all");
    const runs = listRuns({ includeArchived, onlyArchived });
    if (runs.length === 0) { console.log("No workflow runs found."); return; }
    console.log("Workflow runs:");
    for (const r of runs) {
      const num = r.run_number != null ? `#${r.run_number}` : r.id.slice(0, 8);
      const archivedMark = r.archived_at ? " (archived)" : "";
      console.log(`  [${r.status.padEnd(9)}] ${num.padEnd(6)} ${r.id.slice(0, 8)}  ${r.workflow_id.padEnd(14)}  ${r.task.slice(0, 50)}${r.task.length > 50 ? "..." : ""}${archivedMark}`);
    }
    return;
  }

  if (action === "list") {
    const workflows = await listBundledWorkflows();
    if (workflows.length === 0) { process.stdout.write("No workflows available.\n"); } else {
      process.stdout.write("Available workflows:\n");
      for (const w of workflows) process.stdout.write(`  ${w}\n`);
    }
    return;
  }

  if (action === "stop") {
    if (!target) { process.stderr.write("Missing run-id.\n"); printUsage(); process.exit(1); }
    const result = await stopWorkflow(target);
    if (result.status === "not_found") { process.stderr.write(result.message + "\n"); process.exit(1); }
    if (result.status === "already_done") { process.stderr.write(result.message + "\n"); process.exit(1); }
    console.log(`Cancelled run ${result.runId.slice(0, 8)} (${result.workflowId}). ${result.cancelledSteps} step(s) cancelled.`);
    return;
  }

  if (action === "archive") {
    if (!target) { process.stderr.write("Missing run-id.\n"); printUsage(); process.exit(1); }
    const result = await archiveWorkflow(target);
    if (result.status === "not_found" || result.status === "already_archived" || result.status === "not_archivable") {
      process.stderr.write(result.message + "\n");
      process.exit(1);
    }
    console.log(`Archived run ${result.runId.slice(0, 8)} (${result.workflowId}) at ${result.archivedAt}.`);
    return;
  }

  if (!target) { printUsage(); process.exit(1); }

  if (action === "install") {
    const result = await installWorkflow({ workflowId: target });
    process.stdout.write(`Installed workflow: ${result.workflowId}\nAgent crons will start when a run begins.\n`);
    process.stdout.write(`\nStart with: antfarm workflow run ${result.workflowId} "your task"\n`);
    return;
  }

  if (action === "uninstall") {
    const force = args.includes("--force");
    const isAll = target === "--all" || target === "all";
    const activeRuns = checkActiveRuns(isAll ? undefined : target);
    if (activeRuns.length > 0 && !force) {
      process.stderr.write(`Cannot uninstall: ${activeRuns.length} active run(s):\n`);
      for (const run of activeRuns) {
        process.stderr.write(`  - ${run.id} (${run.workflow_id}): ${run.task}\n`);
      }
      process.stderr.write(`\nUse --force to uninstall anyway.\n`);
      process.exit(1);
    }
    if (isAll) { await uninstallAllWorkflows(); } else { await uninstallWorkflow({ workflowId: target }); }
    return;
  }

  if (action === "status") {
    const query = args.slice(2).join(" ").trim();
    if (!query) { process.stderr.write("Missing search query.\n"); printUsage(); process.exit(1); }
    const result = getWorkflowStatus(query);
    if (result.status === "not_found") { process.stdout.write(`${result.message}\n`); return; }
    const { run, steps } = result;
    const runLabel = run.run_number != null ? `#${run.run_number} (${run.id})` : run.id;
    const lines = [
      `Run: ${runLabel}`,
      `Workflow: ${run.workflow_id}`,
      `Task: ${run.task.slice(0, 120)}${run.task.length > 120 ? "..." : ""}`,
      `Status: ${run.status}`,
      ...(run.archived_at ? [`Archived: ${run.archived_at}`] : []),
      `Created: ${run.created_at}`,
      `Updated: ${run.updated_at}`,
      "",
      "Steps:",
      ...steps.map((s) => formatStepStatusLine(s, s.queue)),
    ];
    const stories = getStories(run.id);
    if (stories.length > 0) {
      const done = stories.filter((s) => s.status === "done").length;
      const running = stories.filter((s) => s.status === "running").length;
      const failed = stories.filter((s) => s.status === "failed").length;
      lines.push("", `Stories: ${done}/${stories.length} done${running ? `, ${running} running` : ""}${failed ? `, ${failed} failed` : ""}`);
      for (const s of stories) {
        lines.push(`  ${s.storyId.padEnd(8)} [${s.status.padEnd(7)}] ${s.title}`);
      }
    }
    process.stdout.write(lines.join("\n") + "\n");
    return;
  }

  if (action === "pause") {
    if (!target) { process.stderr.write("Missing run-id.\n"); printUsage(); process.exit(1); }
    const result = await pauseWorkflow(target);
    if (result.status === "not_found") { process.stderr.write(`${result.message}\n`); process.exit(1); }
    if (result.status === "already_paused") { process.stderr.write(`${result.message}\n`); process.exit(1); }
    if (result.status === "not_pausable") { process.stderr.write(`${result.message}\n`); process.exit(1); }
    if (result.mode === "requested") {
      console.log(`Pause requested for run ${result.runId.slice(0, 8)} — a step is running and will settle between steps.`);
    } else {
      console.log(`Paused run ${result.runId.slice(0, 8)}.`);
    }
    return;
  }

  if (action === "resume") {
    if (!target) { process.stderr.write("Missing run-id.\n"); printUsage(); process.exit(1); }
    const result = await resumeWorkflow(target);
    if (result.status === "not_found") { process.stderr.write(`${result.message}\n`); process.exit(1); }
    if (result.status === "not_resumable") { process.stderr.write(`${result.message}\n`); process.exit(1); }
    console.log(`Resumed run ${result.runId.slice(0, 8)}${result.detail ? ` — ${result.detail}` : ""}`);
    return;
  }

  if (action === "ensure-crons") {
    const { loadWorkflowSpec } = await import("../installer/workflow-spec.js");
    const { resolveWorkflowDir } = await import("../installer/paths.js");
    const { setupAgentCrons, removeAgentCrons } = await import("../installer/agent-cron.js");
    const workflowDir = resolveWorkflowDir(target);
    const workflow = await loadWorkflowSpec(workflowDir);
    // Force recreate: remove existing then create fresh
    await removeAgentCrons(target);
    await setupAgentCrons(workflow);
    console.log(`Recreated agent crons for workflow "${target}".`);
    return;
  }

  if (action === "run") {
    let notifyUrl: string | undefined;
    const runArgs = args.slice(3);
    const nuIdx = runArgs.indexOf("--notify-url");
    if (nuIdx !== -1) {
      notifyUrl = runArgs[nuIdx + 1];
      runArgs.splice(nuIdx, 2);
    }
    const taskTitle = runArgs.join(" ").trim();
    if (!taskTitle) { process.stderr.write("Missing task title.\n"); printUsage(); process.exit(1); }
    const run = await runWorkflow({ workflowId: target, taskTitle, notifyUrl });
    process.stdout.write(
      [`Run: #${run.runNumber} (${run.id})`, `Workflow: ${run.workflowId}`, `Task: ${run.task}`, `Status: ${run.status}`].join("\n") + "\n",
    );
    return;
  }

  process.stderr.write(`Unknown action: ${action}\n`);
  printUsage();
  process.exit(1);
}

main().catch((err) => {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
