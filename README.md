# Antfarm

![Antfarm logo](assets/logo.jpeg)

Multi-agent workflow orchestration for [OpenClaw](https://github.com/openclaw/openclaw). Define workflows as YAML, install them with one command, and let coordinated agents execute complex tasks autonomously.

## What It Does

Antfarm takes a task description and runs it through a pipeline of specialized AI agents. Each agent handles one concern — planning, setup, implementation, verification, testing, PR creation, code review — and hands off to the next. Agents run in isolated sessions with fresh context, communicate through a SQLite database, and poll for work via cron jobs.

**Key features:**
- Story-based execution: tasks are decomposed into small, verifiable user stories
- Loop steps with per-story verification and automatic retry on failure
- Fresh sessions per story to avoid context window bloat
- Built-in dashboard for monitoring runs
- Install workflows from local paths, GitHub repos, or raw URLs
- Three bundled workflows: feature development, security audit, bug fix

## Setup

```bash
npm install
npm run build
```

## Quickstart

```bash
# Install all bundled workflows and start the dashboard
antfarm install

# Run a workflow
antfarm workflow run feature-dev "Add user authentication"

# Check status
antfarm workflow status "Add user authentication"
```

## Bundled Workflows

### feature-dev
Full development pipeline: plan → setup → implement (story loop) → verify → test → PR → review. The planner decomposes tasks into ordered user stories. The developer implements each story in a fresh session with tests. A verifier checks each story before moving on.

### security-audit
Security scanning and remediation: scan → prioritize → setup → fix (loop) → verify → test → PR. The scanner runs comprehensive vulnerability analysis. Findings are deduplicated and ranked. The fixer implements targeted patches with regression tests.

### bug-fix
Bug triage and fix: triage → investigate → setup → fix → verify → PR. The triager reproduces the issue. The investigator traces root cause. The fixer implements a minimal fix with a regression test.

## Commands

```
antfarm install                        Install all bundled workflows + agent crons
antfarm uninstall [--force]            Full uninstall (workflows, agents, crons, DB)

antfarm workflow list                  List available workflows
antfarm workflow install <name>        Install a workflow
antfarm workflow uninstall <name>      Uninstall a workflow (blocked if runs active)
antfarm workflow uninstall --all       Uninstall all workflows (--force to override)
antfarm workflow run <name> <task>     Start a workflow run
antfarm workflow status <query>        Check run status (task substring or run ID prefix)
antfarm workflow runs                  List all workflow runs
antfarm workflow resume <run-id>       Resume a failed run from where it left off

antfarm dashboard [start] [--port N]   Start dashboard daemon (default: 3333)
antfarm dashboard stop                 Stop dashboard daemon
antfarm dashboard status               Check dashboard status

antfarm step claim <agent-id>          Claim pending step (outputs resolved input as JSON)
antfarm step complete <step-id>        Complete step (reads output from stdin)
antfarm step fail <step-id> <error>    Fail step with retry logic
antfarm step stories <run-id>          List stories for a run

antfarm logs [<lines>]                 Show recent log entries
```

## How It Works

1. **Workflow YAML** defines agents (with workspace files) and steps (with input templates and retry/escalation rules).
2. `antfarm workflow install` provisions agent workspaces, registers agents in OpenClaw config, sets up cron polling, and updates the subagent allowlist.
3. `antfarm workflow run` creates a run in SQLite and queues the first step.
4. Agents poll for work every 15 minutes via OpenClaw cron jobs. When a step is claimed, the agent receives the resolved input (with template variables filled from prior step outputs).
5. Loop steps iterate over stories with optional per-story verification. Failed verifications retry the implementation step automatically.
6. Steps can escalate to a human if retries are exhausted.

## Architecture

```
antfarm/
├── src/
│   ├── cli/          CLI entrypoint
│   ├── installer/    Install, uninstall, run, status, step ops, cron, config
│   ├── server/       Dashboard daemon and web UI
│   └── lib/          Logging utilities
├── workflows/        Bundled workflow definitions
│   ├── feature-dev/
│   ├── security-audit/
│   └── bug-fix/
├── agents/           Shared agent workspace files
│   └── shared/       Setup, verifier, PR agents (reused across workflows)
└── skills/           OpenClaw skills for workflow agents
```

## Creating Custom Workflows

See [docs/creating-workflows.md](docs/creating-workflows.md) for a complete guide on writing your own workflow definitions, agent workspaces, and step templates.

## Requirements

- Node.js >= 22
- [OpenClaw](https://github.com/openclaw/openclaw) running on the host
- `gh` CLI for PR creation steps

## License

Private.
