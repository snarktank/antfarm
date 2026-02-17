#!/usr/bin/env bash
#
# sync-main.sh — Merge upstream main into the current working branch
#
# After an `openclaw update` or upstream changes land on main, run this
# to bring those changes into whichever feature branch is checked out.
#
# What it does:
#   1. Verifies clean working tree
#   2. Shows what's new on main since last merge
#   3. Merges main (stops on conflict for manual resolution)
#   4. Patches workflow.yml model names to match the running config
#   5. Fixes test assertions to match current model
#   6. Builds and runs tests
#   7. Copies updated workflows to the installed path
#
# Usage:
#   ./scripts/sync-main.sh              # interactive — shows preview, asks to proceed
#   ./scripts/sync-main.sh --yes        # non-interactive — auto-proceeds
#   ./scripts/sync-main.sh --dry-run    # just show what would change
#

set -euo pipefail
cd "$(dirname "$0")/.."

CURRENT_BRANCH=$(git branch --show-current)
AUTO_YES=false
DRY_RUN=false

for arg in "$@"; do
  case "$arg" in
    --yes) AUTO_YES=true ;;
    --dry-run) DRY_RUN=true ;;
  esac
done

# ── Helpers ──────────────────────────────────────────────────────────

die()  { echo "ERROR: $*" >&2; exit 1; }
info() { echo "→ $*"; }
warn() { echo "⚠ $*" >&2; }

get_running_model() {
  # Read the model from the installed ops workflow (authoritative runtime config)
  local installed_yml="$HOME/.openclaw/antfarm/workflows/ops/workflow.yml"
  if [[ -f "$installed_yml" ]]; then
    grep -m1 'model:' "$installed_yml" | awk '{print $2}'
  else
    # Fallback: read from openclaw.json agent config
    python3 -c "
import json
c = json.load(open('$HOME/.openclaw/openclaw.json'))
agents = c.get('agents',{}).get('list',[])
for a in agents:
    if 'planner' in a.get('id',''):
        print(a.get('model',''))
        break
" 2>/dev/null
  fi
}

# ── Preflight ────────────────────────────────────────────────────────

if [[ "$CURRENT_BRANCH" == "main" ]]; then
  die "You're on main. Check out a feature branch first."
fi

if ! git diff --quiet || ! git diff --cached --quiet; then
  die "Working tree is dirty. Commit or stash changes first."
fi

# ── Preview ──────────────────────────────────────────────────────────

MERGE_BASE=$(git merge-base main "$CURRENT_BRANCH")
NEW_COMMITS=$(git log --oneline "$MERGE_BASE..main" 2>/dev/null)

if [[ -z "$NEW_COMMITS" ]]; then
  info "Already up to date with main. Nothing to merge."
  exit 0
fi

echo ""
echo "=== New commits on main since last merge ==="
echo "$NEW_COMMITS"
echo ""
echo "Files changed:"
git diff --stat "$MERGE_BASE..main"
echo ""

if $DRY_RUN; then
  info "Dry run — not merging."
  exit 0
fi

if ! $AUTO_YES; then
  read -rp "Merge these into $CURRENT_BRANCH? [y/N] " answer
  if [[ "$answer" != "y" && "$answer" != "Y" ]]; then
    echo "Aborted."
    exit 0
  fi
fi

# ── Merge ────────────────────────────────────────────────────────────

info "Merging main into $CURRENT_BRANCH..."
if ! git merge main --no-edit; then
  warn "Merge conflicts detected. Resolve them, then re-run this script with --yes to continue post-merge steps."
  exit 1
fi

# ── Patch models ─────────────────────────────────────────────────────

RUNNING_MODEL=$(get_running_model)
if [[ -z "$RUNNING_MODEL" ]]; then
  warn "Could not determine running model. Skipping model patching."
else
  info "Patching workflow models to match running config: $RUNNING_MODEL"

  # Patch all workflow.yml files
  for wf in workflows/*/workflow.yml; do
    if grep -q 'model:' "$wf"; then
      # Replace any anthropic/* model with the running one
      sed -i '' "s|model: anthropic/[^ ]*|model: $RUNNING_MODEL|g" "$wf"
    fi
  done

  # Patch test assertions
  for tf in tests/*-polling.test.ts; do
    if [[ -f "$tf" ]] && grep -q 'spec.polling.model' "$tf"; then
      sed -i '' "s|assert.equal(spec.polling.model, \"[^\"]*\")|assert.equal(spec.polling.model, \"$RUNNING_MODEL\")|g" "$tf"
    fi
  done
fi

# ── Build & Test ─────────────────────────────────────────────────────

info "Building..."
npx tsc || die "Build failed"

info "Running tests..."
TEST_OUTPUT=$(node --test tests/**/*.test.ts 2>&1)
PASS_COUNT=$(echo "$TEST_OUTPUT" | grep '^# pass' | awk '{print $3}' || true)
FAIL_COUNT=$(echo "$TEST_OUTPUT" | grep '^# fail' | awk '{print $3}' || true)

if [[ "$FAIL_COUNT" != "0" && -n "$FAIL_COUNT" ]]; then
  echo "$TEST_OUTPUT" | tail -30
  die "Tests failed ($FAIL_COUNT failures). Fix before committing."
fi

info "All tests pass ($PASS_COUNT)"

# ── Sync to installed path ───────────────────────────────────────────

info "Syncing workflows to installed path..."
for wf_dir in workflows/*/; do
  wf_name=$(basename "$wf_dir")
  installed="$HOME/.openclaw/antfarm/workflows/$wf_name"
  if [[ -d "$installed" ]]; then
    cp -R "$wf_dir"* "$installed/"
    info "  Updated $wf_name"
  fi
done

# ── Amend or commit patches ─────────────────────────────────────────

if ! git diff --quiet; then
  info "Committing model/test patches on top of merge..."
  git add -A
  git commit -m "chore: patch models to $RUNNING_MODEL after main merge

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
fi

# ── Summary ──────────────────────────────────────────────────────────

echo ""
echo "=== Sync complete ==="
echo "  Branch: $CURRENT_BRANCH"
echo "  Model:  $RUNNING_MODEL"
echo "  Tests:  $PASS_COUNT passing"
echo ""
echo "Next steps:"
echo "  - Review the merge: git log --oneline -5"
echo "  - If active workflow runs exist, re-run: antfarm workflow ensure-crons <name>"
echo "  - Push when ready: git push"
