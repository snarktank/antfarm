#!/bin/bash
# Antfarm agent polling script
# Usage: poll-agent.sh <workflow-id> <agent-id> [work-model]
#
# Polls for pending work, claims it, and spawns a claude worker in background.
# Designed to be called from system crontab every N minutes.
# Checks concurrency limits before spawning to prevent system overload.

set -euo pipefail

WORKFLOW_ID="${1:?Usage: poll-agent.sh <workflow-id> <agent-id> [work-model]}"
AGENT_ID="${2:?Usage: poll-agent.sh <workflow-id> <agent-id> [work-model]}"
WORK_MODEL="${3:-claude-opus-4-6}"
FULL_AGENT_ID="${WORKFLOW_ID}-${AGENT_ID}"

ANTFARM_CLI="node /home/motobot/.openclaw/workspace/antfarm/dist/cli/cli.js"
CLAUDE_CLI="/home/motobot/.local/bin/claude"
LOG_DIR="/tmp/antfarm"
LOCK_FILE="/tmp/antfarm-poll-${FULL_AGENT_ID}.lock"

mkdir -p "$LOG_DIR"

# Prevent concurrent polls for the same agent
if [ -f "$LOCK_FILE" ]; then
  LOCK_PID=$(cat "$LOCK_FILE" 2>/dev/null || echo "0")
  if kill -0 "$LOCK_PID" 2>/dev/null; then
    echo "[$(date -Iseconds)] ${FULL_AGENT_ID}: poll already running (PID $LOCK_PID), skipping" >> "$LOG_DIR/poll.log"
    exit 0
  fi
  # Stale lock
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
if [ -z "$STEP_ID" ]; then
  echo "[$(date -Iseconds)] ${FULL_AGENT_ID}: ERROR - failed to parse step claim JSON" >> "$LOG_DIR/poll.log"
  echo "$CLAIM_OUTPUT" >> "$LOG_DIR/poll.log"
  exit 1
fi

echo "[$(date -Iseconds)] ${FULL_AGENT_ID}: claimed step $STEP_ID, checking concurrency for $WORK_MODEL" >> "$LOG_DIR/poll.log"

# Step 3: Check concurrency limits before spawning worker
CONCURRENCY_RESULT=$($ANTFARM_CLI concurrency acquire "$WORK_MODEL" "$FULL_AGENT_ID" "$STEP_ID" 2>/dev/null) || true

if [ "$CONCURRENCY_RESULT" = "QUEUE_FULL" ]; then
  echo "[$(date -Iseconds)] ${FULL_AGENT_ID}: QUEUE_FULL for $WORK_MODEL, cannot spawn worker for step $STEP_ID" >> "$LOG_DIR/poll.log"
  # Fail the step so it can be retried on next poll cycle
  $ANTFARM_CLI step fail "$STEP_ID" "QUEUE_FULL: concurrency limit exceeded, will retry" 2>/dev/null || true
  exit 2
fi

# Extract slot ID from "SLOT_ACQUIRED:<id>" response
SLOT_ID=""
if echo "$CONCURRENCY_RESULT" | grep -q "^SLOT_ACQUIRED:"; then
  SLOT_ID=$(echo "$CONCURRENCY_RESULT" | sed 's/SLOT_ACQUIRED://')
  echo "[$(date -Iseconds)] ${FULL_AGENT_ID}: concurrency slot $SLOT_ID acquired for step $STEP_ID" >> "$LOG_DIR/poll.log"
else
  echo "[$(date -Iseconds)] ${FULL_AGENT_ID}: WARNING - unexpected concurrency response: $CONCURRENCY_RESULT, proceeding anyway" >> "$LOG_DIR/poll.log"
fi

# Step 4: Save claim JSON and build work prompt
WORK_DIR="$LOG_DIR/work-${STEP_ID}"
mkdir -p "$WORK_DIR"
echo "$CLAIM_OUTPUT" > "$WORK_DIR/claimed-step.json"
echo "$SLOT_ID" > "$WORK_DIR/concurrency-slot.id"

cat <<'WORK_PROMPT_EOF' > "$WORK_DIR/work-prompt.txt"
You are an Antfarm workflow agent. Execute the pending work below.

