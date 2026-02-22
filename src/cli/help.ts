/**
 * Centralized help text module for Antfarm CLI
 */

import { getVersion } from './version.js';

export interface CommandExample {
  description: string;
  command: string;
}

export interface CommandHelp {
  command: string;
  description: string;
  usage: string;
  examples?: CommandExample[];
  subcommands?: Record<string, {
    description: string;
    usage: string;
  }>;
}

const commands: Record<string, CommandHelp> = {
  install: {
    command: "install",
    description: "Install all bundled workflows",
    usage: "antfarm install",
    examples: [
      {
        description: "Install all workflows and start the dashboard",
        command: "antfarm install",
      },
    ],
  },
  uninstall: {
    command: "uninstall",
    description: "Full uninstall (workflows, agents, crons, database)",
    usage: "antfarm uninstall [--force]",
    examples: [
      {
        description: "Uninstall everything (blocks if active runs exist)",
        command: "antfarm uninstall",
      },
      {
        description: "Force uninstall even with active runs",
        command: "antfarm uninstall --force",
      },
    ],
  },
  workflow: {
    command: "workflow",
    description: "Manage workflows and workflow runs",
    usage: "antfarm workflow <action> [options]",
    subcommands: {
      list: {
        description: "List available workflows",
        usage: "antfarm workflow list",
      },
      install: {
        description: "Install a specific workflow",
        usage: "antfarm workflow install <name>",
      },
      uninstall: {
        description: "Uninstall a workflow (blocked if runs active)",
        usage: "antfarm workflow uninstall <name> [--force]",
      },
      run: {
        description: "Start a new workflow run",
        usage: "antfarm workflow run <name> <task> [--notify-url <url>]",
      },
      status: {
        description: "Check run status (by task substring or run ID prefix)",
        usage: "antfarm workflow status <query>",
      },
      runs: {
        description: "List all workflow runs",
        usage: "antfarm workflow runs",
      },
      resume: {
        description: "Resume a failed run from where it left off",
        usage: "antfarm workflow resume <run-id>",
      },
      stop: {
        description: "Stop/cancel a running workflow",
        usage: "antfarm workflow stop <run-id>",
      },
      "ensure-crons": {
        description: "Recreate agent crons for a workflow",
        usage: "antfarm workflow ensure-crons <name>",
      },
    },
    examples: [
      {
        description: "Start a feature development workflow",
        command: "antfarm workflow run feature-dev 'Add user authentication'",
      },
      {
        description: "Check status of a workflow run",
        command: "antfarm workflow status 'user auth'",
      },
      {
        description: "Resume a failed workflow",
        command: "antfarm workflow resume abc123",
      },
    ],
  },
  dashboard: {
    command: "dashboard",
    description: "Control the web dashboard daemon",
    usage: "antfarm dashboard [action] [--port N]",
    subcommands: {
      start: {
        description: "Start dashboard daemon (default port: 3333)",
        usage: "antfarm dashboard [start] [--port N]",
      },
      stop: {
        description: "Stop dashboard daemon",
        usage: "antfarm dashboard stop",
      },
      status: {
        description: "Check dashboard status",
        usage: "antfarm dashboard status",
      },
    },
    examples: [
      {
        description: "Start dashboard on default port",
        command: "antfarm dashboard",
      },
      {
        description: "Start dashboard on custom port",
        command: "antfarm dashboard --port 4000",
      },
    ],
  },
  step: {
    command: "step",
    description: "Low-level step operations (for agent implementations)",
    usage: "antfarm step <action> [options]",
    subcommands: {
      peek: {
        description: "Check for pending work (HAS_WORK or NO_WORK)",
        usage: "antfarm step peek <agent-id>",
      },
      claim: {
        description: "Claim pending step, output resolved input as JSON",
        usage: "antfarm step claim <agent-id>",
      },
      complete: {
        description: "Complete step (reads output from stdin)",
        usage: "antfarm step complete <step-id>",
      },
      fail: {
        description: "Fail step with retry logic",
        usage: "antfarm step fail <step-id> <error>",
      },
      stories: {
        description: "List stories for a run",
        usage: "antfarm step stories <run-id>",
      },
    },
  },
  medic: {
    command: "medic",
    description: "Watchdog service to monitor and maintain workflow health",
    usage: "antfarm medic <action>",
    subcommands: {
      install: {
        description: "Install medic watchdog cron (runs every 5 minutes)",
        usage: "antfarm medic install",
      },
      uninstall: {
        description: "Remove medic cron",
        usage: "antfarm medic uninstall",
      },
      run: {
        description: "Run medic check now (manual trigger)",
        usage: "antfarm medic run",
      },
      status: {
        description: "Show medic health summary",
        usage: "antfarm medic status",
      },
      log: {
        description: "Show recent medic check history",
        usage: "antfarm medic log [<count>]",
      },
    },
    examples: [
      {
        description: "Install the medic watchdog",
        command: "antfarm medic install",
      },
      {
        description: "Run a manual health check",
        command: "antfarm medic run",
      },
    ],
  },
  logs: {
    command: "logs",
    description: "Show recent activity from workflow events",
    usage: "antfarm logs [<lines>|<run-id>]",
    examples: [
      {
        description: "Show last 50 events",
        command: "antfarm logs",
      },
      {
        description: "Show last 100 events",
        command: "antfarm logs 100",
      },
      {
        description: "Show events for a specific run",
        command: "antfarm logs abc123",
      },
      {
        description: "Show events for run number 3",
        command: "antfarm logs #3",
      },
    ],
  },
  version: {
    command: "version",
    description: "Show installed Antfarm version",
    usage: "antfarm version",
  },
  update: {
    command: "update",
    description: "Pull latest changes, rebuild, and reinstall workflows",
    usage: "antfarm update",
    examples: [
      {
        description: "Update Antfarm to the latest version",
        command: "antfarm update",
      },
    ],
  },
};

