# Antfarm Agents

Antfarm provisions multi-agent workflows for OpenClaw. It installs workflow agent workspaces, wires agents into the OpenClaw config, and keeps a run record per task.

## Installing Antfarm

**Prerequisites:** Node.js >= 22, OpenClaw v2026.2.9+, `gh` CLI (for PR steps).

> **Do NOT run `npm install antfarm`.** There is an unrelated package on npm with that name. Antfarm is installed from GitHub only.

### Steps

1. **Clone the repo** into the OpenClaw workspace:
   ```bash
   git clone https://github.com/snarktank/antfarm.git ~/.openclaw/workspace/antfarm
   ```

2. **Build:**
   ```bash
   cd ~/.openclaw/workspace/antfarm
   npm install
   npm run build
   ```

3. **Link the CLI** (makes `antfarm` available globally):
   ```bash
   npm link
   ```

4. **Install workflows** (provisions agents, cron jobs, and DB):
   ```bash
   antfarm install
   ```

5. **Verify:** Run `antfarm workflow list` — you should see the available workflows.

If `antfarm` fails with a `node:sqlite` error, your `node` binary may be Bun's wrapper instead of real Node.js 22+. Check with `node -e "require('node:sqlite')"`. See [#54](https://github.com/snarktank/antfarm/issues/54) for workarounds.

## Why Antfarm

- **Repeatable workflow execution**: Start the same set of agents with a consistent prompt and workspace every time.
- **Structured collaboration**: Each workflow defines roles (lead, developer, verifier, reviewer) and how they hand off work.
- **Traceable runs**: Runs are stored by task title so you can check status without hunting through logs.
- **Clean lifecycle**: Install, update, or uninstall workflows without manual cleanup.

## What It Changes in OpenClaw

- Adds workflow agents to `openclaw.json` (your main agent stays default).
- Creates workflow workspaces under `~/.openclaw/workspaces/workflows`.
- Stores workflow definitions and run state under `~/.openclaw/antfarm`.
- Inserts an Antfarm guidance block into the main agent's `AGENTS.md` and `TOOLS.md`.

## Uninstalling

- `antfarm workflow uninstall <workflow-id>` removes a single workflow's agents, workspaces, and run records.
- `antfarm uninstall` removes everything: all workflows, agents, cron jobs, and DB state.

If something fails, report the exact error and ask the user to resolve it before continuing.

## Local Development Setup (This Machine)

This repo is the **development copy** of Antfarm, separate from the running installation.

### Two-Repo Layout

| Purpose | Path | Notes |
|---------|------|-------|
| **Running Antfarm** (CLI + cron) | `C:\Users\Lecoo\.openclaw\workspace\antfarm\` | Do NOT edit. This is the live installation. |
| **Development Antfarm** (this repo) | `C:\Users\Lecoo\Projects\antfarm-dev\` | Edit, build, and test here. |

The running installation orchestrates workflows. This repo is where agents make code changes.
Agents should NEVER run `npm link` or `npm run build` in the running installation path.

### Environment

- **OS:** Windows 11 (files have `\r\n` line endings)
- **Node.js:** v24.13.1 (>= 22 required, `node:sqlite` works)
- **OpenClaw:** v2026.2.12 at `C:\Users\Lecoo\.openclaw\openclaw.json`
- **GitHub CLI:** gh 2.83.0, authenticated as `doanbactam`
- **Package manager:** npm (NOT Bun — Bun's node wrapper breaks `node:sqlite`)

### Build & Test

```bash
cd C:\Users\Lecoo\Projects\antfarm-dev
npm run build                # TypeScript → dist/
node --test "tests/**/*.test.*" "dist/**/*.test.*" "landing/__tests__/*.test.*" "scripts/**/*.test.*"
```

**Important:** Do NOT use `node --test` without glob patterns. The `src/**/*.test.ts` files
import sibling `.js` modules (NodeNext resolution) which only exist in `dist/` after build.
Exclude them from test discovery — they are compiled into `dist/` and run from there.

### Windows-Specific Gotchas

1. **Line endings:** Files have `\r\n`. When matching YAML/text content with regex,
   normalize first: `.replace(/\r/g, "")` before matching with `\n`.

2. **Git commit messages in tests:** Use double quotes `"msg"`, not single quotes `'msg'`.
   Single-quoted commit messages (`git commit -m 'add html'`) fail on Windows cmd.exe.

3. **tsconfig.json:** `src/**/*.test.ts` are excluded from compilation via the `exclude` field.
   Test files in `src/` use relative `.js` imports (NodeNext convention) — these resolve
   to compiled `.js` files in `dist/` at runtime, not source `.ts` files.

4. **SQLite warning:** `node:sqlite` is experimental. The warning
   `ExperimentalWarning: SQLite is an experimental feature` is expected and harmless.

### Architecture Quick Reference

```
src/
├── cli/          # CLI entry point + commands (antfarm workflow run, status, etc.)
├── installer/    # Provisions agents, cron jobs, workspaces, step-ops
├── lib/          # Logger (sync file writes), shared utilities
├── medic/        # Health monitoring cron for stuck steps
├── server/       # Dashboard web server (port 3333)
└── db.ts         # SQLite schema, migrations, WAL mode, DB connection pooling

workflows/
├── feature-dev/  # 7 agents: plan → setup → implement → verify → test → PR → review
├── bug-fix/      # 6 agents: triage → investigate → setup → fix → verify → PR
└── security-audit/ # 7 agents: scan → prioritize → setup → fix → verify → test → PR

tests/            # node:test runner, SQLite :memory: for isolation
agents/shared/    # Reusable agent definitions (setup, verifier, pr)
```

### Key Design Decisions

- **SQLite via `node:sqlite` (built-in):** No external DB dependencies. WAL mode for concurrency.
  DB connection has 5-second TTL to avoid stale handles.
- **Cron polling:** Each agent polls for work independently (15-min stagger).
  Steps communicate via `KEY: value` pairs in output → `{{key}}` template variables.
- **Fresh context per agent:** Ralph loop pattern. Each session is clean — memory persists
  through git history and `progress-{run_id}.txt` files.
- **Stories:** Planner outputs `STORIES_JSON` → developer implements each in isolated session.
  Max 20 stories per run. Each story has independent retry tracking.

### Workflow for Contributing

1. Create a feature branch in this repo
2. Make changes to `src/` or `workflows/`
3. `npm run build` — must pass with zero errors
4. `node --test "tests/**/*.test.*" "dist/**/*.test.*" "landing/__tests__/*.test.*" "scripts/**/*.test.*"` — all tests must pass
5. Commit and push to fork
6. Create PR against `snarktank/antfarm`

### Using Antfarm to Develop Antfarm

To use the running Antfarm to work on this dev repo:

```bash
antfarm workflow run bug-fix "Bug description. Repo is at C:\Users\Lecoo\Projects\antfarm-dev"
antfarm workflow run feature-dev "Feature description. Repo is at C:\Users\Lecoo\Projects\antfarm-dev"
antfarm workflow status "query"
antfarm dashboard  # http://localhost:3333
```

The running Antfarm edits code in THIS repo on a feature branch.
It will NOT affect its own running installation.
