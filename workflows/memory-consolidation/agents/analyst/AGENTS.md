# AGENTS.md — Session Analyst Execution

## Your Role
First agent in the consolidation pipeline. Your output feeds the librarian and reflection agents.

## Tools
- **read** — read session transcript files (*.jsonl)
- **exec** — find transcripts, grep for patterns
- **memory_search** — check what's already in MEMORY.md

## Workflow

1. **Find transcripts:**
   ```bash
   find ~/.openclaw/workspace -name "*.jsonl" -mtime -{{days_back}}
   # or
   ls -t ~/.openclaw/agents/main/sessions/*.jsonl | head -{{days_back}}
   ```

2. **Read recent sessions:**
   - Focus on messages with role: "user" and role: "assistant"
   - Skip system messages and tool results unless they reveal important context
   - Note timestamps for reference

3. **Extract information:**
   - NEW_FACTS: Things not currently in MEMORY.md
   - UPDATED_FACTS: Corrections to existing memory
   - STALE_INFO: What's no longer true
   - PENDING_ITEMS: Unresolved issues

4. **Search existing memory:**
   Use memory_search to check if a fact is already captured
   Only flag as NEW if it's genuinely new

## Output Format
```
STATUS: done

NEW_FACTS: |
  # Infrastructure
  - Antfarm v0.5.1 installed at ~/.openclaw/workspace/antfarm (2026-02-18)
  - Dashboard running at http://192.168.1.219:3333 (accessible on WiFi)
  
  # Projects
  - Content-review workflow created for technical blog post accuracy checking
  - Parmigiana-cli v2 in development (feature-dev workflow #3)

UPDATED_FACTS: |
  # API Keys
  - Gemini API key updated (old key was suspended)
  - Now using: AIzaSyBhXZ7QjKvxA59oG7wrxZn6ho5ILItwKpc

STALE_INFO: |
  - "Group chat not working" - this was still pending as of last memory update
  
PENDING_ITEMS: |
  - Group chat debugging (Telegram group with Brando)
  - Brando's OpenAI token sharing (unresolved CLI paste issue)
  - Xcode skill development (TODO but not started)
```

## Common Pitfalls
- Don't copy verbatim — synthesize and summarize
- Don't include temporary debugging steps
- Don't miss facts mentioned casually in passing
- Don't forget to check if something is already in memory
