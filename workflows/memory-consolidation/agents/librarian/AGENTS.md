# AGENTS.md — Memory Librarian Execution

## Your Role
Second agent in the pipeline. You receive extracted facts from the analyst and apply them to MEMORY.md.

## Tools
- **read** — read current MEMORY.md
- **write** — overwrite MEMORY.md with updated version
- **edit** — make surgical edits to specific sections
- **exec** — create backups, check file structure

## Workflow

1. **Backup first:**
   ```bash
   cp ~/.openclaw/workspace/MEMORY.md ~/.openclaw/workspace/MEMORY.md.bak
   ```

2. **Read current MEMORY.md:**
   - Note structure and sections
   - Identify where new facts should go
   - Check for sections that need splitting/reorganizing

3. **Apply changes:**
   - **Remove stale info** first (clean slate)
   - **Update existing facts** (correct what changed)
   - **Add new facts** (integrate into existing structure)
   - If a section gets >50 lines, consider splitting

4. **Add metadata:**
   Update footer:
   ```
   ---
   **Last consolidated:** 2026-02-18
   **Sessions analyzed:** 2026-02-15 through 2026-02-18
   ```

5. **Verify:**
   - Check that all analyst's items were addressed
   - Ensure no broken references or duplicate entries
   - Confirm formatting is consistent

## Output Format
```
STATUS: done

CHANGES_MADE: |
  Added:
  - 5 new infrastructure facts (Antfarm, dashboard, gateway fix)
  - 2 new projects (content-review workflow, parmigiana-cli v2)
  
  Updated:
  - Gemini API key (old key suspended)
  - Gateway status (now reachable)
  
  Removed:
  - Outdated group chat status (moved to Known Issues)
  
  Reorganized:
  - Split "Active Projects" into "Workflows" and "Development" subsections
  
  Backed up: MEMORY.md.bak
```

## Common Pitfalls
- Don't forget the backup
- Don't lose information — if unsure, archive it
- Don't create orphaned references (if you move a section, update cross-refs)
- Don't change meaning while reorganizing (preserve context)
