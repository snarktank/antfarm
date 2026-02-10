# Family Workflows for Antfarm

Three standardized workflows that replace the inconsistent manual spawning for family tasks.

## Overview

| Workflow | Schedule | Purpose | Output |
|----------|----------|---------|--------|
| `family-events` | Weekly (Sun 6pm) | Family & kid events in North Dallas | Apple Note: `Family - Family & Kid Events — <M/D/YY–M/D/YY> (North Dallas)` |
| `hot-restaurants` | Weekly (Sun 6pm) | Hot restaurants in Dallas area | Apple Note: `Family - Hot Restaurants — <M/D/YY–M/D/YY> (Dallas area)` |
| `holiday-prep` | Monthly (28th) | Prepare holiday notes 1-2 months ahead | Apple Notes: `YYYY-MM-DD — <Holiday Name>` with 5 sections |

## Why This Replaces the Old Scripts

| Old Approach | New Workflows |
|--------------|---------------|
| Generic agent with vague message | Specialized agents per stage (research → format → validate) |
| "Check TASKS.md for sources" | Hardcoded sources.txt in agent workspace |
| "Follow the spec somewhere" | Embedded template.html and spec.md |
| No validation step | Dedicated validator agent enforces formatting |
| Output varies | Standardized acceptance criteria |
| Complex bash scripts (50+ lines) | One-liner: `antfarm run family-events --task "..."` |

## Installation

```bash
# Install all three workflows
cd ~/clawd/vendor/antfarm
antfarm workflow install family-events
antfarm workflow install hot-restaurants
antfarm workflow install holiday-prep

# Optional: install to OpenClaw config
# (This adds agents to OpenClaw and sets up cron polling)
```

## Usage

### Manual Trigger
```bash
# Family events for specific week
antfarm run family-events --task "Family & Kid Events for week of 2/9–2/15"

# Hot restaurants
antfarm run hot-restaurants --task "Hot Restaurants for week of 2/9–2/15"

# Holiday prep
antfarm run holiday-prep --task "Prepare holiday notes for March 2026"
```

### Scheduled (LaunchAgent)
Replace the old complex scripts with simplified versions:

```bash
# Update LaunchAgent to use new scripts
# scripts/family-events-antfarm.sh
# scripts/hot-restaurants-antfarm.sh
# scripts/holiday-prep-antfarm.sh
```

These scripts are ~15 lines vs. ~50 lines before, and contain zero business logic (it's all in the workflow).

## Workflow Structure

Each workflow has the same pipeline:

```
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│ Research │ → │  Format  │ → │ Validate │ → │  Output  │
└──────────┘    └──────────┘    └──────────┘    └──────────┘
```

### 1. Research Stage
- Reads `sources.txt` for exact sources to query
- Gathers structured data (events/restaurants/holiday content)
- Outputs in strict format for next stage

### 2. Format Stage
- Reads `template.html` and `spec.md`
- Generates Apple Notes-compatible HTML
- Follows spacing rules exactly

### 3. Validate Stage
- Reads `spec.md` as validation rules
- Checks all formatting requirements
- Rejects non-compliant output for retry

### 4. Output Stage
- Delivers final HTML and creation instructions
- Ready for Apple Notes creation

## Key Files Per Workflow

### family-events
```
family-events/
├── workflow.yml
└── agents/
    ├── researcher/
    │   ├── sources.txt (7 specific RSS/HTML sources)
    │   └── AGENTS.md
    ├── formatter/
    │   ├── template.html (strict HTML structure)
    │   └── spec.md (spacing & formatting rules)
    └── validator/
        └── spec.md (same as formatter for reference)
```

### hot-restaurants
Same structure, different `sources.txt` (Eater Dallas, D Magazine, etc.)

### holiday-prep
Includes a `planner` agent that identifies which holidays need notes.

## Migration from Old Scripts

### Step 1: Install Workflows
```bash
antfarm workflow install family-events
antfarm workflow install hot-restaurants
antfarm workflow install holiday-prep
```

### Step 2: Update LaunchAgents
Edit the existing plists to use the new scripts:

```xml
<key>ProgramArguments</key>
<array>
  <string>/Users/petersykim/clawd/scripts/family-events-antfarm.sh</string>
</array>
```

### Step 3: Disable Old Scripts
```bash
mv scripts/family-events-weekly.sh scripts/family-events-weekly.sh.deprecated
mv scripts/hot-restaurants-weekly.sh scripts/hot-restaurants-weekly.sh.deprecated
mv scripts/holiday-month-after-next.sh scripts/holiday-month-after-next.sh.deprecated
```

### Step 4: Test
Run each workflow manually once:
```bash
antfarm run family-events --task "Test run for next week"
```

Check the dashboard: http://localhost:3333

## Validation & Quality

Each workflow has strict validation:

- **Formatting**: No double blank lines, proper HTML, exact section structure
- **Content completeness**: All required sections present
- **Bullet format**: Event name/Restaurant name properly bolded
- **Sources**: Researcher must document which sources were checked

If validation fails, the formatter retries automatically (up to 2 times).

## Monitoring

View workflow runs:
```bash
antfarm logs
antfarm status
```

Or use the dashboard: http://localhost:3333

## Troubleshooting

### Workflow fails validation repeatedly
Check `antfarm logs` for specific violations. The validator outputs exact issues.

### Sources change
Edit the workflow's `sources.txt` file, then reinstall:
```bash
antfarm workflow install family-events --force
```

### Formatting rules need updating
Edit `spec.md` in the workflow, then reinstall.

## Future Improvements

- [ ] Add dedupe agent that checks prior notes for duplicates
- [ ] Integrate apple-notes-skill directly in workflow for automated creation
- [ ] Add delivery confirmation step
- [ ] Create shared agents (researcher, formatter, validator) across workflows

---

Created: 2026-02-09
Replaces: scripts/family-events-weekly.sh, scripts/hot-restaurants-weekly.sh, scripts/holiday-month-after-next.sh
