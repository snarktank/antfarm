# Design: Story-Based Execution (Ralph-Style Decomposition)

> **Status:** Approved, ready for implementation.
> **Date:** 2026-02-08
> **Approved by:** Ryan Carson

## Problem

Today, Antfarm's `feature-dev` workflow hands the entire task to a developer agent in one shot. For non-trivial features, this fails because:

1. **Context window limits** — large tasks exhaust the agent's context before completion
2. **No incremental progress** — if the agent fails partway, everything is lost
3. **No checkpoint/resume** — can't pick up where we left off
4. **Monolithic commits** — one giant change vs. small, reviewable increments

Ralph (github.com/snarktank/ralph) solves this by breaking work into small user stories and spawning a fresh session per story. Each story is scoped to fit in one context window. We adopt this pattern.

## Design Decisions (Final)

| Decision | Choice | Notes |
|----------|--------|-------|
| Planner model | Same as other agents (Opus 4.6) | No special model |
| Cross-session memory | File-based (`progress.txt`, `AGENTS.md`, `MEMORY.md`) | Not DB-only |
| Verification cadence | Verify after EACH story | Review only at the end |
| Failure handling | Verify/review failures pass back to developer | Existing retry mechanism |
| Progress archiving | Archive `progress.txt` at run completion | Keep history accessible |
| Cron frequency | 5 minutes (down from 15) | Configurable per-workflow |
| Max stories | 20 per run | Planner enforces this |
| Progress sharing | Inject via template variable `{{progress}}` | Other agents don't read the file directly |

## Architecture

### Pipeline Flow

```
[planner] → [developer ⟳ verify] → [test] → [pr] → [review]
                    ↑______|
                (loop per story)
```

1. **Plan** — Planner reads the task + codebase, produces ordered user stories
2. **Implement + Verify loop** — For each story:
   a. Developer implements the story (fresh session)
   b. Verifier checks it (fresh session)
   c. If verify fails → back to developer for that story
   d. If verify passes → next story
3. **Test** — Full test suite after all stories complete
4. **PR** — Developer creates pull request
5. **Review** — Reviewer checks the PR; if changes needed → back to developer

---

## Database Changes

### New table: `stories`

```sql
CREATE TABLE IF NOT EXISTS stories (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(id),
  story_index INTEGER NOT NULL,
  story_id TEXT NOT NULL,           -- e.g. "US-001"
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  acceptance_criteria TEXT NOT NULL, -- JSON array of strings
  status TEXT NOT NULL DEFAULT 'pending',  -- pending | running | done | failed
  output TEXT,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 2,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

### Altered table: `steps`

Add two columns (with defaults for backwards compat):

```sql
-- type: 'single' (default, current behavior) or 'loop'
ALTER TABLE steps ADD COLUMN type TEXT NOT NULL DEFAULT 'single';
-- loop_config: JSON blob, nullable. Only set when type='loop'.
ALTER TABLE steps ADD COLUMN loop_config TEXT;
-- current_story_id: tracks which story a loop step is currently working on
ALTER TABLE steps ADD COLUMN current_story_id TEXT;
```

Since we use `node:sqlite` (DatabaseSync), the migration approach is: check if columns exist, add if missing. Same pattern as existing `migrate()` in `db.ts`.

---

## Type Changes (`types.ts`)

```typescript
// Add to existing types:

export type LoopConfig = {
  over: "stories";
  completion: "all_done";
  freshSession?: boolean;     // default true
  verifyEach?: boolean;       // default false
  verifyStep?: string;        // step id to run after each iteration
};

export type WorkflowStep = {
  id: string;
  agent: string;
  type?: "single" | "loop";   // NEW, default "single"
  loop?: LoopConfig;           // NEW, only when type="loop"
  input: string;
  expects: string;
  max_retries?: number;
  on_fail?: WorkflowStepFailure;
};

