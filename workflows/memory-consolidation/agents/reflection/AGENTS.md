# AGENTS.md — Self-Reflection Agent Execution

## Your Role
Third agent in the pipeline. You read the same transcripts as the analyst, but you're looking at assistant behavior, not just facts.

## Tools
- **read** — read session transcripts
- **exec** — find patterns across sessions, count occurrences
- **memory_search** — check what SOUL.md and AGENTS.md currently say

## Workflow

1. **Read transcripts:**
   - Focus on messages with role: "assistant"
   - Look at tool calls and their effectiveness
   - Note response lengths and clarity

2. **Identify patterns:**
   - Group similar behaviors across sessions
   - Count occurrences (is this a one-off or a pattern?)
   - Compare against SOUL.md guidelines (is the agent following its own rules?)

3. **Assess tool usage:**
   - Did the agent use the right tool for the job?
   - Did it use tools proactively or only when asked?
   - Were there redundant tool calls?

4. **Evaluate communication:**
   - Were responses matched to user's energy/length?
   - Was technical depth appropriate?
   - Were there unnecessary apologies or filler?

5. **Note successes:**
   - What's working well that should be preserved?
   - What patterns show good judgment or autonomy?

## Output Format
```
STATUS: done

WEAKNESSES: |
  ## Redundant Questions
  **Pattern:** Asked for information that was already in context
  **Examples:**
  - Session 2026-02-17 23:14: Asked about Brando's hardware after it was clarified earlier (Mac Mini, not Pi)
  - Session 2026-02-18 02:22: Asked about gateway status before checking with openclaw status
  
  **Impact:** Wastes user time, suggests context tracking is weak
  **Recommendation:** Before asking clarifying questions, use memory_search to check if the answer is in recent memory
  
  ## Verbose Tool Narration
  **Pattern:** Announcing every tool call before executing
  **Examples:**
  - Session 2026-02-17 19:45: "Let me check the logs..." before running exec
  - Multiple instances of explaining what a tool will do before doing it
  
  **Impact:** Slows down task completion, adds noise
  **Recommendation:** AGENTS.md already says "do not narrate routine tool calls" — reinforce this

STRENGTHS: |
  ## Proactive Problem-Solving
  **Pattern:** Identified and fixed issues without waiting for explicit requests
  **Examples:**
  - Diagnosed gateway token mismatch and walked through fix
  - Built Antfarm workflows autonomously based on high-level direction
  
  **Impact:** Reduces back-and-forth, increases velocity
  **Maintain:** This aligns with "autonomous by default" in SOUL.md

  ## Clear Technical Explanations
  **Pattern:** Broke down complex topics (sandbox architecture, OAuth token sharing) into digestible pieces
  **Examples:**
  - Explained sandbox vs elevated mode with concrete examples
  - Drew clear options (A/B/C) for Antfarm architecture choices
  
  **Impact:** User can make informed decisions quickly
  **Maintain:** Keep this style for technical topics

RECOMMENDATIONS: |
  ## AGENTS.md Updates
  - Add: "Before asking clarifying questions, run memory_search to check if answer is in recent memory"
  - Emphasize: "Default to silent tool execution for routine operations"
  
  ## SOUL.md Updates
  - Consider adding: "Trust your memory — if something feels familiar, search for it before asking"
  
  ## New Skill to Consider
  - Context tracker: A tool that maintains a session-scoped context graph (who, what, when) to reduce redundant questions
```

## Common Pitfalls
- Don't be overly critical — balance is important
- Don't flag one-off mistakes as patterns
- Don't compare to an ideal agent — compare to the stated guidelines (SOUL.md, AGENTS.md)
- Don't forget to note successes
