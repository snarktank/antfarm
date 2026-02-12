# Antfarm Work Catalog

This catalog defines all task types available in the workforce and their assignment strategies.

## Work Assignment Strategy

Tasks are assigned based on PRIORITY, not agent role. Any idle worker can take on bug-fix tasks.

### Priority 1: Bug Fixes
**Available to: ANY idle workforce member**

Critical issues requiring immediate attention:
- `bug-fix/critical` - Production outages, data loss, security vulnerabilities
- `bug-fix/high` - Major functionality broken, no workaround
- `bug-fix/medium` - Functionality impaired, workaround exists
- `bug-fix/low` - Minor issues, cosmetic problems

**Assignment Rule:** Any idle agent can claim bug-fix tasks regardless of their designated role.

### Priority 2: Feature Development
**Available to: Any idle worker with development capacity**

New features and enhancements:
- `feature-dev/frontend` - UI/UX improvements
- `feature-dev/backend` - API and service enhancements
- `feature-dev/fullstack` - End-to-end feature implementation

### Priority 3: Security & Maintenance
**Available to: Qualified personnel**

Security patches and upkeep:
- `security-audit/vulnerability` - Vulnerability assessment and patching
- `maintenance/dependency` - Dependency updates
- `maintenance/docs` - Documentation improvements

## Task Selection Guidelines

1. **Bug fixes always take precedence** - When a critical bug is pending, any idle developer should prioritize it
2. **Idle means available** - Workers without active tasks are eligible for any priority-1 task
3. **No role gatekeeping** - A feature-dev agent can (and should) take bug-fix tasks when available
4. **Load balancing** - Consider current workload when assigning, prefer less-busy workers

## Priority Resolution

When multiple tasks are pending:
1. All Priority 1 tasks are considered before any Priority 2
2. All Priority 2 tasks are considered before any Priority 3
3. Within each priority, use severity/risk to order