export type Story = {
  id: string;
  runId: string;
  storyIndex: number;
  storyId: string;        // "US-001"
  title: string;
  description: string;
  acceptanceCriteria: string[];
  status: "pending" | "running" | "done" | "failed";
  output?: string;
  retryCount: number;
  maxRetries: number;
};
```

---

## Step Operations Changes (`step-ops.ts`)

This is the core of the implementation. All loop logic lives here — agents don't know they're in a loop.

### `claimStep(agentId)` — Updated

```
1. Find pending step for this agent (existing logic)
2. If step.type === 'loop':
   a. Parse loop_config JSON
   b. If loop_config.over === 'stories':
      - Query stories table: next story with status='pending' for this run
      - If no pending story found:
        * Mark step as 'done'
        * Advance pipeline (existing logic)
        * Return { found: false }
      - Claim the story: set story status='running', set step.current_story_id
      - Build extra template vars:
        * {{current_story}} — formatted story block (id, title, desc, acceptance criteria)
        * {{current_story_id}} — "US-001"
        * {{current_story_title}} — "Add status field"
        * {{completed_stories}} — summary of done stories
        * {{stories_remaining}} — count of pending stories
        * {{verify_feedback}} — from run context (set by verifier on failure)
        * {{progress}} — contents of progress.txt from developer workspace
      - Merge extra vars into context, resolve template, return
3. If step.type === 'single': existing logic unchanged
```

### `completeStep(stepId, output)` — Updated

```
1. Existing: save output, merge KEY:VALUE pairs into context
2. NEW — Detect STORIES_JSON in output:
   - Find the line starting with "STORIES_JSON:" 
   - Everything after that prefix (possibly multi-line) is JSON
   - Parse the array and INSERT into stories table
   - Each story gets: run_id from the step, sequential story_index, status='pending'
3. If step is a loop step (type='loop'):
   a. Mark current story as 'done', save output to story
   b. Clear step.current_story_id
   c. Check loop_config.verify_each:
      - If true: set the verify step (by loop_config.verify_step) to 'pending'
        * Also save {{changes}} etc. in run context so verifier can see them
        * The loop step stays 'running' (not 'pending' yet — waiting for verify)
      - If false: check for more pending stories
        * More stories → set step back to 'pending' (next poll picks up next story)
        * No more stories → mark step 'done', advance pipeline
4. If step is a single step: existing advance logic
```

### Verify step completion (new behavior for verify-each)

When the verify step completes and it was triggered by a loop step's verify_each:

```
1. If verify STATUS=done:
   - Check if more pending stories remain
   - If yes: set the loop step back to 'pending' (developer picks up next story)
   - If no: mark loop step 'done', advance pipeline past verify to next step
   - Clear verify_feedback from context
2. If verify STATUS=retry (failure):
   - Set the current story back to 'pending'
   - Store verify ISSUES in context as {{verify_feedback}}
   - Set the loop step back to 'pending' (developer retries the story)
   - Increment story retry_count
   - If story retry_count >= max_retries: fail the story, fail the step, fail the run
```

**How to detect "this verify completion was triggered by verify_each":**
- Check if the verify step's run has a loop step with `verify_each: true` and `verify_step` matching the current step's step_id
- Or: add a `triggered_by` field to the step record when setting it to pending

Recommendation: add a `triggered_by_loop TEXT` column to steps table (nullable). When verify-each sets the verify step to pending, it writes the loop step's ID here. On verify completion, check this field.

Actually simpler: just check if there's a loop step in this run with `verify_step` pointing to this step's step_id and the loop step is in 'running' status. No extra column needed.

### `failStep(stepId, error)` — Updated

```
1. If step is a loop step:
   a. Fail the current story (increment retry_count)
   b. If story retries remain: story → 'pending', step stays 'pending'
   c. If story retries exhausted: story → 'failed', step → 'failed', run → 'failed'
