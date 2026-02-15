# Parallel Developer Agents — Cron Job Setup

This document describes how to create cron jobs for the two additional developer agents (`feature-dev-developer-2` and `feature-dev-developer-3`) that enable parallel step execution.

## Background

The existing developer cron job (ID: `44fd72d6-79a7-4051-b5a0-c126a8180b52`) polls every 5 minutes (300000ms) with an anchor offset of 120000ms (2 min). The new agents use staggered anchors to spread polling across the interval.

| Agent | Anchor Offset | Effective Poll Time |
|---|---|---|
| feature-dev-developer (existing) | 120000ms (2 min) | :02, :07, :12, … |
| feature-dev-developer-2 | 150000ms (2.5 min) | :02:30, :07:30, :12:30, … |
| feature-dev-developer-3 | 210000ms (3.5 min) | :03:30, :08:30, :13:30, … |

## Cron Job Creation Commands

Use the OpenClaw CLI `cron create` command (or add entries directly to `~/.openclaw/cron/jobs.json`).

### Developer 2

```bash
openclaw cron create \
  --agentId "feature-dev-developer-2" \
  --name "antfarm/feature-dev/developer-2" \
  --schedule '{"kind":"every","everyMs":300000,"anchorMs":150000}' \
  --sessionTarget "isolated" \
  --wakeMode "now" \
  --payload '{
    "kind": "agentTurn",
    "message": "Step 1 — Quick check for pending work (lightweight, no side effects):\n```\nnode /Users/froelich/.openclaw/workspace/antfarm/dist/cli/cli.js step peek \"feature-dev-developer-2\"\n```\nIf output is \"NO_WORK\", reply HEARTBEAT_OK and stop immediately. Do NOT run step claim.\n\nStep 2 — If \"HAS_WORK\", claim the step:\n```\nnode /Users/froelich/.openclaw/workspace/antfarm/dist/cli/cli.js step claim \"feature-dev-developer-2\"\n```\nIf output is \"NO_WORK\", reply HEARTBEAT_OK and stop.\n\nIf JSON is returned, parse it to extract stepId, runId, and input fields.\nThen call sessions_spawn with these parameters:\n- agentId: \"feature-dev-developer-2\"\n- model: \"claude-opus-4-6\"\n- task: The full work prompt below, followed by \"\\n\\nCLAIMED STEP JSON:\\n\" and the exact JSON output from step claim.\n\nFull work prompt to include in the spawned task:\n---START WORK PROMPT---\nYou are an Antfarm workflow agent. Execute the pending work below.\n\n⚠️ CRITICAL: You MUST call \"step complete\" or \"step fail\" before ending your session. If you don't, the workflow will be stuck forever. This is non-negotiable.\n\nThe claimed step JSON is provided below. It contains: {\"stepId\": \"...\", \"runId\": \"...\", \"input\": \"...\"}\nSave the stepId — you'll need it to report completion.\nThe \"input\" field contains your FULLY RESOLVED task instructions. Read it carefully and DO the work.\n\nDo the work described in the input. Format your output with KEY: value lines as specified.\n\nMANDATORY: Report completion (do this IMMEDIATELY after finishing the work):\n```\ncat <<'\''ANTFARM_EOF'\'' > /tmp/antfarm-step-output.txt\nSTATUS: done\nCHANGES: what you did\nTESTS: what tests you ran\nANTFARM_EOF\ncat /tmp/antfarm-step-output.txt | node /Users/froelich/.openclaw/workspace/antfarm/dist/cli/cli.js step complete \"<stepId>\"\n```\n\nIf the work FAILED:\n```\nnode /Users/froelich/.openclaw/workspace/antfarm/dist/cli/cli.js step fail \"<stepId>\" \"description of what went wrong\"\n```\n\nRULES:\n1. NEVER end your session without calling step complete or step fail\n2. Write output to a file first, then pipe via stdin (shell escaping breaks direct args)\n3. If you're unsure whether to complete or fail, call step fail with an explanation\n\nThe workflow cannot advance until you report. Your session ending without reporting = broken pipeline.\n---END WORK PROMPT---\n\nReply with a short summary of what you spawned.",
    "model": "claude-sonnet-4-20250514",
    "timeoutSeconds": 120
  }' \
  --delivery '{"mode":"none"}'
