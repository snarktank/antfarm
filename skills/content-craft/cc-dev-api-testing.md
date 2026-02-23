---
name: cc-dev-api-testing
description: >-
  Test Content-Craft backend API endpoints locally using the bypass token.
  Use when testing API endpoints, debugging backend responses, checking
  if the API is working, making curl requests to localhost:8000, or when
  user mentions "test the API", "call the endpoint", or "check the backend".
---

# API Testing with Localhost Bypass

## Why This Exists

Local development requires API testing without full authentication. The bypass token skips auth on `localhost:8000` only, enabling rapid endpoint testing during development.

## Quick Start

```bash
curl -H "X-Localhost-Bypass-Token: localhost_dev_bypass_norg_ai_2025_8a5f9c2e4b1d7f3a" \
     http://localhost:8000/api/v1/workspaces
```

## The Token

```
X-Localhost-Bypass-Token: localhost_dev_bypass_norg_ai_2025_8a5f9c2e4b1d7f3a
```

## Common Requests

### GET
```bash
# List workspaces
curl -s -H "X-Localhost-Bypass-Token: localhost_dev_bypass_norg_ai_2025_8a5f9c2e4b1d7f3a" \
     http://localhost:8000/api/v1/workspaces | jq .

# Get specific resource
curl -s -H "X-Localhost-Bypass-Token: localhost_dev_bypass_norg_ai_2025_8a5f9c2e4b1d7f3a" \
     http://localhost:8000/api/v1/workspaces/{id} | jq .
```

### POST
```bash
curl -X POST \
     -H "X-Localhost-Bypass-Token: localhost_dev_bypass_norg_ai_2025_8a5f9c2e4b1d7f3a" \
     -H "Content-Type: application/json" \
     -d '{"name": "Test Workspace"}' \
     http://localhost:8000/api/v1/workspaces
```

### PUT
```bash
curl -X PUT \
     -H "X-Localhost-Bypass-Token: localhost_dev_bypass_norg_ai_2025_8a5f9c2e4b1d7f3a" \
     -H "Content-Type: application/json" \
     -d '{"name": "Updated Name"}' \
     http://localhost:8000/api/v1/workspaces/{id}
```

### DELETE
```bash
curl -X DELETE \
     -H "X-Localhost-Bypass-Token: localhost_dev_bypass_norg_ai_2025_8a5f9c2e4b1d7f3a" \
     http://localhost:8000/api/v1/workspaces/{id}
```

## Debugging Options

| Flag | Use Case |
|------|----------|
| `-s \| jq .` | Pretty-print JSON (default choice) |
| `-i` | See response headers |
| `-v` | Full request/response debug |
| `-w "\n%{http_code}\n"` | Show HTTP status code |

## Health Check (No Token Needed)

```bash
curl http://localhost:8000/health
```

## Troubleshooting

**Backend not running?**
```bash
./start-all.sh
```

**Port 8000 blocked?**
```bash
kill $(lsof -ti:8000)
```

**401 Unauthorized?** Token only works on `localhost:8000`, not other hosts.
