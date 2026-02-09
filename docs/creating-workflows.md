# Creating Custom Workflows

This guide covers how to create your own Antfarm workflow.

## Directory Structure

```
workflows/
└── my-workflow/
    ├── workflow.yml          # Workflow definition (required)
    ├── metadata.json         # Display metadata (optional)
    └── agents/
        ├── agent-a/
        │   ├── AGENTS.md     # Agent instructions
        │   ├── SOUL.md       # Agent persona
        │   └── IDENTITY.md   # Agent identity
        └── agent-b/
            ├── AGENTS.md
            ├── SOUL.md
            └── IDENTITY.md
```

## workflow.yml

### Minimal Example

```yaml
id: my-workflow
name: My Workflow
version: 1
description: What this workflow does.

agents:
  - id: researcher
    name: Researcher
    description: Researches the topic and gathers information.
    workspace:
      baseDir: agents/researcher
      files:
        AGENTS.md: agents/researcher/AGENTS.md
        SOUL.md: agents/researcher/SOUL.md
        IDENTITY.md: agents/researcher/IDENTITY.md

  - id: writer
    name: Writer
    description: Writes content based on research.
    workspace:
      baseDir: agents/writer
      files:
        AGENTS.md: agents/writer/AGENTS.md
        SOUL.md: agents/writer/SOUL.md
        IDENTITY.md: agents/writer/IDENTITY.md

steps:
  - id: research
    agent: researcher
    input: |
      Research the following topic:
      {{task}}

      Reply with:
      STATUS: done
      FINDINGS: what you found
    expects: "STATUS: done"

  - id: write
    agent: writer
    input: |
      Write content based on these findings:
      {{findings}}

      Original request: {{task}}

      Reply with:
      STATUS: done
      OUTPUT: the final content
    expects: "STATUS: done"
```

### Top-Level Fields

| Field | Required | Description |
|-------|----------|-------------|
| `id` | yes | Unique workflow identifier (lowercase, hyphens) |
| `name` | yes | Human-readable name |
| `version` | yes | Integer version number |
| `description` | yes | What the workflow does |
| `agents` | yes | List of agent definitions |
| `steps` | yes | Ordered list of pipeline steps |

### Agent Definition

```yaml
agents:
  - id: my-agent            # Unique within this workflow
    name: My Agent           # Display name
    description: What it does.
    workspace:
      baseDir: agents/my-agent
      files:                 # Workspace files provisioned for this agent
        AGENTS.md: agents/my-agent/AGENTS.md
        SOUL.md: agents/my-agent/SOUL.md
        IDENTITY.md: agents/my-agent/IDENTITY.md
```

File paths are relative to the workflow directory. You can reference shared agents:

```yaml
workspace:
  files:
    AGENTS.md: ../../agents/shared/setup/AGENTS.md
```

### Step Definition

```yaml
steps:
  - id: step-name           # Unique step identifier
    agent: agent-id          # Which agent handles this step
    input: |                 # Prompt template (supports {{variables}})
      Do the thing.
      {{task}}               # {{task}} is always the original task string
      {{prev_output}}        # Variables from prior steps (lowercased KEY names)

      Reply with:
      STATUS: done
      MY_KEY: value          # KEY: value pairs become variables for later steps
    expects: "STATUS: done"  # String the output must contain to count as success
    max_retries: 2           # How many times to retry on failure (optional)
    on_fail:                 # What to do when retries exhausted (optional)
      escalate_to: human     # Escalate to human
```

### Template Variables

Steps communicate through KEY: value pairs in their output. When an agent replies with:

```
STATUS: done
REPO: /path/to/repo
BRANCH: feature/my-thing
```

Later steps can reference `{{repo}}` and `{{branch}}` (lowercased key names).

`{{task}}` is always available — it's the original task string passed to `workflow run`.

### Verification Loops

A step can retry a previous step on failure:

```yaml
- id: verify
  agent: verifier
  input: |
    Check the work...
    Reply STATUS: done or STATUS: retry with ISSUES.
  expects: "STATUS: done"
  on_fail:
    retry_step: implement    # Re-run this step with feedback
    max_retries: 3
    on_exhausted:
      escalate_to: human
```

When verification fails with `STATUS: retry`, the `implement` step runs again with `{{verify_feedback}}` populated.

### Loop Steps (Story-Based)

For steps that iterate over a list of stories (like implementing multiple features):

```yaml
- id: implement
  agent: developer
  type: loop                 # Enables story-based iteration
  input: |
    Implement story {{current_story}}...
  expects: "STATUS: done"
```

Stories are created by a planner step that outputs them in a structured format. Each story gets a fresh agent session.

## Agent Workspace Files

### AGENTS.md

Instructions for the agent. Include:
- What the agent does (its role)
- Step-by-step process
- Output format (must match the KEY: value pattern)
- What NOT to do (scope boundaries)

### SOUL.md

Agent persona. Keep it brief — a few lines about tone and approach.

### IDENTITY.md

Agent name and role. Example:

```markdown
# Identity
- **Name:** Researcher
- **Role:** Research agent for my-workflow
```

## Shared Agents

Antfarm includes shared agents in `agents/shared/` that you can reuse:

- **setup** — Creates branches, establishes build/test baselines
- **verifier** — Verifies work against acceptance criteria
- **pr** — Creates pull requests via `gh`

Reference them from your workflow:

```yaml
- id: setup
  agent: setup
  workspace:
    files:
      AGENTS.md: ../../agents/shared/setup/AGENTS.md
```

## Installing Your Workflow

Place your workflow directory in `workflows/` and run:

```bash
antfarm workflow install my-workflow
```

This provisions agent workspaces, registers agents in OpenClaw config, and sets up cron polling.

## Tips

- **Be specific in input templates.** Agents get the input as their entire task context. Vague inputs produce vague results.
- **Include output format in every step.** Agents need to know exactly what KEY: value pairs to return.
- **Use verification steps.** A verify -> retry loop catches most quality issues automatically.
- **Keep agents focused.** One agent, one job. Don't combine triaging and fixing in the same agent.
- **Test with small tasks first.** Run a simple test task before throwing a complex feature at the pipeline.
