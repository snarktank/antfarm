#!/bin/bash
# launch-agent-team.sh — Launch native Claude Code orchestration (no antfarm polling)
# Usage: ./launch-agent-team.sh <repo-path> <task-description> [model]
#
# Creates a run in agent-teams.json, launches claude -p --agent orchestrator,
# and tracks progress via .antfarm-status.md

set -euo pipefail

REPO="${1:?Usage: $0 <repo-path> <task-description> [model]}"
TASK="${2:?Usage: $0 <repo-path> <task-description> [model]}"
MODEL="${3:-claude-opus-4-6}"

# Resolve repo to absolute path
REPO="$(cd "$REPO" && pwd)"

# Generate run ID
RUN_ID=$(python3 -c "import uuid; print(str(uuid.uuid4())[:8])")

# Temp log file to capture --output-format json for real token counts
LOG_FILE="/tmp/antfarm-${RUN_ID}.json"

# Per-run status file (unique per task, not shared)
STATUS_FILE=".antfarm-status-${RUN_ID}.md"

# Get OAuth token
TOKEN=$(python3 -c "import json; d=json.load(open('$HOME/.openclaw/agents/main/agent/auth-profiles.json')); print(d['profiles']['anthropic:default']['token'])")

# Agent teams DB
DB_FILE="$HOME/.openclaw/antfarm/agent-teams.json"

# Create/update DB entry
python3 -c "
import json, os, datetime
db_file = '$DB_FILE'
runs = json.load(open(db_file)) if os.path.exists(db_file) else []
runs.append({
    'id': '$RUN_ID',
    'task': '''$TASK''',
    'repo': '$REPO',
    'model': '$MODEL',
    'status': 'submitted',
    'pipeline': [],
    'currentAgent': None,
    'createdAt': datetime.datetime.now().isoformat(),
    'updatedAt': datetime.datetime.now().isoformat(),
    'output': None,
    'pid': None,
    'statusFile': '$STATUS_FILE'
})
json.dump(runs, open(db_file, 'w'), indent=2)
print('Run $RUN_ID created')
"

# Initialize per-run status file
cat > "$REPO/$STATUS_FILE" << 'STATUSEOF'
## Stage: submitted
## Current Agent: orchestrator
## Pipeline: 
## Branch: 

## Plan:

## Token Usage:

## Progress
- [ ] Analyze task
- [ ] Create plan (architect)
- [ ] Execute (specialists)
- [ ] Review (code-reviewer)
- [ ] Ship (ship-master)
- [ ] Compound (compounder)

## Last Update
Run created, waiting for orchestrator launch
STATUSEOF

# Build the prompt with task + run metadata
PROMPT="You are orchestrating run $RUN_ID.

REPO: $REPO
STATUS FILE: $STATUS_FILE (use THIS file for all status updates, NOT .antfarm-status.md)
TASK:
$TASK

IMPORTANT — Status File:
Write ALL status updates to $STATUS_FILE — NOT .antfarm-status.md. Multiple runs may be active in the same repo simultaneously. Each run has its own status file.

IMPORTANT — Token Tracking:
After EACH Task() sub-agent call completes, update $STATUS_FILE with estimated token usage.
NOTE: Task() does NOT return token data. Write ~ prefixed estimates based on task complexity.
Add to the Token Usage section like:
## Token Usage:
- architect: ~8K in / ~3K out
- ios-engineer: ~40K in / ~12K out

Update $STATUS_FILE BEFORE and AFTER every specialist. The dashboard reads this file live.
The outer process captures real token totals separately — your estimates help show per-agent breakdown.

Begin by reading the task, analyzing the project, and following your orchestration protocol."

echo "Launching orchestrator for run $RUN_ID in $REPO..."
echo "Model: $MODEL"
echo ""

# Launch claude -p --agent orchestrator headless in the repo directory
cd "$REPO"
CLAUDE_CODE_OAUTH_TOKEN="$TOKEN" claude -p --agent orchestrator --model "$MODEL" --dangerously-skip-permissions --output-format json "$PROMPT" 2>&1 | tee "$LOG_FILE" &
PID=$!

# Update DB with PID
python3 -c "
import json
db_file = '$DB_FILE'
runs = json.load(open(db_file))
for r in runs:
    if r['id'] == '$RUN_ID':
        r['pid'] = $PID
        r['status'] = 'analyzing'
        break
json.dump(runs, open(db_file, 'w'), indent=2)
"

