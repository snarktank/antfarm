# New Application Development Workflow

A comprehensive 14-step workflow for building new applications from ideation through launch to post-launch review.

## When to Use This Workflow

Use `new-app-dev` instead of `feature-dev` when:
- **Building from scratch** — Greenfield project, not adding to existing app
- **Need market validation** — Unsure if users want this, need research first
- **New product line** — Launching something entirely new
- **Complex launch requirements** — Need alpha → beta → GA process

## When NOT to Use

Use `feature-dev` instead when:
- Adding features to existing app
- Bug fixes or improvements
- Simple, well-defined scope
- No market research needed

## The 14 Steps

### Phase 1: Discovery & Ideation (Steps 1-4)

| Step | Agent | Output |
|------|-------|--------|
| 1. discover | discoverer | Market analysis, user personas, competitive landscape |
| 2. ideate | product_manager | 5-10 solution concepts, SWOT analysis, chosen concept |
| 3. strategize | strategist | Value prop, success metrics, business case, GTM strategy |
| 4. roadmap | roadmapper | Product roadmap with milestones, RICE-prioritized features |

### Phase 2: Validation (Steps 5-6)

| Step | Agent | Output |
|------|-------|--------|
| 5. prototype | prototyper | MVP prototype (wireframe/clickable/coded) |
| 6. validate | validator | User tests, pivot/persevere/stop decision |

### Phase 3: Foundation (Steps 7-8)

| Step | Agent | Output |
|------|-------|--------|
| 7. setup | setup | Repo initialized, stack chosen, ADRs documented |
| 8. design | designer | Design system, user flows, screen mockups |

### Phase 4: Development (Step 9)

| Step | Agent | Output |
|------|-------|--------|
| 9. implement | developer | MVP codebase, story-driven commits |

### Phase 5: Testing (Steps 10-11)

| Step | Agent | Output |
|------|-------|--------|
| 10. alphatest | alphatester | Test plan, bug reports, alpha signoff |
| 11. betatest | betatester | Beta feedback, triaged issues, launch recommendation |

### Phase 6: Polish & Launch (Steps 12-14)

| Step | Agent | Output |
|------|-------|--------|
| 12. polish | polisher | Performance optimized, edge cases handled, prod ready |
| 13. launchprep | launch_manager | Docs complete, marketing ready, monitoring setup |
| 14. launch | launch_manager | Live in production, post-launch monitoring |

### Phase 7: Review (Step 15)

| Step | Agent | Output |
|------|-------|--------|
| 15. review | reviewer | Metrics comparison, lessons learned, v1.1 roadmap |

## Key Differences from feature-dev

| Aspect | new-app-dev | feature-dev |
|--------|-------------|-------------|
| **Steps** | 15 | 7 |
| **Pre-build phases** | 6 (discover→validate) | 2 (plan→setup) |
| **Testing phases** | 2 (alpha + beta) | 1 (test) |
| **Launch prep** | Dedicated steps | Part of PR |
| **Post-launch** | Full review | None |
| **Story-driven** | Step 9 only | All of implement |
| **Best for** | New apps | Feature additions |

## Usage

```bash
antfarm workflow install new-app-dev
antfarm workflow run new-app-dev "Build a meal planning app for busy parents"
```

## Artifacts

Each phase produces artifacts in its own directory:

```
[project]/
├── research/           # discover
├── product/            # ideate
├── strategy/           # strategize
├── roadmap/            # roadmap
├── prototype/          # prototype
├── validation/         # validate
├── docs/adr/           # setup
├── design/             # design
├── src/                # implement
├── testing/alpha/      # alphatest
├── testing/beta/       # betatest
├── polish/             # polish
├── launch/             # launchprep + launch
└── review/             # review
```

## Success Criteria

Workflow completes successfully when:
- Application deployed and live
- Core features functional
- No critical/blocking bugs
- Documentation complete
- Monitoring in place
- Post-launch review documented

## Roam Integration

The developer agent (step 9) has mandatory Roam requirements:
- Must run `roam map` and `roam weather` before coding
- Must save output to `.roam/` directory
- Referenced findings in implementation

This ensures codebase understanding before development begins.