2. If step is a single step: existing logic
```

### New: `getStories(runId)` 

```typescript
function getStories(runId: string): Story[] {
  // Return all stories for a run, ordered by story_index
}
```

### New: `getCurrentStory(stepId)` 

```typescript
function getCurrentStory(stepId: string): Story | null {
  // Get the story currently being worked on by a loop step
  // Uses step.current_story_id
}
```

---

## Run Creation Changes (`run.ts`)

When inserting steps, persist the new fields:

```typescript
const stepType = step.type ?? "single";
const loopConfig = step.loop ? JSON.stringify(step.loop) : null;
// Add to INSERT: type, loop_config columns
```

---

## Workflow Spec Changes (`workflow-spec.ts`)

### Parsing

Read `type` and `loop` from YAML step definitions. Validate:
- If `type: loop`, `loop` must be present
- `loop.over` must be `"stories"` (only supported value for now)
- `loop.completion` must be `"all_done"`
- If `loop.verifyEach`, `loop.verifyStep` must reference a valid step id
- The referenced verify step must exist in the steps list

### YAML field mapping

```yaml
# In workflow.yml
type: loop              → step.type = "loop"
loop:
  over: stories         → loopConfig.over = "stories"
  completion: all_done  → loopConfig.completion = "all_done"
  verify_each: true     → loopConfig.verifyEach = true
  verify_step: verify   → loopConfig.verifyStep = "verify"
```

Note: YAML uses snake_case, TypeScript uses camelCase. Convert during parsing.

---

## Agent Cron Changes (`agent-cron.ts`)

### Frequency

Change `EVERY_MS` from `900_000` (15 min) to `300_000` (5 min).

Make it configurable per-workflow:

```yaml
# In workflow.yml (optional)
cron:
  interval_ms: 300000   # 5 minutes
```

If not specified, default to 300_000.

### Prompt

No changes needed to the agent cron prompt. The `step claim` / `step complete` / `step fail` CLI commands handle all the loop logic server-side. The agent doesn't know it's in a loop — it just claims work, does it, reports completion. Same prompt works for single and loop steps.

---

## CLI Changes (`cli.ts`)

### New command: `antfarm step stories <run-id>`

Lists all stories for a run:

```
$ antfarm step stories abc123
US-001 [done]    Add status field to database
US-002 [done]    Display status badge on task cards  
US-003 [running] Add status toggle to task list rows
US-004 [pending] Filter tasks by status
```

### Updated: `antfarm workflow status`

Include story progress in status output when stories exist.

---

## Cross-Session Memory: File-Based

### Where files live

Developer agent workspace: `/Users/scout/.openclaw/workspaces/workflows/feature-dev/agents/developer/`

This directory contains: `AGENTS.md`, `SOUL.md`, `IDENTITY.md`, `TOOLS.md`, `USER.md`, `HEARTBEAT.md`

We add: `progress.txt` (created by the developer agent on first story), `MEMORY.md` (optional, created if agent finds it useful), `archive/` (created on run completion).

### progress.txt

**Created by:** Developer agent during first story implementation.
**Location:** Developer agent workspace directory.
**Lifecycle:** Created fresh per run. Archived on run completion.

Format:
```markdown
# Progress Log
Run: <run-id>
Task: <task description>
Started: <timestamp>

## Codebase Patterns
- Pattern 1 discovered during implementation
- Pattern 2
(consolidated reusable patterns — updated by developer after each story)

---

## <timestamp> - US-001: <title>
- What was implemented
- Files changed
- **Learnings:** What was discovered about the codebase
---

## <timestamp> - US-002: <title>
- What was implemented  
- Files changed
- **Learnings:** ...
---
```

### How other agents access progress

The developer agent writes `progress.txt` to its own workspace. Other agents (verifier, tester) need to see it.

**Solution:** When `claimStep()` resolves template variables for any step in a run that has stories, it reads the developer workspace's `progress.txt` and injects its contents as `{{progress}}`. This way the verifier/tester prompt can include:

```yaml
input: |
  ...
  PROGRESS LOG:
  {{progress}}