/**
 * Print general help text with all available commands
 */
export function printHelp(): void {
  process.stdout.write(`Antfarm v${getVersion()}\n`);
  process.stdout.write("Autonomous workflow orchestration\n\n");
  
  // Quick Start section
  process.stdout.write("QUICK START:\n");
  process.stdout.write("  antfarm install                    # Install bundled workflows\n");
  process.stdout.write("  antfarm workflow list              # See available workflows\n");
  process.stdout.write("  antfarm workflow run <name> \"...\"  # Start your first workflow\n");
  process.stdout.write("  antfarm dashboard                  # Monitor progress\n\n");
  
  process.stdout.write("USAGE:\n");
  process.stdout.write("  antfarm <command> [options]\n\n");
  process.stdout.write("COMMANDS:\n\n");

  // Core commands
  printCommandSection("install", commands.install);
  printCommandSection("uninstall", commands.uninstall);
  printCommandSection("version", commands.version);
  printCommandSection("update", commands.update);

  // Workflow management
  process.stdout.write("\nWorkflow Management:\n");
  printCommandSection("workflow", commands.workflow);

  // Monitoring & Control
  process.stdout.write("\nMonitoring & Control:\n");
  printCommandSection("dashboard", commands.dashboard);
  printCommandSection("logs", commands.logs);
  printCommandSection("medic", commands.medic);

  // Advanced
  process.stdout.write("\nAdvanced (for agent implementations):\n");
  printCommandSection("step", commands.step);

  // Common workflows
  process.stdout.write("\nCOMMON WORKFLOWS:\n\n");
  process.stdout.write("  Get started:\n");
  process.stdout.write("    antfarm install                              # Install workflows\n");
  process.stdout.write("    antfarm workflow run <name> \"<task>\"         # Start a workflow\n");
  process.stdout.write("    antfarm dashboard                            # Open dashboard\n\n");

  process.stdout.write("  Monitor workflow:\n");
  process.stdout.write("    antfarm workflow status \"<task-keyword>\"     # Check run status\n");
  process.stdout.write("    antfarm logs                                 # View recent activity\n");
  process.stdout.write("    antfarm workflow runs                        # List all runs\n\n");

  process.stdout.write("  Troubleshooting:\n");
  process.stdout.write("    antfarm medic install                        # Enable health monitoring\n");
  process.stdout.write("    antfarm medic run                            # Check for issues\n");
  process.stdout.write("    antfarm workflow resume <run-id>             # Resume failed run\n\n");

  process.stdout.write("For detailed command help: antfarm <command> --help\n");
}

