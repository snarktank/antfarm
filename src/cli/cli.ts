#!/usr/bin/env node
import { installWorkflow } from "../installer/install.js";
import { uninstallAllWorkflows, uninstallWorkflow, checkActiveRuns } from "../installer/uninstall.js";
import { getWorkflowStatus, listRuns } from "../installer/status.js";
import { runWorkflow } from "../installer/run.js";
import { listBundledWorkflows } from "../installer/workflow-fetch.js";
import { readRecentLogs } from "../lib/logger.js";
import { startDaemon, stopDaemon, getDaemonStatus, isRunning } from "../server/daemonctl.js";
import { claimStep, completeStep, failStep, getStories } from "../installer/step-ops.js";
import { ensureCliSymlink } from "../installer/symlink.js";
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
      "antfarm workflow runs                List all workflow runs",
      "antfarm workflow resume <run-id>     Resume a failed run from where it left off",
      "",
      "antfarm dashboard [start] [--port N]   Start dashboard daemon (default: 3333)",
      "antfarm dashboard stop                  Stop dashboard daemon",
      "antfarm dashboard status                Check dashboard status",
      "",
      "antfarm step claim <agent-id>       Claim pending step, output resolved input as JSON",
      "antfarm step complete <step-id>      Complete step (reads output from stdin)",
      "antfarm step fail <step-id> <error>  Fail step with retry logic",
      "antfarm step stories <run-id>       List stories for a run",
      "",
      "antfarm logs [<lines>]               Show recent log entries",
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
      const status = getDaemonStatus();
      console.log(`Dashboard already running (PID ${status?.pid})`);
      console.log(`  http://localhost:${port}`);
      return;
    }

    const result = await startDaemon(port);
    console.log(`Dashboard started (PID ${result.pid})`);
    console.log(`  http://localhost:${result.port}`);
    return;
  }

  if (group === "step") {
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
    if (action === "fail") {
      if (!target) { process.stderr.write("Missing step-id.\n"); process.exit(1); }
      const error = args.slice(3).join(" ").trim() || "Unknown error";
      const result = failStep(target, error);
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

  if (group === "logs") {
    const lines = parseInt(args[1], 10) || 50;
    const logs = await readRecentLogs(lines);
    if (logs.length === 0) { console.log("No logs yet."); } else { for (const line of logs) console.log(line); }
    return;
  }

  if (args.length < 2) { printUsage(); process.exit(1); }
  if (group !== "workflow") { printUsage(); process.exit(1); }

  if (action === "runs") {
    const runs = listRuns();
    if (runs.length === 0) { console.log("No workflow runs found."); return; }
    console.log("Workflow runs:");
    for (const r of runs) {
      console.log(`  [${r.status.padEnd(9)}] ${r.id.slice(0, 8)}  ${r.workflow_id.padEnd(14)}  ${r.task.slice(0, 50)}${r.task.length > 50 ? "..." : ""}`);
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
    const lines = [
      `Run: ${run.id}`,
      `Workflow: ${run.workflow_id}`,
      `Task: ${run.task.slice(0, 120)}${run.task.length > 120 ? "..." : ""}`,
      `Status: ${run.status}`,
      `Created: ${run.created_at}`,
      `Updated: ${run.updated_at}`,
      "",
      "Steps:",
      ...steps.map((s) => `  [${s.status}] ${s.step_id} (${s.agent_id})`),
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

  if (action === "resume") {
    if (!target) { process.stderr.write("Missing run-id.\n"); printUsage(); process.exit(1); }
    const db = (await import("../db.js")).getDb();

    // Find the run (support prefix match)
    const run = db.prepare(
      "SELECT id, workflow_id, status FROM runs WHERE id = ? OR id LIKE ?"
    ).get(target, `${target}%`) as { id: string; workflow_id: string; status: string } | undefined;

    if (!run) { process.stderr.write(`Run not found: ${target}\n`); process.exit(1); }
    if (run.status !== "failed") {
      process.stderr.write(`Run ${run.id.slice(0, 8)} is "${run.status}", not "failed". Nothing to resume.\n`);
      process.exit(1);
    }

    // Find the failed step (or first non-done step)
    const failedStep = db.prepare(
      "SELECT id, step_id, type, current_story_id FROM steps WHERE run_id = ? AND status = 'failed' ORDER BY step_index ASC LIMIT 1"
    ).get(run.id) as { id: string; step_id: string; type: string; current_story_id: string | null } | undefined;

    if (!failedStep) {
      process.stderr.write(`No failed step found in run ${run.id.slice(0, 8)}.\n`);
      process.exit(1);
    }

    // If it's a loop step with a failed story, reset that story to pending
    if (failedStep.type === "loop") {
      const failedStory = db.prepare(
        "SELECT id FROM stories WHERE run_id = ? AND status = 'failed' ORDER BY story_index ASC LIMIT 1"
      ).get(run.id) as { id: string } | undefined;
      if (failedStory) {
        db.prepare(
          "UPDATE stories SET status = 'pending', updated_at = datetime('now') WHERE id = ?"
        ).run(failedStory.id);
      }
    }

    // Reset step to pending
    db.prepare(
      "UPDATE steps SET status = 'pending', current_story_id = NULL, updated_at = datetime('now') WHERE id = ?"
    ).run(failedStep.id);

    // Reset run to running
    db.prepare(
      "UPDATE runs SET status = 'running', updated_at = datetime('now') WHERE id = ?"
    ).run(run.id);

    // Ensure crons are running for this workflow
    const { loadWorkflowSpec } = await import("../installer/workflow-spec.js");
    const { resolveWorkflowDir } = await import("../installer/paths.js");
    const { ensureWorkflowCrons } = await import("../installer/agent-cron.js");
    try {
      const workflowDir = resolveWorkflowDir(run.workflow_id);
      const workflow = await loadWorkflowSpec(workflowDir);
      await ensureWorkflowCrons(workflow);
    } catch (err) {
      process.stderr.write(`Warning: Could not start crons: ${err instanceof Error ? err.message : String(err)}\n`);
    }

    console.log(`Resumed run ${run.id.slice(0, 8)} from step "${failedStep.step_id}"`);
    return;
  }

  if (action === "run") {
    const taskTitle = args.slice(3).join(" ").trim();
    if (!taskTitle) { process.stderr.write("Missing task title.\n"); printUsage(); process.exit(1); }
    const run = await runWorkflow({ workflowId: target, taskTitle });
    process.stdout.write(
      [`Run: ${run.id}`, `Workflow: ${run.workflowId}`, `Task: ${run.task}`, `Status: ${run.status}`].join("\n") + "\n",
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