```

The `claimStep()` function needs to know the developer workspace path. It can derive this from:
- The loop step's agent_id → workflow agent config → workspace path
- Or: store the developer workspace path in run context during planning

Recommendation: The planner step outputs `REPO: /path/to/repo`. The developer's workspace path is deterministic from the workflow config. Have `claimStep()` look up the workspace path from the agent config for the loop step's agent.

Actually simpler: the developer agent writes progress.txt in its workspace. The workspace path is known from the OpenClaw config (`agents.list[].workspace`). Add a helper `getAgentWorkspace(agentId)` that reads the config and returns the path.

Even simpler: store the progress.txt path in run context. When the loop step first claims a story, set `context.progress_file = "<workspace>/progress.txt"`. Then `claimStep()` reads that file for `{{progress}}`.

**Final approach:** Add a `resolveProgressFile(runId)` helper that:
1. Finds the loop step for this run
2. Gets its agent_id
3. Looks up that agent's workspace from the OpenClaw config
4. Returns `<workspace>/progress.txt`

Then in `claimStep()` for any step (not just loops), if the run has stories, inject `{{progress}}` by reading that file.

### AGENTS.md updates

Developer agent updates its own `AGENTS.md` with structural codebase knowledge. This persists across runs. Guidance for what to add:

- Project stack/framework info
- How to run tests
- Key file locations and patterns
- Gotchas and non-obvious dependencies

These go in a `## Codebase Knowledge` section that the agent appends to.

### MEMORY.md

Optional. If the developer agent creates one, OpenClaw auto-loads it on each session. Could be used for longer-term memory across multiple runs. Not required for the loop mechanism to work.

### Archiving

When a run completes (final step done → run status = 'completed'):

The `completeStep()` function, after marking a run as completed, should trigger archiving:

1. Find the developer workspace for this run's workflow
2. If `progress.txt` exists:
   - Create `archive/<run-id>/`
   - Copy `progress.txt` → `archive/<run-id>/progress.txt`
   - Truncate `progress.txt` (or delete it — next run creates a fresh one)

This can be a separate function `archiveRunProgress(runId)` called from `completeStep()` when `runCompleted: true`.

---

## New Agent: Planner

### Files to create

```
workflows/feature-dev/agents/planner/AGENTS.md
workflows/feature-dev/agents/planner/SOUL.md
workflows/feature-dev/agents/planner/IDENTITY.md
```

### AGENTS.md (Planner)

Should contain:
- Role: decompose tasks into user stories
- Story sizing rules (must fit in one context window)
- Ordering rules (dependencies first: schema → backend → frontend)
- Acceptance criteria rules (must be verifiable, always include "Typecheck passes")
- Output format (STATUS, REPO, BRANCH, STORIES_JSON)
- Max 20 stories rule
- Examples of well-sized vs too-big stories
- Instructions to explore the codebase before decomposing

Key content to borrow from Ralph's PRD skill (`/tmp/ralph/skills/ralph/SKILL.md`):
- Story sizing section ("Right-sized stories" vs "Too big")
- Acceptance criteria section ("Must Be Verifiable")
- Story ordering section ("Dependencies First")

### SOUL.md (Planner)

Analytical, thorough. Takes time to understand the codebase before decomposing. Not a coder — a planner. Thinks in terms of dependencies, risk, and incremental delivery.

### IDENTITY.md (Planner)

```markdown
# Identity
Name: Planner
Role: Decomposes tasks into user stories
```

---

## Updated Agent: Developer

### AGENTS.md changes

Add sections:

