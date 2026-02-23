---
name: 'cc-dev-database-query'
description: 'Reference guide for querying the Content-Craft PostgreSQL database'
---

# Database Query Reference

This command provides the correct syntax for querying the Content-Craft PostgreSQL database.

## Correct Query Syntax

**ALWAYS use this format:**

```bash
source /home/developer/norg/content-craft/db/.env && PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -d "$DB_NAME" -U "$DB_USER" -c "YOUR_SQL_HERE"
```

### Breaking down the command:

| Part | Purpose |
|------|---------|
| `source /home/developer/norg/content-craft/db/.env` | Load database credentials into environment |
| `PGPASSWORD="$DB_PASSWORD"` | Pass password to psql (avoids password prompt) |
| `-h "$DB_HOST"` | Hostname (aws-0-ap-southeast-1.pooler.supabase.com) |
| `-p "$DB_PORT"` | Port (5432) |
| `-d "$DB_NAME"` | Database name (postgres) |
| `-U "$DB_USER"` | Username |
| `-c "SQL"` | SQL command to execute |

## Common Mistakes to Avoid

### WRONG - Using connection string format
```bash
# DON'T DO THIS
PGPASSWORD="$DB_PASSWORD" psql "host=$DB_HOST port=$DB_PORT dbname=$DB_NAME user=$DB_USER sslmode=require" -c "..."
```

### WRONG - Missing individual flag parameters
```bash
# DON'T DO THIS
psql -h "$DB_HOST" -c "..."  # Missing -p, -d, -U flags
```

### CORRECT - Using individual flags
```bash
source /home/developer/norg/content-craft/db/.env && PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -d "$DB_NAME" -U "$DB_USER" -c "SELECT 1"
```

## Example Queries

### List all tables
```bash
source /home/developer/norg/content-craft/db/.env && PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -d "$DB_NAME" -U "$DB_USER" -c "\dt"
```

### Describe a table's columns
```bash
source /home/developer/norg/content-craft/db/.env && PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -d "$DB_NAME" -U "$DB_USER" -c "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'your_table_name' ORDER BY ordinal_position"
```

### Simple SELECT query
```bash
source /home/developer/norg/content-craft/db/.env && PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -d "$DB_NAME" -U "$DB_USER" -c "SELECT id, name FROM workspaces LIMIT 5"
```

### Query with WHERE clause
```bash
source /home/developer/norg/content-craft/db/.env && PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -d "$DB_NAME" -U "$DB_USER" -c "SELECT * FROM users WHERE email LIKE '%example.com'"
```

### Count records
```bash
source /home/developer/norg/content-craft/db/.env && PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -d "$DB_NAME" -U "$DB_USER" -c "SELECT COUNT(*) FROM content"
```

## SSL Mode

If SSL is required, add `sslmode=require` as a parameter:
```bash
source /home/developer/norg/content-craft/db/.env && PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -d "$DB_NAME" -U "$DB_USER" -c "SELECT 1" "sslmode=require"
```

Or use the PGSSLMODE environment variable:
```bash
source /home/developer/norg/content-craft/db/.env && PGPASSWORD="$DB_PASSWORD" PGSSLMODE=require psql -h "$DB_HOST" -p "$DB_PORT" -d "$DB_NAME" -U "$DB_USER" -c "SELECT 1"
```

## Interactive Mode

For multiple queries or exploration, connect without `-c`:
```bash
source /home/developer/norg/content-craft/db/.env && PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -d "$DB_NAME" -U "$DB_USER"
```

Then you can run queries interactively and exit with `\q`.

## Environment Variables Reference

The `db/.env` file contains:
- `DB_HOST` - Database host
- `DB_PORT` - Database port (typically 5432)
- `DB_NAME` - Database name
- `DB_USER` - Database username
- `DB_PASSWORD` - Database password

## Quick Copy Template

Copy this and replace the SQL:
```bash
source /home/developer/norg/content-craft/db/.env && PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -d "$DB_NAME" -U "$DB_USER" -c "YOUR_SQL_HERE"
```