/**
 * Print help text for a specific command
 */
export function printCommandHelp(command: string): void {
  const cmd = commands[command];
  if (!cmd) {
    process.stderr.write(`Unknown command: ${command}\n\n`);
    printHelp();
    return;
  }

  process.stdout.write(`${cmd.command.toUpperCase()}\n\n`);
  process.stdout.write(`${cmd.description}\n\n`);
  process.stdout.write(`USAGE:\n  ${cmd.usage}\n\n`);

  if (cmd.subcommands) {
    process.stdout.write("SUBCOMMANDS:\n");
    for (const [name, sub] of Object.entries(cmd.subcommands)) {
      process.stdout.write(`  ${name.padEnd(15)} ${sub.description}\n`);
      process.stdout.write(`                  ${sub.usage}\n`);
    }
    process.stdout.write("\n");
  }

  if (cmd.examples && cmd.examples.length > 0) {
    process.stdout.write("EXAMPLES:\n");
    for (const ex of cmd.examples) {
      process.stdout.write(`  ${ex.description}:\n`);
      process.stdout.write(`    ${ex.command}\n\n`);
    }
  }
}

/**
 * Print detailed help for workflow subcommands
 */
export function printWorkflowHelp(): void {
  const cmd = commands.workflow;
  
  process.stdout.write("WORKFLOW - Manage workflows and workflow runs\n\n");
  process.stdout.write(`${cmd.description}\n\n`);
  process.stdout.write(`USAGE:\n  ${cmd.usage}\n\n`);

  if (cmd.subcommands) {
    process.stdout.write("SUBCOMMANDS:\n\n");
    for (const [name, sub] of Object.entries(cmd.subcommands)) {
      process.stdout.write(`  ${name.padEnd(15)} ${sub.description}\n`);
      process.stdout.write(`                  ${sub.usage}\n\n`);
    }
  }

  if (cmd.examples && cmd.examples.length > 0) {
    process.stdout.write("EXAMPLES:\n\n");
    for (const ex of cmd.examples) {
      process.stdout.write(`  ${ex.description}:\n`);
      process.stdout.write(`    ${ex.command}\n\n`);
    }
  }

  process.stdout.write("For general help: antfarm --help\n");
}

/**
 * Print detailed help for dashboard subcommands
 */
export function printDashboardHelp(): void {
  const cmd = commands.dashboard;
  
  process.stdout.write("DASHBOARD - Control the web dashboard daemon\n\n");
  process.stdout.write(`${cmd.description}\n\n`);
  process.stdout.write(`USAGE:\n  ${cmd.usage}\n\n`);

  if (cmd.subcommands) {
    process.stdout.write("SUBCOMMANDS:\n\n");
    for (const [name, sub] of Object.entries(cmd.subcommands)) {
      process.stdout.write(`  ${name.padEnd(15)} ${sub.description}\n`);
      process.stdout.write(`                  ${sub.usage}\n\n`);
    }
  }

  if (cmd.examples && cmd.examples.length > 0) {
    process.stdout.write("EXAMPLES:\n\n");
    for (const ex of cmd.examples) {
      process.stdout.write(`  ${ex.description}:\n`);
      process.stdout.write(`    ${ex.command}\n\n`);
    }
  }

  process.stdout.write("For general help: antfarm --help\n");
}

/**
 * Print detailed help for step subcommands
 */
export function printStepHelp(): void {
  const cmd = commands.step;
  
  process.stdout.write("STEP - Low-level step operations\n\n");
  process.stdout.write(`${cmd.description}\n\n`);
  
  process.stdout.write("⚠️  NOTE: Step commands are primarily for internal agent use.\n");
  process.stdout.write("    Most users should use workflow commands instead.\n\n");
  
  process.stdout.write(`USAGE:\n  ${cmd.usage}\n\n`);

  if (cmd.subcommands) {
    process.stdout.write("SUBCOMMANDS:\n\n");
    for (const [name, sub] of Object.entries(cmd.subcommands)) {
      process.stdout.write(`  ${name.padEnd(15)} ${sub.description}\n`);
      process.stdout.write(`                  ${sub.usage}\n\n`);
    }
  }

  process.stdout.write("EXAMPLES (step workflow lifecycle):\n\n");
  process.stdout.write("  Check for pending work:\n");
  process.stdout.write("    antfarm step peek developer\n\n");
  process.stdout.write("  Claim a step and receive work:\n");
  process.stdout.write("    antfarm step claim developer\n");
  process.stdout.write("    # Returns JSON: {stepId, runId, input}\n\n");
  process.stdout.write("  Complete a step (provide output via stdin):\n");
  process.stdout.write("    echo 'STATUS: done' | antfarm step complete <step-id>\n\n");
  process.stdout.write("  Fail a step with error message:\n");
  process.stdout.write("    antfarm step fail <step-id> 'Build failed'\n\n");
  process.stdout.write("  List stories for a run:\n");
  process.stdout.write("    antfarm step stories <run-id>\n\n");

  process.stdout.write("For general help: antfarm --help\n");
}

