# Changelog

## v0.3.0 — 2026-02-11

### Added
- **Human gate steps** — workflows can now include `gate: true` steps that pause execution and wait for human approval before advancing. This lets you insert review checkpoints into any pipeline (e.g. approve a spec before planning begins).
- **Delivery instructions** — `workflow run --delivery <json>` tells the main agent how and where to surface gate notifications (Slack thread, terminal, etc.). Antfarm is transport-agnostic; delivery logic lives in agent guidance, not in core.
- **Gate codes** — notifications include a two-word code (e.g. `bold-falcon`) the human uses to discuss or approve a gate inline, without leaving their current context. Gate codes are a workaround for an OpenClaw bug where `sessions_send` strips channel identity; once that's fixed, gates will notify the thread directly.
- **`on_gate` directive** — workflow steps can specify custom notification instructions in YAML, giving workflow authors control over what the human sees at each gate.
- **`spec-review` workflow** — new bundled workflow: spec → gate (human approval) → plan. First workflow to use gating.
- **`antfarm step approve <gate-code>`** — CLI command to approve a pending gate step and advance the pipeline.
- Dedicated `gates.md` skill documentation covering delivery, gate codes, discussion flow, and editable artifacts.

## v0.2.2 — 2026-02-11

### Fixed
- Prevented mixed timestamp formats from triggering false abandoned-step cleanups
- Guarded pipeline completion when steps or stories are failed/pending

### Added
- Per-agent timeout override for cron sessions via workflow agent `timeoutSeconds`

## v0.2.1 — 2026-02-11

### Fixed
- Hardened pipeline state transitions to avoid marking runs completed on partial failure

## v0.2.0 — 2026-02-09

### Fixed
- Step output now reads from stdin instead of CLI arguments, fixing shell escaping issues that caused complex output (STORIES_JSON, multi-line text) to be silently dropped
- This was the root cause of loop steps (like security audit fixes) completing with zero work done

### Added
- `antfarm version` — show installed version
- `antfarm update` — pull latest, rebuild, and reinstall workflows in one command
- CHANGELOG.md

## v0.1.0 — Initial release

- Multi-agent workflow orchestration for OpenClaw
- Three bundled workflows: feature-dev, bug-fix, security-audit
- Story-based execution with per-story verification
- SQLite-backed run/step/story tracking
- Dashboard at localhost:3333
- CLI with workflow management, step operations, and log viewing
