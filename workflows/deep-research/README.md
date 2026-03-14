# Deep Research Workflow

Hybrid deep-research workflow for Antfarm/OpenClaw.

## Model split

- **Planner / Orchestrator / Verifier:** `openai-codex/gpt-5.4`
- **Deep analyst / Final writer:** `anthropic/claude-opus-4-6`
- **Polling:** `lmstudio/qwen-fast`

## Why it is structured this way

Antfarm steps are serial at the pipeline level, so the real multi-agent behavior happens inside the **research** step. The orchestrator step spawns specialized subagents (`scout`, `analyst`, `skeptic`) via `sessions_spawn`, collects their outputs, and turns them into a normalized research packet.

That preserves the architecture we wanted:

1. planner
2. scout + analyst + skeptic
3. verifier
4. final writer

## Installed agent IDs

After `workflow install deep-research`, the following agent IDs are available:

- `deep-research_planner`
- `deep-research_orchestrator`
- `deep-research_scout`
- `deep-research_x-scout`
- `deep-research_analyst`
- `deep-research_skeptic`
- `deep-research_verifier`
- `deep-research_writer`

## Run it

```bash
node dist/cli/cli.js workflow install deep-research
node dist/cli/cli.js workflow run deep-research "Research topic here"
node dist/cli/cli.js workflow status deep-research
```

## Key outputs

- `RESEARCH_PACKET_JSON` from the orchestrator
- `VERIFIED_PACKET_JSON` from the verifier
- `FINAL_REPORT` from the writer

See `PROMPT_SPEC.md` for the detailed prompt contracts for every agent.


## Optional X source intake

This workflow can now optionally spawn `deep-research_x-scout` when the topic would benefit from X/Twitter, maintainer chatter, or realtime social signal. X findings are treated as lead-generation evidence unless corroborated by stronger sources.
