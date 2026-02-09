# Changelog

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