/**
 * Print detailed help for medic subcommands
 */
export function printMedicHelp(): void {
  const cmd = commands.medic;
  
  process.stdout.write("MEDIC - Watchdog service for workflow health\n\n");
  process.stdout.write(`${cmd.description}\n\n`);
  
  process.stdout.write("The medic watchdog monitors your Antfarm installation and automatically\n");
  process.stdout.write("fixes common issues like stuck workflows, orphaned processes, and missing crons.\n\n");
  
  process.stdout.write(`USAGE:\n  ${cmd.usage}\n\n`);

  if (cmd.subcommands) {
    process.stdout.write("SUBCOMMANDS:\n\n");
    for (const [name, sub] of Object.entries(cmd.subcommands)) {
      process.stdout.write(`  ${name.padEnd(15)} ${sub.description}\n`);
      process.stdout.write(`                  ${sub.usage}\n\n`);
    }
  }

  if (cmd.examples && cmd.examples.length > 0) {
    process.stdout.write("EXAMPLES:\n\n");
    for (const ex of cmd.examples) {
      process.stdout.write(`  ${ex.description}:\n`);
      process.stdout.write(`    ${ex.command}\n\n`);
    }
  }

  process.stdout.write("For general help: antfarm --help\n");
}

/**
 * Print detailed help for logs command
 */
export function printLogsHelp(): void {
  const cmd = commands.logs;
  
  process.stdout.write("LOGS - Show recent activity from workflow events\n\n");
  process.stdout.write(`${cmd.description}\n\n`);
  
  process.stdout.write(`USAGE:\n  ${cmd.usage}\n\n`);

  process.stdout.write("VARIANTS:\n\n");
  process.stdout.write("  logs [lines]     Show the last N events (default: 50)\n");
  process.stdout.write("                   antfarm logs\n");
  process.stdout.write("                   antfarm logs 100\n\n");
  process.stdout.write("  logs <run-id>    Show all events for a specific run (by ID or prefix)\n");
  process.stdout.write("                   antfarm logs abc123\n\n");
  process.stdout.write("  logs #<number>   Show all events for run number N\n");
  process.stdout.write("                   antfarm logs #3\n\n");

  if (cmd.examples && cmd.examples.length > 0) {
    process.stdout.write("EXAMPLES:\n\n");
    process.stdout.write("  View recent activity:\n");
    process.stdout.write(`    ${cmd.examples[0].command}    # ${cmd.examples[0].description}\n`);
    process.stdout.write(`    ${cmd.examples[1].command}  # ${cmd.examples[1].description}\n\n`);
    
    process.stdout.write("  View run-specific logs:\n");
    process.stdout.write(`    ${cmd.examples[2].command}  # ${cmd.examples[2].description}\n`);
    process.stdout.write(`    ${cmd.examples[3].command}     # ${cmd.examples[3].description}\n\n`);
  }

  process.stdout.write("For general help: antfarm --help\n");
}

/**
 * Helper to print a command section
 */
function printCommandSection(name: string, cmd: CommandHelp): void {
  const indent = "  ";
  process.stdout.write(`${indent}${name.padEnd(12)} ${cmd.description}\n`);
  
  if (cmd.subcommands) {
    for (const [subName, sub] of Object.entries(cmd.subcommands)) {
      process.stdout.write(`${indent}  ${subName.padEnd(10)} ${sub.description}\n`);
    }
  }
}