```markdown
## Story-Based Execution

You work on ONE user story per session. A fresh session is started for each story.

### Each Session

1. Read `progress.txt` — especially the Codebase Patterns section at the top
2. Check the branch, pull latest
3. Implement the story described in your task input
4. Run quality checks
5. Commit: `feat: <story-id> - <story-title>`
6. Append to progress.txt (see format below)
7. Update Codebase Patterns in progress.txt if you found reusable patterns
8. Update AGENTS.md if you learned something structural about the codebase

### progress.txt Format

Append this after completing a story:

## <date/time> - <story-id>: <title>
- What was implemented
- Files changed
- **Learnings:** codebase patterns, gotchas, useful context
---

### Codebase Patterns

If you discover a reusable pattern, add it to the `## Codebase Patterns` section at the TOP of progress.txt. Only add patterns that are general and reusable, not story-specific.

### AGENTS.md Updates

If you discover something structural (not story-specific), add it to your AGENTS.md:
- Project stack/framework
- How to run tests
- Key file locations
- Dependencies between modules
- Gotchas
```

---

## Updated Agent: Verifier

### AGENTS.md changes

Update to reflect per-story verification:

```markdown
## Per-Story Verification

You verify ONE story at a time, immediately after the developer completes it.

### What to Check

1. Code exists and is not just TODOs or placeholders
2. Each acceptance criterion for the story is met
3. No obvious incomplete work
4. Typecheck passes
5. If the story has "Verify in browser" criterion, do that

### Context Available

- The story details (in your task input)
- What the developer changed (in your task input)
- The progress log (in your task input as {{progress}})
- The actual code (in the repo on the branch)

### Output

