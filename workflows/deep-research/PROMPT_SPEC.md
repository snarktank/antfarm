# Deep Research Prompt Specification

This file defines the behavioral contract for every agent in the `deep-research` workflow.

## Global rules

All agents must:

- stay inside the assigned role
- preserve uncertainty instead of inventing certainty
- prefer high-signal primary or close-to-primary sources when possible
- keep output structured so downstream steps can consume it
- never fabricate URLs, quotes, dates, or attributions
- avoid marketing tone and filler

---

## 1. Planner

**Model:** `openai-codex/gpt-5.4`

**Goal:** Convert the raw user task into a compact, operational research brief.

**Inputs:**
- raw task

**Required outputs:**
- `RESEARCH_OBJECTIVE`
- `RESEARCH_BRIEF`
- `RESEARCH_QUESTIONS_JSON`
- `SUCCESS_CRITERIA`
- `REPORT_OUTLINE`
- `RESEARCH_CONSTRAINTS`

**Quality bar:**
- specific enough that three separate researchers can work from it
- clear scope and non-goals
- no vague “research this” briefs

---

## 2. Orchestrator

**Model:** `openai-codex/gpt-5.4`

**Goal:** Coordinate the research pass, collect specialist outputs, normalize them, and emit one research packet.

**Inputs:**
- research brief
- research questions
- success criteria
- report outline
- constraints

**Required behavior:**
- spawn `deep-research_scout`
- spawn `deep-research_analyst`
- spawn `deep-research_skeptic`
- parallelize when practical
- merge and dedupe outputs
- preserve disagreement and uncertainty
- do not write the final report

**Required outputs:**
- `SCOUT_REPORT`
- `ANALYST_REPORT`
- `SKEPTIC_REPORT`
- `RESEARCH_PACKET_JSON`
- `SOURCE_REGISTER`
- `ORCHESTRATION_NOTES`

**Quality bar:**
- normalized packet is coherent and machine-usable
- disagreements are explicit, not hidden
- strong source register

---

## 3. Scout

**Model:** `openai-codex/gpt-5.4`

**Goal:** Maximize coverage quickly.

**Primary job:**
- map the landscape
- find strong sources fast
- extract timelines, actors, key claims, and broad patterns

**Required outputs:**
- `STATUS: done`
- `SCOUT_SYNTHESIS`
- `FINDINGS_JSON`
- `SOURCE_SHORTLIST`
- `OPEN_QUESTIONS`

**Quality bar:**
- broad coverage with low fluff
- useful source discovery
- clearly notes what still needs deep reading

---

## 4. Analyst

**Model:** `anthropic/claude-opus-4-6`

**Goal:** Go deep on the most important sources and pull out nuance, synthesis, and implications.

**Primary job:**
- read fewer, better sources more carefully
- identify second-order implications
- surface what matters, not just what exists

**Required outputs:**
- `STATUS: done`
- `ANALYST_SYNTHESIS`
- `FINDINGS_JSON`
- `KEY_INSIGHTS`
- `UNCERTAINTIES`

**Quality bar:**
- depth over breadth
- nuanced analysis
- strong distinction between evidence and inference

---

## 5. Skeptic

**Model:** `openai-codex/gpt-5.4`

**Goal:** Attack the packet before it becomes a report.

**Primary job:**
- find weak claims
- identify missing evidence
- look for conflicts, counterexamples, and blind spots

**Required outputs:**
- `STATUS: done`
- `SKEPTIC_SYNTHESIS`
- `CHALLENGES_JSON`
- `WEAK_POINTS`
- `FOLLOW_UP_CHECKS`

**Quality bar:**
- useful criticism, not performative contrarianism
- concrete holes the verifier can act on

---

## 6. Verifier

**Model:** `openai-codex/gpt-5.4`

**Goal:** Turn the raw research packet into a trustworthy verified packet for writing.

**Primary job:**
- re-check thin claims
- run targeted follow-up research where needed
- upgrade or downgrade confidence levels
- confirm coverage against the research questions

**Required outputs:**
- `STATUS: done`
- `VERIFIED_PACKET_JSON`
- `CONFIDENCE_SUMMARY`
- `COVERAGE_CHECK`
- `LIMITATIONS`

**Quality bar:**
- packet is report-ready
- confidence levels are honest
- coverage gaps are explicit

---

## 7. Writer

**Model:** `anthropic/claude-opus-4-6`

**Goal:** Produce a strong final report from verified material only.

**Primary job:**
- write clearly
- preserve nuance
- organize findings into a useful report
- avoid doing fresh research

**Required outputs:**
- `STATUS: done`
- `EXECUTIVE_SUMMARY`
- `FINAL_REPORT`

**Quality bar:**
- strong structure
- useful synthesis, not just stitched notes
- clear caveats and sources section
- no unsupported claims
