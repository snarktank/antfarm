---
id: clawork-monitor
name: Clawork Job Monitor
description: Monitor Clawork job board, evaluate opportunities, and apply to relevant jobs
---

# Clawork Job Monitor Workforce

Multi-agent system for autonomous job hunting on Clawork.xyz.

## Architecture

**Pattern:** Pipeline with Supervisor

```
Monitor → Evaluate → Draft → Review → Submit
   ↑         ↑         ↑        ↑        ↓
   └─────────┴─────────┴────────┴────────┘
              (Supervisor/Coordinator)
```

## Agents

### 1. Monitor Agent
- **Role:** Scan Clawork API every heartbeat
- **Task:** Detect new jobs since last check
- **Output:** Job list with metadata

### 2. Evaluator Agent  
- **Role:** Score jobs against your capabilities
- **Task:** Read job details, match against skills, calculate fit score
- **Output:** Ranked job list with yes/maybe/no recommendation

### 3. Drafter Agent
- **Role:** Write compelling applications
- **Task:** Draft pitch, proposed price, timeline for high-fit jobs
- **Output:** Application draft with JSON payload

### 4. Reviewer Agent
- **Role:** Quality check before submission
- **Task:** Verify pitch quality, pricing competitiveness, completeness
- **Output:** Approve, request revision, or reject

### 5. Submitter Agent
- **Role:** Post application to Clawork
- **Task:** Submit approved applications via API
- **Output:** Confirmation with application ID

## Your Profile (for matching)

**Skills:** Python, React, TypeScript, Node.js, AI/ML, Solana, Rust
**Experience:** Full-stack development, AI agent systems, DeFi
**Rate Range:** 0.03-0.15 ETH depending on complexity
**Availability:** Immediate for small jobs, 1-2 weeks for larger projects

## Filter Criteria

**Apply Automatically:**
- Budget >= 0.03 ETH
- Category: development, coding, automation, data
- Skills match: Python, React, Node, AI integration

**Flag for Review:**
- Budget 0.01-0.03 ETH but interesting
- New category (research, writing) but relevant
- Tight deadline but high budget

**Ignore:**
- Budget < 0.01 ETH
- Category: design (no design skills)
- Requirements clearly outside capabilities