Pass: STATUS: done + VERIFIED: what you confirmed
Fail: STATUS: retry + ISSUES: what's missing/broken (this goes back to the developer)
```

---

## Updated Workflow YAML

The full `workflow.yml` for feature-dev v4 is in the Architecture section above. Key changes from v3:

1. Added `planner` agent and `plan` step
2. Changed `implement` step to `type: loop` with `verify_each: true`
3. Added `{{progress}}` injection to verify/test steps
4. Max stories: 20 (in planner instructions)
5. Removed the `pr` step's `TESTS:` context dependency (tester output goes to context, PR reads progress.txt)

---

## SKILL.md Updates

Update `~/.openclaw/skills/antfarm-workflows/SKILL.md`:

- Document the new pipeline (plan → implement loop → test → pr → review)  
- Note that the planner handles decomposition automatically
- Update the example interaction
- Add `antfarm step stories <run-id>` to CLI reference
- Note 5-minute cron cycles
- Update "Manually Triggering Agents" to mention the planner

---

## Dashboard Changes

### Stories panel

On the run detail view, add a stories section showing:
- Each story with status (pending/running/done/failed)
- Story title and acceptance criteria
- Retry count
- Output snippet (collapsible)

### API endpoints

- `GET /api/runs/:id/stories` — returns stories for a run

---

## Implementation Tasks

All tasks are in the antfarm repo: `~/.openclaw/workspace/antfarm/`

### Phase 1: Core Engine (do these first, in order)

- [ ] **T1: DB migration** — `src/db.ts`
  - Add `stories` table (schema above)
  - Add `type`, `loop_config`, `current_story_id` columns to `steps` table
  - Use ALTER TABLE with existence checks for backwards compat
  - Test: existing counter-test workflow still works after migration

- [ ] **T2: Types** — `src/installer/types.ts`
  - Add `LoopConfig` type
  - Add `Story` type  
  - Update `WorkflowStep` with optional `type` and `loop` fields
  - No runtime impact, just type definitions

- [ ] **T3: Workflow spec parsing** — `src/installer/workflow-spec.ts`
  - Parse `type` and `loop` fields from YAML
  - Convert snake_case YAML to camelCase TypeScript (verify_each → verifyEach, etc.)
  - Validate: if type=loop, loop config must be present and valid
  - Validate: verify_step must reference existing step id
  - Test: parse the new feature-dev v4 workflow.yml successfully

- [ ] **T4: Run creation** — `src/installer/run.ts`
  - Persist `type` and `loop_config` when inserting steps
  - Add type and loop_config to the INSERT statement
  - Test: create a run with the new workflow, verify steps have correct type/loop_config in DB

- [ ] **T5: Step operations — story parsing** — `src/installer/step-ops.ts`
  - In `completeStep()`: detect `STORIES_JSON:` in output
  - Parse the JSON array (handle multi-line — everything from `STORIES_JSON:` to end of output, or to next `KEY:` line)
  - Insert parsed stories into `stories` table
  - Test: complete a plan step with STORIES_JSON output, verify stories appear in DB

- [ ] **T6: Step operations — loop claim** — `src/installer/step-ops.ts`
  - In `claimStep()`: when step.type='loop', find next pending story
  - Mark story as 'running', set step.current_story_id
  - Build dynamic template vars (current_story, completed_stories, stories_remaining, etc.)
  - Read progress.txt from developer workspace and inject as {{progress}}
  - If no pending stories, mark step done and advance
  - Helper: `getAgentWorkspacePath(agentId)` — reads OpenClaw config to find workspace
  - Helper: `formatStoryForTemplate(story)` — formats story as readable text block
  - Helper: `formatCompletedStories(stories)` — formats done stories as summary
  - Test: claim a loop step, verify correct story is returned with resolved template

- [ ] **T7: Step operations — loop complete** — `src/installer/step-ops.ts`
  - In `completeStep()` for loop steps: mark story done (not step)
  - Save output to story record
  - If verify_each: set verify step to 'pending', loop step stays 'running'
  - If not verify_each: check for more stories, set step pending or done
  - Test: complete a loop step iteration, verify story marked done and step stays pending

- [ ] **T8: Step operations — verify-each flow** — `src/installer/step-ops.ts`
  - In `completeStep()` for verify step: detect if triggered by verify-each
  - Detection: check if run has a loop step with verifyStep matching this step's step_id and loop step status='running'
  - On verify pass: set loop step to 'pending' (next story), or 'done' if no more stories
  - On verify fail (STATUS: retry): set story back to 'pending', store ISSUES as verify_feedback in context, set loop step to 'pending', increment story retry_count
  - If story retries exhausted: fail story, fail step, fail run
  - Test: full mini-loop — dev completes → verify passes → dev gets next story. Dev completes → verify fails → dev retries same story.

- [ ] **T9: Step operations — loop fail** — `src/installer/step-ops.ts`
  - In `failStep()` for loop steps: fail current story, not step
  - Per-story retry logic
  - Test: fail a story, verify retry. Exhaust retries, verify run fails.

### Phase 2: Agent Files

- [ ] **T10: Planner agent files** — `workflows/feature-dev/agents/planner/`
  - Create `AGENTS.md` with decomposition instructions (borrow from Ralph's PRD skill for story sizing, ordering, acceptance criteria guidance)
  - Create `SOUL.md` — analytical, thorough planner personality
  - Create `IDENTITY.md` — name and role
  - Reference: `/tmp/ralph/skills/ralph/SKILL.md` for story sizing rules (clone ralph if needed: `gh repo clone snarktank/ralph /tmp/ralph`)

- [ ] **T11: Developer agent AGENTS.md update** — `workflows/feature-dev/agents/developer/AGENTS.md`
  - Add "Story-Based Execution" section
  - Document progress.txt format and when to write to it
  - Document Codebase Patterns section maintenance
  - Document when to update AGENTS.md (structural knowledge only)

- [ ] **T12: Verifier agent AGENTS.md update** — `workflows/feature-dev/agents/verifier/AGENTS.md`
  - Update for per-story verification model
  - Document what to check per story
  - Document pass/fail output format

- [ ] **T13: Workflow YAML** — `workflows/feature-dev/workflow.yml`
  - Bump to version 4
  - Add planner agent definition
  - Add plan step
  - Change implement step to type: loop with verify_each
  - Update all step input templates
  - Add {{progress}} to verify/test/tester inputs

### Phase 3: Infrastructure

- [ ] **T14: Cron frequency** — `src/installer/agent-cron.ts`
  - Change EVERY_MS from 900_000 to 300_000 (5 min)
  - Make configurable: read `cron.interval_ms` from workflow.yml if present
  - Pass interval to `setupAgentCrons()`

- [ ] **T15: Progress archiving** — `src/installer/step-ops.ts` (or new file)
  - New function: `archiveRunProgress(runId)`
  - Called from `completeStep()` when run completes
  - Finds developer workspace, creates archive/<run-id>/, copies progress.txt, truncates original
  - Needs `getAgentWorkspacePath()` helper (same as T6)

- [ ] **T16: CLI — stories command** — `src/cli/cli.ts`
  - Add `antfarm step stories <run-id>` command
  - Pretty-print stories with status, title, retry count
  - Also update `antfarm workflow status` to show story progress

- [ ] **T17: Dashboard — stories view** — `src/server/dashboard.ts` + `src/server/index.html`
  - Add `/api/runs/:id/stories` endpoint
  - Add stories panel to run detail in the HTML
  - Show status, title, acceptance criteria, output

- [ ] **T18: SKILL.md update** — `~/.openclaw/skills/antfarm-workflows/SKILL.md`
  - Document new pipeline
  - Update CLI reference
  - Update example interaction
  - Note 5-min cron cycles

### Phase 4: Install & Test

- [ ] **T19: Reinstall workflow**
  - Run `antfarm workflow uninstall feature-dev` then `antfarm workflow install feature-dev`
  - Verify: new planner agent appears in OpenClaw config
  - Verify: cron jobs recreated at 5-min intervals
  - Verify: counter-test still works (backwards compat)

- [ ] **T20: Build** 
  - Run `npm run build` (or `tsc`)
  - Fix any type errors

- [ ] **T21: End-to-end test**
  - Run a real feature-dev workflow with a small task
  - Verify: planner produces stories, developer loops through them, verifier checks each one
  - Verify: progress.txt is created and appended to
  - Verify: archiving works on completion
  - Check dashboard shows stories

- [ ] **T22: Commit and push**
  - Commit all changes with clear message
  - Push to main

## Key Files Reference

For the implementor — here's every file you'll touch and where it is:

| File | Path | What to do |
|------|------|------------|
| DB migration | `src/db.ts` | Add stories table, alter steps table |
| Types | `src/installer/types.ts` | Add LoopConfig, Story, update WorkflowStep |
| Step operations | `src/installer/step-ops.ts` | Loop claim/complete/fail, story parsing, verify-each |
| Run creation | `src/installer/run.ts` | Persist type/loop_config on step insert |
| Workflow spec | `src/installer/workflow-spec.ts` | Parse type/loop from YAML, validate |
| CLI | `src/cli/cli.ts` | Add `step stories` command |
| Agent cron | `src/installer/agent-cron.ts` | Change to 5min, make configurable |
| Dashboard server | `src/server/dashboard.ts` | Add stories API endpoint |
| Dashboard HTML | `src/server/index.html` | Add stories panel |
| Planner AGENTS.md | `workflows/feature-dev/agents/planner/AGENTS.md` | Create (new file) |
| Planner SOUL.md | `workflows/feature-dev/agents/planner/SOUL.md` | Create (new file) |
| Planner IDENTITY.md | `workflows/feature-dev/agents/planner/IDENTITY.md` | Create (new file) |
| Developer AGENTS.md | `workflows/feature-dev/agents/developer/AGENTS.md` | Add story-based execution section |
| Verifier AGENTS.md | `workflows/feature-dev/agents/verifier/AGENTS.md` | Update for per-story verification |
| Workflow YAML | `workflows/feature-dev/workflow.yml` | v4 with planner + loop steps |
| Antfarm skill | (installed at `~/.openclaw/skills/antfarm-workflows/SKILL.md`) | Update docs |

## STORIES_JSON Parsing Details

The planner outputs stories as a JSON array after `STORIES_JSON:`. This needs careful parsing because the agent output has KEY: VALUE lines mixed with the JSON.

### Parsing algorithm

```
1. Split output into lines
2. Find the line starting with "STORIES_JSON:"
3. Take everything after "STORIES_JSON:" on that line, plus all subsequent lines
   until we hit a line that matches /^[A-Z_]+:/ (next KEY: line) or end of output