```

### Developer 3

```bash
openclaw cron create \
  --agentId "feature-dev-developer-3" \
  --name "antfarm/feature-dev/developer-3" \
  --schedule '{"kind":"every","everyMs":300000,"anchorMs":210000}' \
  --sessionTarget "isolated" \
  --wakeMode "now" \
  --payload '{
    "kind": "agentTurn",
    "message": "Step 1 — Quick check for pending work (lightweight, no side effects):\n```\nnode /Users/froelich/.openclaw/workspace/antfarm/dist/cli/cli.js step peek \"feature-dev-developer-3\"\n```\nIf output is \"NO_WORK\", reply HEARTBEAT_OK and stop immediately. Do NOT run step claim.\n\nStep 2 — If \"HAS_WORK\", claim the step:\n```\nnode /Users/froelich/.openclaw/workspace/antfarm/dist/cli/cli.js step claim \"feature-dev-developer-3\"\n```\nIf output is \"NO_WORK\", reply HEARTBEAT_OK and stop.\n\nIf JSON is returned, parse it to extract stepId, runId, and input fields.\nThen call sessions_spawn with these parameters:\n- agentId: \"feature-dev-developer-3\"\n- model: \"claude-opus-4-6\"\n- task: The full work prompt below, followed by \"\\n\\nCLAIMED STEP JSON:\\n\" and the exact JSON output from step claim.\n\nFull work prompt to include in the spawned task:\n---START WORK PROMPT---\nYou are an Antfarm workflow agent. Execute the pending work below.\n\n⚠️ CRITICAL: You MUST call \"step complete\" or \"step fail\" before ending your session. If you don't, the workflow will be stuck forever. This is non-negotiable.\n\nThe claimed step JSON is provided below. It contains: {\"stepId\": \"...\", \"runId\": \"...\", \"input\": \"...\"}\nSave the stepId — you'll need it to report completion.\nThe \"input\" field contains your FULLY RESOLVED task instructions. Read it carefully and DO the work.\n\nDo the work described in the input. Format your output with KEY: value lines as specified.\n\nMANDATORY: Report completion (do this IMMEDIATELY after finishing the work):\n```\ncat <<'\''ANTFARM_EOF'\'' > /tmp/antfarm-step-output.txt\nSTATUS: done\nCHANGES: what you did\nTESTS: what tests you ran\nANTFARM_EOF\ncat /tmp/antfarm-step-output.txt | node /Users/froelich/.openclaw/workspace/antfarm/dist/cli/cli.js step complete \"<stepId>\"\n```\n\nIf the work FAILED:\n```\nnode /Users/froelich/.openclaw/workspace/antfarm/dist/cli/cli.js step fail \"<stepId>\" \"description of what went wrong\"\n```\n\nRULES:\n1. NEVER end your session without calling step complete or step fail\n2. Write output to a file first, then pipe via stdin (shell escaping breaks direct args)\n3. If you're unsure whether to complete or fail, call step fail with an explanation\n\nThe workflow cannot advance until you report. Your session ending without reporting = broken pipeline.\n---END WORK PROMPT---\n\nReply with a short summary of what you spawned.",
    "model": "claude-sonnet-4-20250514",
    "timeoutSeconds": 120
  }' \
  --delivery '{"mode":"none"}'
```

## Alternative: Direct JSON Entry

If the `openclaw cron create` CLI doesn't support all these fields, add entries directly to `~/.openclaw/cron/jobs.json` in the `jobs` array. Use the existing developer job (`44fd72d6-79a7-4051-b5a0-c126a8180b52`) as a template and change:

1. `id` — generate a new UUID
2. `agentId` — `feature-dev-developer-2` or `feature-dev-developer-3`
3. `name` — `antfarm/feature-dev/developer-2` or `antfarm/feature-dev/developer-3`
4. `schedule.anchorMs` — `150000` for developer-2, `210000` for developer-3
5. `payload.message` — replace all occurrences of `feature-dev-developer` with the new agent ID

## Notes

- The alias system in `step-ops.ts` allows developer-2 and developer-3 to claim steps assigned to `feature-dev-developer`
- Each agent polls independently and claims one step at a time
- Staggered anchors prevent all agents from polling simultaneously
