# Human Gate Steps

Workflows can include `gate: true` steps that pause execution until a human approves. When a gate step is reached, the pipeline stops and a notification is sent. The step enters `gate` status until approved.

```bash
# Approve a pending gate step to resume the pipeline
antfarm step approve <gate-code>
```

## Delivery Instructions — CRITICAL

**You MUST include delivery instructions when starting a workflow run.** These tell the main agent how to deliver gate notifications and other messages to the user. Without them, notifications go nowhere.

Delivery instructions are natural-language prose that tell the receiving agent exactly how to deliver a message. You construct them based on your current context (what channel you're in, what tools are available).

Gate notifications fire via cron into the main session. The main agent reads the delivery instructions and follows them.

**Construct delivery instructions that tell the main agent:**
1. How to send a message to the user (use the `message` tool with whatever channel/target params match your current context)
2. What to include in the message (gate summary + gate code)

**⚠️ DO NOT use `sessions_send` for gate notifications.** It injects into the wrong transcript due to channel identity being stripped. Use the `message` tool only.

## Gate Codes

The message posted via the `message` tool is visible to the human but NOT to the thread/session agent. So the notification must give the human a **gate code** — a two-word phrase like `bold-falcon` — they include in their reply to prime the agent.

Gate codes are derived deterministically from the step UUID (no extra DB column). They exist as a workaround for an OpenClaw bug where `sessions_send` strips channel identity, preventing inline notification delivery. Once that's fixed, gate codes will be replaced by direct thread notifications.

The notification MUST include:
1. A summary of what's being gated (spec, plan, etc.)
2. The gate code (e.g. `bold-falcon`)
3. Instructions:
   - To **discuss** this gate, include the code in your message (the agent will look up the gate context from the DB)
   - To **approve**, say `approve <code>` (this advances the pipeline immediately)

### How it works

1. Human sees the gate notification (via `message` tool)
2. Human replies with just the code (e.g. "bold-falcon — I have questions about the error handling") → agent looks up the gate in the antfarm DB, pulls context (spec/plan output + artifact paths), discusses
3. Human replies with `approve bold-falcon` → agent approves and advances the pipeline

## Editable Artifacts

When a user includes the gate code to discuss, look up the step output in the DB — it often contains file paths (e.g. `SPEC_PATH`, `PLAN_PATH`) pointing to artifacts on disk. Read those files and help the user review/edit them before approval. The downstream steps will pick up the edited files when the pipeline advances.

## Delivery Example

```bash
--delivery '{"instructions": "Use the message tool to post a gate notification to the user. Include a summary of the gated content and the gate code. Tell the user: to discuss, include the code in your message. To approve, say: approve <GATE_CODE>."}'
```