4. Join those lines and JSON.parse()
5. Validate: must be an array, each element must have id, title, description, acceptanceCriteria
```

### Edge cases
- STORIES_JSON might be on one line (small stories list) or many lines
- The JSON might contain colons (which look like KEY: VALUE lines) — only break on lines matching `^[A-Z_]+:\s` at the start
- Handle JSON parse failures gracefully — fail the step with a clear error

### Validation
- Max 20 stories (reject if more)
- Each story must have: id (string), title (string), description (string), acceptanceCriteria (string[])
- Story IDs should be unique within the run
- acceptanceCriteria must be non-empty array

---

## Verify-Each State Machine

Detailed state transitions for the implement→verify mini-loop:

```
INITIAL STATE (after planner completes):
  implement step: pending
  verify step: waiting
  stories: US-001=pending, US-002=pending, US-003=pending

DEVELOPER CLAIMS (claimStep for developer agent):
  implement step: running, current_story_id=US-001
  US-001: running

DEVELOPER COMPLETES (completeStep for implement):
  implement step: running (stays running, waiting for verify)
  verify step: pending
  US-001: done (output saved)
  context: { changes: "...", verify_feedback: "" }

VERIFIER CLAIMS (claimStep for verifier agent):
  verify step: running

VERIFIER PASSES (completeStep for verify, STATUS=done):
  verify step: waiting (reset for next story)
  implement step: pending (ready for next story)
  US-001: done (confirmed)

