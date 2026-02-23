# Prompt Management Guide

Complete reference for Content-Craft prompt management system.

## Quick Actions

### Create New Prompt
```bash
# 1. Create migration file
touch db/migrations/XXX_add_my_prompt.sql

# 2. Run migration
source db/.env && psql "$DATABASE_URL" -f db/migrations/XXX_add_my_prompt.sql

# 3. Verify
source db/.env && psql "$DATABASE_URL" -c "SELECT slug, name FROM prompts WHERE slug = 'my-slug';"
```

### Add Step to Flow
```bash
# Run step insertion migration
source db/.env && psql "$DATABASE_URL" -f db/migrations/XXX_insert_step.sql

# Verify flow
source db/.env && psql "$DATABASE_URL" -c "
SELECT step->>'order', step->>'prompt_slug', step->>'output_key'
FROM optimization_flows, jsonb_array_elements(steps) as step
WHERE slug = 'directory-content-optimization'
ORDER BY (step->>'order')::int;"
```

### Update History Label
Edit `apps/api/app/utils/prompt_history_helpers.py`:
```python
elif "my-prompt" in slug_lower:
    return "Category: My Prompt Label"
```

## Key Tables

| Table | Purpose |
|-------|---------|
| `prompts` | Prompt definitions |
| `prompt_variables` | Form fields |
| `optimization_flows` | Step sequences |
| `llm_request_audit` | Execution history |

## Template Syntax

```
{{variable_name}}
```

## Flow ID

Directory Content Optimization: `f0000004-0000-0000-0000-000000000004`

## Full Documentation

See `.claude/skills/cc-prompt-management/` for:
- Database schema details
- Prompt template patterns
- Flow configuration guide
