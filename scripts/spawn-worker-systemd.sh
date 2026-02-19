#!/bin/bash
# Antfarm worker spawner with systemd-run resource isolation
# Usage: spawn-worker-systemd.sh <work-prompt-file> <model> <log-file> <step-id> <agent-id>
#
# Spawns a Claude worker via systemd-run (with cgroup limits) when available,
# falls back to nohup when systemd is unavailable.
# Outputs the worker PID on stdout.

set -euo pipefail

PROMPT_FILE="${1:?Usage: spawn-worker-systemd.sh <work-prompt-file> <model> <log-file> <step-id> <agent-id>}"
WORK_MODEL="${2:?Missing model argument}"
LOG_FILE="${3:?Missing log-file argument}"
STEP_ID="${4:?Missing step-id argument}"
AGENT_ID="${5:?Missing agent-id argument}"

CLAUDE_CLI="${CLAUDE_CLI:-${HOME}/.local/bin/claude}"
SLICE_NAME="antfarm-worker.slice"

# Read the work prompt
if [ ! -f "$PROMPT_FILE" ]; then
  echo "ERROR: prompt file not found: $PROMPT_FILE" >&2
  exit 1
fi

WORK_PROMPT="$(cat "$PROMPT_FILE")"

# Ensure CLAUDECODE is unset to allow nested Claude sessions
unset CLAUDECODE

# Try systemd-run first, fall back to nohup
if systemctl --user --version >/dev/null 2>&1; then
  UNIT_NAME="antfarm-worker-${STEP_ID}"

  systemd-run --user --scope \
    --unit="$UNIT_NAME" \
    --slice="$SLICE_NAME" \
    -p Nice=10 \
    -- \
    "$CLAUDE_CLI" -p \
      --model "$WORK_MODEL" \
      --output-format json \
      --dangerously-skip-permissions \
      "$WORK_PROMPT" \
    > "$LOG_FILE" 2>&1 &

  WORKER_PID=$!
  echo "$WORKER_PID"
  echo "SPAWN_METHOD=systemd" >&2
  echo "UNIT_NAME=$UNIT_NAME" >&2
else
  nohup "$CLAUDE_CLI" -p \
    --model "$WORK_MODEL" \
    --output-format json \
    --dangerously-skip-permissions \
    "$WORK_PROMPT" \
    > "$LOG_FILE" 2>&1 &

  WORKER_PID=$!
  echo "$WORKER_PID"
  echo "SPAWN_METHOD=nohup" >&2
fi