DEVELOPER CLAIMS NEXT (claimStep for developer agent):
  implement step: running, current_story_id=US-002
  US-002: running

... (repeat until all stories done) ...

LAST STORY VERIFIED:
  verify step: done
  implement step: done
  → advance to test step

--- FAILURE PATH ---

VERIFIER FAILS (completeStep for verify, STATUS=retry):
  verify step: waiting (reset)
  implement step: pending (developer retries)
  US-001: pending (retry_count incremented)
  context: { verify_feedback: "ISSUES: ..." }
```

Note: the verify step transitions between `waiting` and `pending`/`running` during the loop. After the loop completes, it should be marked `done` (even though it was never "pending→running→done" in a linear sense). The step ran N times successfully. Mark it done when the loop step completes.

---

## Progress.txt Path Resolution

Helper function needed in step-ops.ts:

```typescript
function resolveProgressFilePath(runId: string): string | null {
  // 1. Find the loop step for this run
  const loopStep = db.prepare(
    "SELECT agent_id FROM steps WHERE run_id = ? AND type = 'loop' LIMIT 1"
  ).get(runId);
  if (!loopStep) return null;
  
  // 2. Get the agent's workspace path from OpenClaw config
  const workspace = getAgentWorkspacePath(loopStep.agent_id);
  if (!workspace) return null;
  
  // 3. Return progress.txt path
  return path.join(workspace, "progress.txt");
}

function getAgentWorkspacePath(agentId: string): string | null {
  // Read ~/.openclaw/openclaw.json
  // Find agent in agents.list by id
  // Return workspace path
  const configPath = path.join(os.homedir(), ".openclaw", "openclaw.json");
  const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
  const agent = config.agents?.list?.find((a: any) => a.id === agentId);
  return agent?.workspace ?? null;
}

function readProgressFile(runId: string): string {
  const filePath = resolveProgressFilePath(runId);
  if (!filePath) return "(no progress file)";
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return "(no progress yet)";
  }
}
```

This is used by `claimStep()` to inject `{{progress}}` into any step's template.
