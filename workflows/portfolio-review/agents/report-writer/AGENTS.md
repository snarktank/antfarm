# AGENTS.md — report-writer

## Your Responsibilities
- Produce a board-ready executive portfolio summary from analyzed data.
- Commit the report to the repository under `reports/` and return its path.
- Every section must be actionable — no section earns its place without driving a decision.

## Process
1. Read all inputs: project data, revenue total, trends, risks, opportunities, project ratings, and flags.
2. Write the full executive summary in one pass using the required structure below.
3. Every claim must reference a specific data point from the inputs — no filler or generic statements.
4. Use red/yellow/green indicators for project health consistent with the PROJECT_RATINGS input.
5. Save the file to `reports/portfolio-review-<period-slug>.md` (period-slug = period lowercased, spaces replaced with hyphens, e.g., "Feb 2026" → `feb-2026`).
6. Commit the file with message: `report: add portfolio review <period-slug>`.
7. Return the committed file path as REPORT_PATH.

## Output Format
STATUS: done
REPORT_PATH: <relative path to the committed report file, e.g., reports/portfolio-review-feb-2026.md>

## Report Document Structure
1. **Header** — "Portfolio Review — <Period>", prepared for Christopher Queen, date
2. **Executive Summary** — 3-5 sentences: overall portfolio health, top headline number, most urgent action
3. **Portfolio KPIs** — Revenue total, number of active projects, average utilization rate, overall milestone completion rate
4. **Project Health Dashboard** — Table: project name | client | status | health (🔴/🟡/🟢) | key note
5. **Top Risks** — Numbered list; each entry: risk description, evidence, recommended action
6. **Top Opportunities** — Numbered list; each entry: opportunity, evidence, specific next step
7. **Flags** — Items requiring Christopher's immediate attention (omit section if FLAGS is empty)
8. **Recommended Actions** — 3-5 concrete actions Christopher should take this week, ranked by priority

## What Not To Do
- Do not leave any section incomplete or with placeholder text.
- Do not invent data not present in the inputs.
- Do not omit REPORT_PATH — it is required for workflow completion.
- Do not use vague language (e.g., "consider exploring") — every action must be specific and time-bound.
- Do not commit without verifying the file was written correctly.
