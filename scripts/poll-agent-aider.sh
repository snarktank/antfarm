#!/bin/bash
# Antfarm agent polling script — aider variant for OpenRouter models
# Usage: poll-agent-aider.sh <workflow-id> <agent-id> [openrouter-model] [project-dir]
#
# Same as poll-agent.sh but uses aider instead of claude CLI.
# Supports any OpenRouter model that aider can use.
# Designed for spec-dev and research workflows with non-Claude models.

set -euo pipefail

WORKFLOW_ID="${1:?Usage: poll-agent-aider.sh <workflow-id> <agent-id> [openrouter-model] [project-dir]}"
AGENT_ID="${2:?Usage: poll-agent-aider.sh <workflow-id> <agent-id> [openrouter-model] [project-dir]}"
OPENROUTER_MODEL="${3:-openrouter/deepseek/deepseek-v3.2}"
PROJECT_DIR="${4:-}"
FULL_AGENT_ID="${WORKFLOW_ID}-${AGENT_ID}"

ANTFARM_CLI="node /home/motobot/.openclaw/workspace/antfarm/dist/cli/cli.js"
AIDER_CLI="/home/motobot/.local/bin/aider"
LOG_DIR="/tmp/antfarm"
LOCK_FILE="/tmp/antfarm-poll-${FULL_AGENT_ID}.lock"

# OpenRouter API key from openclaw config
export OPENROUTER_API_KEY="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"

mkdir -p "$LOG_DIR"

# Prevent concurrent polls for the same agent
if [ -f "$LOCK_FILE" ]; then
  LOCK_PID=$(cat "$LOCK_FILE" 2>/dev/null || echo "0")
  if kill -0 "$LOCK_PID" 2>/dev/null; then
    echo "[$(date -Iseconds)] ${FULL_AGENT_ID}: poll already running (PID $LOCK_PID), skipping" >> "$LOG_DIR/poll.log"
    exit 0
  fi
  rm -f "$LOCK_FILE"
fi
echo $$ > "$LOCK_FILE"
trap 'rm -f "$LOCK_FILE"' EXIT

# Step 1: Claim pending work
CLAIM_OUTPUT=$($ANTFARM_CLI step claim "$FULL_AGENT_ID" 2>/dev/null)

if [ "$CLAIM_OUTPUT" = "NO_WORK" ]; then
  echo "[$(date -Iseconds)] ${FULL_AGENT_ID}: no work" >> "$LOG_DIR/poll.log"
  exit 0
fi

# Step 2: Parse the claimed step JSON
STEP_ID=$(echo "$CLAIM_OUTPUT" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['stepId'])" 2>/dev/null)
RUN_ID=$(echo "$CLAIM_OUTPUT" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['runId'])" 2>/dev/null)
TASK_INPUT=$(echo "$CLAIM_OUTPUT" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('input',''))" 2>/dev/null)

if [ -z "$STEP_ID" ]; then
  echo "[$(date -Iseconds)] ${FULL_AGENT_ID}: ERROR - failed to parse step claim JSON" >> "$LOG_DIR/poll.log"
  echo "$CLAIM_OUTPUT" >> "$LOG_DIR/poll.log"
  exit 1
fi

echo "[$(date -Iseconds)] ${FULL_AGENT_ID}: claimed step $STEP_ID (model=$OPENROUTER_MODEL)" >> "$LOG_DIR/poll.log"

# Step 3: Check concurrency (use a generic slot name for openrouter)
CONCURRENCY_MODEL="openrouter"
CONCURRENCY_RESULT=$($ANTFARM_CLI concurrency acquire "$CONCURRENCY_MODEL" "$FULL_AGENT_ID" "$STEP_ID" 2>/dev/null) || true

if [ "$CONCURRENCY_RESULT" = "QUEUE_FULL" ]; then
  echo "[$(date -Iseconds)] ${FULL_AGENT_ID}: QUEUE_FULL for $CONCURRENCY_MODEL, will retry step $STEP_ID" >> "$LOG_DIR/poll.log"
  $ANTFARM_CLI step fail "$STEP_ID" "QUEUE_FULL: concurrency limit exceeded, will retry" 2>/dev/null || true
  exit 2
fi

SLOT_ID=""
if echo "$CONCURRENCY_RESULT" | grep -q "^SLOT_ACQUIRED:"; then
  SLOT_ID=$(echo "$CONCURRENCY_RESULT" | sed 's/SLOT_ACQUIRED://')
  echo "[$(date -Iseconds)] ${FULL_AGENT_ID}: slot $SLOT_ID acquired" >> "$LOG_DIR/poll.log"
fi

