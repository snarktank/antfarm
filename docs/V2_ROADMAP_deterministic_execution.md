V2 Roadmap v1 — Next Major Milestone After
Milestone 2: Automatic Worker Progression (no manual node step_runner)

Goal: A workflow run progresses through steps automatically via a worker loop (systemd or OpenClaw cron), without manual intervention.

Deliverables

A single canonical “worker entrypoint”

scripts/antfarm-worker.cjs (or similar)

loops: claim → execute → complete/fail → repeat

One canonical scheduler
Pick exactly one:

Option A: systemd timer/service (preferred for VPS stability)

Option B: OpenClaw cron job calling the worker

Guardrails

prevent infinite loops

detect “stuck running” runs

structured logs written to a single known path (and rotate)

Acceptance Criteria

./bin/antfarm workflow run smoke "auto worker test"

without running node scripts/step_runner...

the run completes within N minutes and logs show both steps executed

Milestone 3: Expand beyond smoke (multi-agent deterministic pipeline)

add a second workflow that resembles your real pipeline (feature-dev/...)

verify:

steps advance deterministically

failures are reported as failed steps (not silent NO_WORK loops)

output capture is consistent

Milestone 4: OpenClaw ↔ Antfarm cron alignment

ensure OpenClaw cron schedule + Antfarm worker expectations are aligned

define:

“who is the scheduler?”

“who is the worker?”

“where is state of truth?”

remove duplicate crons / conflicting runners