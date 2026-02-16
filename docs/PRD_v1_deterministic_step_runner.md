PRD v1 — Deterministic Step Runner for Antfarm Workflows
Goal

Unblock “NO_WORK / stuck workflow” situations by adding a deterministic runner that can:

claim work for an agent

locate the real step UUID in the DB (not the alias like alpha)

complete/fail the step using the UUID

verify end-to-end completion of a basic smoke workflow

Problem Statement

In the current environment:

./bin/antfarm step claim smoke/alpha may return NO_WORK even when DB shows step rows in running/waiting.

Even when work exists, using step complete alpha fails because the CLI expects a step UUID, not the friendly agent name/alias.

This causes workflows to remain stuck “running” and blocks the deterministic pipeline.

Non-Goals (v1)

Fully automated cron-to-worker synchronization (OpenClaw cron integration) beyond a minimal, manual test path.

Complex multi-step agent workflows beyond smoke.

Replacing Antfarm’s internal worker; v1 is a stabilizing shim / deterministic runner.

Scope (v1 Deliverables)

scripts/step_runner.cjs

deterministic runner that:

claims work for agent_id

finds step UUID via sqlite query

completes the step with structured output via stdin

workflows/smoke/workflow.yml + workflows/smoke/dummy.txt

minimal smoke workflow for verification

guard / helper scripts

e.g., coordination / validation helpers (as present in your changes)

documented runbook for:

running smoke end-to-end

resetting stuck runs safely (targeted)

Assumptions / Constraints

VPS environment is Debian/Ubuntu-like

Antfarm repo path: /root/smartfunds/src/antfarm

Antfarm DB path: /root/.openclaw/antfarm/antfarm.db

Node is installed (you’re on Node v22.x)

Repo is ESM (package.json includes "type": "module") → runner must be .cjs or use import

Acceptance Criteria (Definition of Done)

A fresh run of:

./bin/antfarm workflow run smoke "pre-AFK verification"

followed by:

node scripts/step_runner.cjs smoke/alpha

node scripts/step_runner.cjs smoke/beta
results in:

DB runs.status = completed

DB steps for that run show done for both steps

Risks / Mitigations

Risk: DB reset queries could be too broad.

Mitigation: restrict resets to workflow_id + status filters; document clearly.

Risk: Node ESM/CommonJS mismatch breaks runner.

Mitigation: use .cjs runner (implemented).

Risk: multiple stale runs confuse claims.

Mitigation: provide explicit “mark running runs failed” step only when needed.