# Step 4: Prepare work directory and prompt
WORK_DIR="$LOG_DIR/work-${STEP_ID}"
mkdir -p "$WORK_DIR"
echo "$CLAIM_OUTPUT" > "$WORK_DIR/claimed-step.json"
echo "$SLOT_ID" > "$WORK_DIR/concurrency-slot.id"

# Build aider message from task input
cat > "$WORK_DIR/aider-message.txt" <<AIDER_MSG_EOF
You are an Antfarm workflow agent. Execute this task carefully.

TASK:
${TASK_INPUT}

RULES:
1. Do the work described above — create/edit files as needed.
2. Be thorough but concise.
3. If the task asks for analysis or research, write your findings to a markdown file.
4. If the task asks for code changes, implement them directly.
5. Format any structured output with KEY: value lines.
AIDER_MSG_EOF

# Determine working directory for aider
AIDER_CWD="${PROJECT_DIR:-$(pwd)}"
if [ ! -d "$AIDER_CWD/.git" ]; then
  echo "[$(date -Iseconds)] ${FULL_AGENT_ID}: WARNING - $AIDER_CWD is not a git repo, aider needs git" >> "$LOG_DIR/poll.log"
  # Initialize if needed
  cd "$AIDER_CWD" && git init && git add -A && git commit -m "aider: init" --allow-empty 2>/dev/null || true
fi

# Step 5: Spawn aider worker in background
# aider runs the task, we capture exit code to determine success/fail
nohup bash -c "
  cd '$AIDER_CWD'
  OPENROUTER_API_KEY='$OPENROUTER_API_KEY' '$AIDER_CLI' \
    --model '$OPENROUTER_MODEL' \
    --message-file '$WORK_DIR/aider-message.txt' \
    --yes-always \
    --no-auto-commits \
    --no-suggest-shell-commands \
    --no-show-release-notes \
    --no-check-update \
    > '$WORK_DIR/aider-output.log' 2>&1
  AIDER_EXIT=\$?

  # Step 6: Report result to Antfarm
  if [ \$AIDER_EXIT -eq 0 ]; then
    # Extract summary from aider output (last 50 lines)
    SUMMARY=\$(tail -50 '$WORK_DIR/aider-output.log' | head -40)
    cat > /tmp/antfarm-aider-output-${STEP_ID}.txt <<STEP_OUT_EOF
STATUS: done
MODEL: $OPENROUTER_MODEL
CHANGES: aider completed the task
OUTPUT_SUMMARY:
\$SUMMARY
STEP_OUT_EOF
    cat /tmp/antfarm-aider-output-${STEP_ID}.txt | $ANTFARM_CLI step complete '$STEP_ID' 2>/dev/null || true
    rm -f /tmp/antfarm-aider-output-${STEP_ID}.txt
    echo '['\$(date -Iseconds)'] ${FULL_AGENT_ID}: step $STEP_ID COMPLETED (aider exit=0)' >> '$LOG_DIR/poll.log'
  else
    ERROR_MSG=\$(tail -10 '$WORK_DIR/aider-output.log' | tr '\n' ' ')
    $ANTFARM_CLI step fail '$STEP_ID' \"aider exit code \$AIDER_EXIT: \$ERROR_MSG\" 2>/dev/null || true
    echo '['\$(date -Iseconds)'] ${FULL_AGENT_ID}: step $STEP_ID FAILED (aider exit=\$AIDER_EXIT)' >> '$LOG_DIR/poll.log'
  fi
" > "$WORK_DIR/worker.log" 2>&1 &

WORKER_PID=$!
echo "$WORKER_PID" > "$WORK_DIR/worker.pid"
echo "[$(date -Iseconds)] ${FULL_AGENT_ID}: aider worker spawned PID=$WORKER_PID for step $STEP_ID" >> "$LOG_DIR/poll.log"

# Step 7: Start heartbeat
if [ -n "$RUN_ID" ]; then
  nohup $ANTFARM_CLI heartbeat start "$STEP_ID" "$RUN_ID" > "$WORK_DIR/heartbeat.log" 2>&1 &
  HEARTBEAT_PID=$!
  echo "$HEARTBEAT_PID" > "$WORK_DIR/heartbeat.pid"
fi

# Step 8: Cleanup monitor (release slot + stop heartbeat when worker exits)
(
  while kill -0 "$WORKER_PID" 2>/dev/null; do
    sleep 5
  done
  if [ -n "$SLOT_ID" ]; then
    $ANTFARM_CLI concurrency release "$STEP_ID" 2>/dev/null || true
    echo "[$(date -Iseconds)] ${FULL_AGENT_ID}: slot released for step $STEP_ID" >> "$LOG_DIR/poll.log"
  fi
  if [ -n "${HEARTBEAT_PID:-}" ] && kill -0 "$HEARTBEAT_PID" 2>/dev/null; then
    kill "$HEARTBEAT_PID" 2>/dev/null || true
  fi
) &
disown
