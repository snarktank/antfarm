# Syncing Upstream OpenClaw/Antfarm Updates

This guide covers how to merge upstream changes from `main` into your working
feature branch without breaking the running system.

## Background

Antfarm has **two copies** of its code:

| Path | Purpose |
|------|---------|
| `~/.openclaw/workspace/antfarm/` | **Source** — git repo, where you edit code |
| `~/.openclaw/antfarm/` | **Installed** — runtime copy, what crons actually execute |

Upstream updates (`openclaw update`, PRs merged to main) land on the `main`
branch in source. Feature branches diverge from main and need periodic syncing.

### Why this is tricky

1. **Model names are embedded everywhere.** Workflow YAML files, cron payloads,
   and test assertions all contain the literal model name (e.g.
   `anthropic/qwen3-coder:30b`). Upstream may ship a different model than
   what you're running locally.

2. **Cron payloads bake in the model at creation time.** If a merge changes
   workflow.yml but you don't update the installed copy and re-create crons,
   the running crons still use the old model. A model mismatch causes
   `"model not allowed"` errors.

3. **`model: default` does NOT work in crons.** The gateway passes `"default"`
   literally to the provider instead of resolving it. Always use the
   fully-qualified model name.

4. **The installed path is what matters at runtime.** Editing source without
   copying to installed has zero effect on running workflows.

---

## Quick Path: Use the Script

```bash
cd ~/.openclaw/workspace/antfarm
./scripts/sync-main.sh
```

The script handles everything automatically:
- Shows what's new on main
- Merges (stops on conflicts for manual resolution)
- Patches model names in all workflow.yml and test files to match your running config
- Builds and runs tests
- Copies updated workflows to the installed path
- Commits the patches

Options:
- `--dry-run` — preview only, don't merge
- `--yes` — skip confirmation prompt

---

## Manual Path: Step by Step

Use this if the script fails, you have merge conflicts, or you want more control.

### 1. Check what's new

```bash
cd ~/.openclaw/workspace/antfarm
git fetch origin  # if tracking a remote
git log --oneline main..HEAD   # what you have that main doesn't
git log --oneline HEAD..main   # what main has that you don't
```

### 2. Ensure clean working tree

```bash
git status
# If dirty: git stash or git commit
```

### 3. Merge main

```bash
git merge main
```

If there are conflicts:
- Resolve them in your editor
- `git add <resolved files>`
- `git merge --continue`

### 4. Patch model names

Check what model the running system uses:
```bash
grep -m1 'model:' ~/.openclaw/antfarm/workflows/ops/workflow.yml
# e.g. "model: anthropic/qwen3-coder:30b"
```

If the merge brought in a different model, update all workflow files:
```bash
# Replace old model with running model in all workflows
sed -i '' 's|model: anthropic/OLD_MODEL|model: anthropic/RUNNING_MODEL|g' workflows/*/workflow.yml

# Also fix test assertions
sed -i '' 's|"anthropic/OLD_MODEL"|"anthropic/RUNNING_MODEL"|g' tests/*-polling.test.ts
```

### 5. Build and test

```bash
npx tsc                              # compile
node --test tests/**/*.test.ts       # run all tests (expect 207+ pass, 0 fail)
```

### 6. Copy to installed path

```bash
cp workflows/ops/workflow.yml ~/.openclaw/antfarm/workflows/ops/workflow.yml
cp workflows/feature-dev/workflow.yml ~/.openclaw/antfarm/workflows/feature-dev/workflow.yml
cp workflows/bug-fix/workflow.yml ~/.openclaw/antfarm/workflows/bug-fix/workflow.yml
cp workflows/security-audit/workflow.yml ~/.openclaw/antfarm/workflows/security-audit/workflow.yml
```

### 7. Re-create crons (if workflows are running)

Cron payloads embed the model name. If the model changed in workflow.yml,
you must delete and re-create crons:

```bash
# For each active workflow:
node dist/cli/cli.js workflow ensure-crons feature-dev
node dist/cli/cli.js workflow ensure-crons ops
node dist/cli/cli.js workflow ensure-crons security-audit

# Medic cron:
node dist/cli/cli.js medic install
```

### 8. Commit

```bash
git add -A
git commit -m "merge main: <summary of what was merged>

Model patched to anthropic/qwen3-coder:30b, tests updated."
```

---

## After a Gateway Restart

Gateway restarts wipe all run-scoped crons (not the persistent ones like
medic, db-backup, stall-watcher). After restarting:

```bash
openclaw gateway stop
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/ai.openclaw.gateway.plist

# Wait 5 seconds, then re-create crons for active workflows:
node ~/.openclaw/workspace/antfarm/dist/cli/cli.js workflow ensure-crons feature-dev
node ~/.openclaw/workspace/antfarm/dist/cli/cli.js workflow ensure-crons ops
node ~/.openclaw/workspace/antfarm/dist/cli/cli.js medic install
```

## After a Model Change

If you switch to a different Ollama model:

1. Update `openclaw.json` — change model for all 23 ant agents + medic
2. Update all `workflows/*/workflow.yml` — change every `model:` line
3. Copy workflows to installed path (step 6 above)
4. Re-create all crons (step 7 above)
5. Update test assertions to match new model name
6. Rebuild and run tests

The `sync-main.sh` script automates steps 2-5 by reading the model from
the installed config. Step 1 (openclaw.json) must be done manually via:

```bash
openclaw config set agents.list.N.model "anthropic/NEW_MODEL"
# Repeat for each agent (0-23)
```

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `"model not allowed"` on crons | Cron payload has old model | Re-run `ensure-crons` |
| Medic not firing | Ollama serialized (NUM_PARALLEL=1) | Set `OLLAMA_NUM_PARALLEL=4` in launchd plist |
| Steps stuck in "running" | Agent session died mid-work | `node dist/cli/cli.js step reset <id> "stalled"` (uses abandon budget, not retry budget). Use `step fail` only for real agent errors |
| Gateway timeout on CLI commands | Too many concurrent sessions | Read `jobs.json` directly instead of `openclaw cron list` |
| `{{request}}` empty in ops workflow | Template uses wrong variable | Must be `{{task}}` not `{{request}}` |
| Tests assert wrong model | Merge brought old model assertions | `sed` the test files (step 4 above) |

## Key Files

| File | What it controls |
|------|-----------------|
| `~/.openclaw/openclaw.json` | Agent configs, model assignments, auth cooldowns |
| `~/.openclaw/cron/jobs.json` | Cron state (never edit directly, use gateway API) |
| `workflows/*/workflow.yml` | Workflow definitions, model names, step templates |
| `~/Library/LaunchAgents/local.ollama.serve.plist` | Ollama env vars (NUM_PARALLEL, CONTEXT_LENGTH) |
| `~/Library/LaunchAgents/ai.openclaw.gateway.plist` | Gateway launchd config (needs OPENAI_API_KEY) |