# Background sync: reads per-run status file → updates agent-teams.json every 5s
(
  while kill -0 $PID 2>/dev/null; do
    sleep 5
    python3 -c "
import json, os, re, datetime
sf = os.path.join('$REPO', '$STATUS_FILE')
db_file = '$DB_FILE'
run_id = '$RUN_ID'
if not os.path.exists(sf): exit()
content = open(sf).read()
# Parse headers
stage = ''; agent = ''; pipeline = []; branch = ''; pr = ''; tokens = ''
for line in content.split('\n'):
    if line.startswith('## Stage:'): stage = line.split(':', 1)[1].strip()
    elif line.startswith('## Current Agent:'): agent = line.split(':', 1)[1].strip()
    elif line.startswith('## Pipeline:'): pipeline = [x.strip() for x in line.split(':', 1)[1].split('→') if x.strip()]
    elif line.startswith('## Branch:'): branch = line.split(':', 1)[1].strip()
    elif line.startswith('## PR:'): pr = line.split(':', 1)[1].strip()
# Extract token usage section
tu = re.search(r'## Token Usage:\n(.*?)(?=\n## |\Z)', content, re.DOTALL)
tokens = tu.group(1).strip() if tu else ''
try:
    runs = json.load(open(db_file))
    for r in runs:
        if r['id'] == run_id:
            if stage: r['status'] = stage
            if agent: r['currentAgent'] = agent
            if pipeline: r['pipeline'] = pipeline
            if branch: r['branch'] = branch
            if pr and pr != '—' and pr != 'pending': r['pr'] = pr
            if tokens: r['tokenUsage'] = tokens
            r['updatedAt'] = datetime.datetime.now().isoformat()
            break
    json.dump(runs, open(db_file, 'w'), indent=2)
except: pass
" 2>/dev/null
  done
) &
SYNC_PID=$!

echo ""
echo "✅ Run $RUN_ID launched (PID: $PID)"
echo "📊 Dashboard: http://localhost:3333 → Agent Teams tab"
echo "📋 Status file: $REPO/$STATUS_FILE"
echo "🔄 Dashboard sync: PID $SYNC_PID (auto-stops when orchestrator finishes)"
echo ""
echo "Orchestrator is running in background. Monitor via dashboard or:"
echo "  cat $REPO/$STATUS_FILE"
echo "  kill $PID  # to stop"

# Wait for completion (capture exit code without triggering set -e)
EXIT_CODE=0
wait $PID 2>/dev/null || EXIT_CODE=$?

# Parse real token counts from --output-format json output
python3 -c "
import json, os, datetime

log_file = '$LOG_FILE'
db_file = '$DB_FILE'
run_id = '$RUN_ID'

token_real = None

try:
    if os.path.exists(log_file) and os.path.getsize(log_file) > 0:
        with open(log_file) as f:
            content = f.read().strip()

        # Output is a single JSON object
        obj = json.loads(content)
        usage = obj.get('usage') or {}
        model_usage = obj.get('modelUsage') or {}

        input_tokens = usage.get('input_tokens', 0)
        output_tokens = usage.get('output_tokens', 0)
        cache_read = usage.get('cache_read_input_tokens', 0)
        cache_creation = usage.get('cache_creation_input_tokens', 0)

        token_real = {
            'totalCostUSD': obj.get('total_cost_usd', 0),
            'inputTokens': input_tokens + cache_creation + cache_read,
            'outputTokens': output_tokens,
            'rawInputTokens': input_tokens,
            'cacheReadTokens': cache_read,
            'cacheCreationTokens': cache_creation,
            'numTurns': obj.get('num_turns', 0),
            'durationMs': obj.get('duration_ms', 0),
            'durationApiMs': obj.get('duration_api_ms', 0),
            'sessionId': obj.get('session_id', ''),
            'modelUsage': model_usage,
            'isReal': True,
            'capturedAt': datetime.datetime.now().isoformat()
        }

        total_input = input_tokens + cache_creation + cache_read
        cost = obj.get('total_cost_usd', 0)
        models = ', '.join(model_usage.keys()) if model_usage else 'unknown'
        print(f'Token capture: {total_input:,} in ({cache_read:,} cached) / {output_tokens:,} out | \${cost:.4f} | {models}')
except Exception as e:
    print(f'Token parse warning: {e}')

if token_real:
    try:
        runs = json.load(open(db_file))
        for r in runs:
            if r['id'] == run_id:
                r['tokenReal'] = token_real
                break
        json.dump(runs, open(db_file, 'w'), indent=2)
    except Exception as e:
        print(f'Token write warning: {e}')
else:
    print('Token capture: no usage data found in output')
"

rm -f "$LOG_FILE"

# Update final status
python3 -c "
import json, datetime
db_file = '$DB_FILE'
runs = json.load(open(db_file))
for r in runs:
    if r['id'] == '$RUN_ID':
        r['updatedAt'] = datetime.datetime.now().isoformat()
        if $EXIT_CODE == 0:
            # Check status file for final state
            import os
            sf = os.path.join('$REPO', '$STATUS_FILE')
            if os.path.exists(sf):
                content = open(sf).read()
                if 'Task Complete' in content: r['status'] = 'complete'
                elif 'Task Failed' in content: r['status'] = 'failed'
                else: r['status'] = 'complete'
            else:
                r['status'] = 'complete'
        else:
            r['status'] = 'failed'
        break
json.dump(runs, open(db_file, 'w'), indent=2)
"

echo "Run $RUN_ID finished (exit code: $EXIT_CODE)"
