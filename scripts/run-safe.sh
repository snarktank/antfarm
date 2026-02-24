#!/usr/bin/env bash
set -euo pipefail

# Run an Antfarm workflow with a per-repository lock to avoid concurrent runs
# stepping on each other.
#
# Usage:
#   scripts/run-safe.sh <repo_path> <workflow_id> <task>
#
# Example:
#   scripts/run-safe.sh /home/me/projects/myapp feature-dev "Implement X"

if [ "$#" -lt 3 ]; then
  echo "Usage: $0 <repo_path> <workflow_id> <task>"
  exit 1
fi

REPO_PATH="$1"
WORKFLOW_ID="$2"
TASK="$3"

if [ ! -d "$REPO_PATH/.git" ]; then
  echo "Error: '$REPO_PATH' is not a git repository (.git missing)."
  exit 2
fi

SAFE_KEY=$(echo "$REPO_PATH" | sed 's#[^a-zA-Z0-9_.-]#_#g')
LOCK_FILE="/tmp/antfarm-${SAFE_KEY}.lock"

exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "Another Antfarm run appears to be active for: $REPO_PATH"
  echo "Lock file: $LOCK_FILE"
  exit 3
fi

cd "$REPO_PATH"
antfarm workflow run "$WORKFLOW_ID" "$TASK"