⚠️ CRITICAL: You MUST call "step complete" or "step fail" before ending your session. If you don't, the workflow will be stuck forever. This is non-negotiable.

The claimed step JSON is provided below. It contains: {"stepId": "...", "runId": "...", "input": "..."}
Save the stepId — you'll need it to report completion.
The "input" field contains your FULLY RESOLVED task instructions. Read it carefully and DO the work.

Do the work described in the input. Format your output with KEY: value lines as specified.

MANDATORY: Report completion (do this IMMEDIATELY after finishing the work):
```
cat <<'ANTFARM_EOF' > /tmp/antfarm-step-output.txt
STATUS: done
CHANGES: what you did
TESTS: what tests you ran
ANTFARM_EOF
cat /tmp/antfarm-step-output.txt | node /home/motobot/.openclaw/workspace/antfarm/dist/cli/cli.js step complete "<stepId>"
```

If the work FAILED:
```
node /home/motobot/.openclaw/workspace/antfarm/dist/cli/cli.js step fail "<stepId>" "description of what went wrong"
```

RULES:
1. NEVER end your session without calling step complete or step fail
2. Write output to a file first, then pipe via stdin (shell escaping breaks direct args)
3. If you're unsure whether to complete or fail, call step fail with an explanation

The workflow cannot advance until you report. Your session ending without reporting = broken pipeline.

CLAIMED STEP JSON:
WORK_PROMPT_EOF

cat "$WORK_DIR/claimed-step.json" >> "$WORK_DIR/work-prompt.txt"

# Step 5: Spawn worker in background (unset CLAUDECODE to allow nested sessions)
unset CLAUDECODE
nohup "$CLAUDE_CLI" -p \
  --model "$WORK_MODEL" \
  --output-format json \
  --dangerously-skip-permissions \
  "$(cat "$WORK_DIR/work-prompt.txt")" \
  > "$WORK_DIR/worker.log" 2>&1 &

WORKER_PID=$!
echo "$WORKER_PID" > "$WORK_DIR/worker.pid"
echo "[$(date -Iseconds)] ${FULL_AGENT_ID}: worker spawned PID=$WORKER_PID for step $STEP_ID (slot=$SLOT_ID)" >> "$LOG_DIR/poll.log"

# Step 6: Start heartbeat process to send typing/progress updates
if [ -n "$RUN_ID" ]; then
  nohup $ANTFARM_CLI heartbeat start "$STEP_ID" "$RUN_ID" > "$WORK_DIR/heartbeat.log" 2>&1 &
  HEARTBEAT_PID=$!
  echo "$HEARTBEAT_PID" > "$WORK_DIR/heartbeat.pid"
  echo "[$(date -Iseconds)] ${FULL_AGENT_ID}: heartbeat started PID=$HEARTBEAT_PID for step $STEP_ID" >> "$LOG_DIR/poll.log"
fi

# Step 7: Set up cleanup to release concurrency slot and stop heartbeat when worker exits
if [ -n "$SLOT_ID" ] || [ -n "$HEARTBEAT_PID" ]; then
  # Monitor worker in background and clean up on exit
  (
    while kill -0 "$WORKER_PID" 2>/dev/null; do
      sleep 5
    done
    # Release concurrency slot
    if [ -n "$SLOT_ID" ]; then
      $ANTFARM_CLI concurrency release "$STEP_ID" 2>/dev/null || true
      echo "[$(date -Iseconds)] ${FULL_AGENT_ID}: concurrency slot released for step $STEP_ID (worker PID=$WORKER_PID exited)" >> "$LOG_DIR/poll.log"
    fi
    # Stop heartbeat process
    if [ -n "$HEARTBEAT_PID" ] && kill -0 "$HEARTBEAT_PID" 2>/dev/null; then
      kill "$HEARTBEAT_PID" 2>/dev/null || true
      echo "[$(date -Iseconds)] ${FULL_AGENT_ID}: heartbeat stopped for step $STEP_ID (worker PID=$WORKER_PID exited)" >> "$LOG_DIR/poll.log"
    fi
  ) &
  disown
fi
