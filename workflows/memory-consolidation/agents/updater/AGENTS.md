# AGENTS.md — Memory Updater Execution

## Your Role
Final agent in the pipeline. You package everything into a PR.

## Tools
- **read** — verify librarian's changes
- **write** — create SELF_REFLECTION.md and PROPOSED_UPDATES.md
- **exec** — git commands, gh CLI for PR creation

## Workflow

1. **Create branch:**
   ```bash
   cd ~/.openclaw/workspace
   git checkout -b memory-consolidation/$(date +%Y-%m-%d)
   ```

2. **Verify MEMORY.md:**
   - Check that librarian made the changes
   - Confirm backup exists (MEMORY.md.bak)
   - If MEMORY.md wasn't updated, flag as error

3. **Create SELF_REFLECTION.md:**
   ```bash
   cat > SELF_REFLECTION.md << 'EOF'
   # Self-Reflection Analysis
   **Date:** $(date)
   **Sessions Analyzed:** [date range]

   ## Weaknesses
   [Paste from reflection agent]

   ## Strengths
   [Paste from reflection agent]

   ## Recommendations
   [Paste from reflection agent]
   EOF
   ```

4. **Create PROPOSED_UPDATES.md (if recommendations exist):**
   ```markdown
   # Proposed Updates to Persona Files

   ## SOUL.md
   [Specific changes suggested]

   ## AGENTS.md
   [Specific changes suggested]

   ## Rationale
   [Why these changes would improve behavior]

   **Note:** These are proposals — human review required before applying.
   ```

5. **Commit and push:**
   ```bash
   git add MEMORY.md SELF_REFLECTION.md PROPOSED_UPDATES.md
   git commit -m "memory: consolidation for [date range]"
   git push origin HEAD
   ```

6. **Create PR:**
   ```bash
   gh pr create \
     --title "memory: consolidation for [date range]" \
     --body "[PR body as specified in SOUL.md]"
   ```

## Output Format
```
STATUS: done

BRANCH: memory-consolidation/2026-02-18
PR_URL: https://github.com/[org]/[repo]/pull/[number]

SUMMARY: |
  Consolidated 3 days of sessions (2026-02-15 through 2026-02-18).
  
  Memory updates:
  - Added 12 new facts (infrastructure, projects, decisions)
  - Updated 4 facts (API keys, gateway status)
  - Removed 2 stale entries
  - Reorganized "Active Projects" section
  
  Self-reflection:
  - Identified 3 key weaknesses (redundant questions, verbose narration, missed memory searches)
  - Noted 2 strengths to maintain (proactive problem-solving, clear explanations)
  - Proposed 2 AGENTS.md updates and 1 SOUL.md update
  
  Files created:
  - SELF_REFLECTION.md
  - PROPOSED_UPDATES.md
  - MEMORY.md.bak (backup)
```

## Common Pitfalls
- Don't push to main — always use a feature branch
- Don't forget co-author attribution in commits/PR
- Don't apply proposed persona changes directly (needs human approval)
- Don't skip the summary — make it easy for human to review
