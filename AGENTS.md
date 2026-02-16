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

## Codebase Structure

### Database (src/db.ts)
- Uses **node:sqlite DatabaseSync** (synchronous, not async)
- Connection pooling: reuses DB connection for 5 seconds
- All schema created in `migrate()` function on first `getDb()` call
- Foreign keys enabled globally with `PRAGMA foreign_keys=ON`
- Database location: `~/.openclaw/antfarm/antfarm.db`

### Schema Patterns
- All tables have `created_at` and `updated_at` (TEXT, ISO 8601) for audit trail
- All IDs are TEXT (stored as UUID strings)
- Foreign key constraints are enforced
- Indexes created alongside table definitions for query performance
- Migration uses `ALTER TABLE ADD COLUMN` with `IF NOT EXISTS` for backwards compatibility

### Testing
- **Framework:** node:test (built-in)
- **Run:** `node --test 'tests/**/*.test.ts'`
- **Build:** `npm run build` (TypeScript compilation + version injection)
- Tests use temporary databases to avoid side effects
- Foreign key validation in tests ensures data integrity

### Key Files
- `src/db.ts` - Database initialization and all schema migrations
- `src/index.ts` - Package exports
- `tests/` - Test files (one per feature area)
- `dist/` - Compiled JavaScript (generated, do not edit)
