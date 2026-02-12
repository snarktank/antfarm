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

## Frontend Asset Notes

- RTS dashboard source is in `src/server/rts.html`.
- RTS sprite assets are in `src/server/rts-sprites/`.
- `npm run build` copies `src/server/index.html`, `src/server/rts.html`, and `src/server/rts-sprites/*` into `dist/server/`.

## What It Changes in OpenClaw

- Adds workflow agents to `openclaw.json` (your main agent stays default).
- Creates workflow workspaces under `~/.openclaw/workspaces/workflows`.
- Stores workflow definitions and run state under `~/.openclaw/antfarm`.
- Inserts an Antfarm guidance block into the main agent's `AGENTS.md` and `TOOLS.md`.

## Uninstalling

- `antfarm workflow uninstall <workflow-id>` removes a single workflow's agents, workspaces, and run records.
- `antfarm uninstall` removes everything: all workflows, agents, cron jobs, and DB state.

If something fails, report the exact error and ask the user to resolve it before continuing.
