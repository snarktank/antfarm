---
name: antfarm-workflows
description: Plan and execute multi-agent workflows with Antfarm. Use when user mentions antfarm, asks to run a workflow, or requests a complex task that benefits from multiple specialized agents. MUST be loaded before running any antfarm command.
user-invocable: false
---

# Antfarm Workflows

> **STOP.** Do NOT run any antfarm workflow without completing Steps 1-3 below. Vague tasks produce bad results. Your job is to clarify, plan, and get approval BEFORE launching.

Antfarm runs multi-agent workflows on OpenClaw. Each workflow defines a pipeline of agents (e.g. developer -> verifier -> tester -> reviewer) that execute autonomously via cron jobs polling a shared SQLite database.

## How It Works

- **SQLite** (`~/.openclaw/antfarm/antfarm.db`) stores runs and steps with status tracking
- **Each agent has a cron job** (every 15 min, staggered) that checks for pending work
- When an agent finds a pending step, it claims it, does the work, marks it done, and advances the next step to pending
- **No central orchestrator.** Agents are autonomous and self-serving.
- **Context passes between steps** via KEY: value pairs in agent output, stored as JSON in the run record

## Your Role (MANDATORY)

You are the planner. Agents are the executors. **Never start a workflow with a vague task.**

### Step 1: Clarify Requirements

Ask the user:
- What specifically needs to be built?
- What are the key features/components?
- Any technical constraints or preferences?
- What does "done" look like?

### Step 2: Draft the Plan

Write a concrete implementation plan with numbered subtasks:
```
1. [Specific subtask with details]
2. [Next subtask]
3. [etc.]
```

Share with the user. Iterate until they approve.

### Step 3: Define Acceptance Criteria

Get explicit agreement:
- [ ] Criterion 1
- [ ] Criterion 2
- [ ] Criterion 3

The user must confirm before proceeding.

### Step 4: Start the Workflow

```bash
cd ~/.openclaw/workspace/antfarm && node dist/cli/cli.js workflow run <workflow-id> "<full task description including plan and acceptance criteria>"
```

The task string is the contract between you and the agents. Include everything they need.

## CLI Reference

```bash
# Antfarm CLI location
cd ~/.openclaw/workspace/antfarm && node dist/cli/cli.js <command>

# Install all bundled workflows + create agent cron jobs
antfarm install

# List available workflows
antfarm workflow list

# Install a specific workflow
antfarm workflow install <workflow-id>

# Start a run
antfarm workflow run <workflow-id> "<detailed task>"

# Check status
antfarm workflow status "<task>"

# View logs
antfarm logs

# Uninstall a single workflow
antfarm workflow uninstall <workflow-id>
antfarm workflow uninstall --all

# Full uninstall (all workflows, agents, crons, DB, skill)
antfarm uninstall [--force]
```

## Checking Status

Query SQLite directly for quick checks:

```bash
# Run status
sqlite3 ~/.openclaw/antfarm/antfarm.db "SELECT task, status FROM runs ORDER BY created_at DESC LIMIT 5"

# Step details for a run
sqlite3 ~/.openclaw/antfarm/antfarm.db "SELECT step_id, agent_id, status, output FROM steps WHERE run_id = '<run-id>' ORDER BY step_index"

# Current context
sqlite3 ~/.openclaw/antfarm/antfarm.db "SELECT context FROM runs WHERE id = '<run-id>'"
```

Or use the CLI:
```bash
antfarm workflow status "<task title>"
```

## Manually Triggering Agents

Agents poll every 15 minutes. To skip the wait, force-trigger an agent's cron job:

Use the `cron` tool with `action: "run"` and the agent's cron job ID. List crons to find the right one -- they're named `antfarm/<workflow-id>/<agent-id>`.

## Available Workflows

### feature-dev
Pipeline: implement (developer) -> verify (verifier) -> test (tester) -> PR (developer) -> review (reviewer)

Best for: Feature work that needs implementation, QA, and code review.

### counter-test
Pipeline: adder-a -> adder-b -> adder-c (each adds 1 to a number)

Test-only workflow for validating the pipeline works.

## Example

**User:** Build a signup form for the app

**You:** Before I kick off the dev workflow, let me nail down the spec:
- What fields? Email + password, or more?
- Validation requirements?
- Where does it submit to?
- Any design reference?

**User:** [provides details]

**You:** Here's my plan:
1. Create SignupForm component with email, password, confirm password fields
2. Add client-side validation (email format, password strength, match check)
3. Wire up form submission to POST /api/auth/signup
4. Handle success (redirect) and error (inline messages) states
5. Add unit tests for validation logic
6. Add integration test for form submission

Acceptance criteria:
- [ ] Form renders with all three fields
- [ ] Validation errors display inline
- [ ] Successful signup redirects to /dashboard
- [ ] API errors display user-friendly messages
- [ ] All tests pass

Look good?

**User:** Yes, go

**You:** *runs `antfarm workflow run feature-dev "<full spec>"`*

The developer agent will pick this up on its next cron cycle (up to 15 min). I can force-trigger it now if you want it started immediately.
