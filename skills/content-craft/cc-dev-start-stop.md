---
name: cc-dev-start-stop
description: >-
  Start and stop the Content-Craft development environment safely.
  Use when starting the app, restarting services, stopping servers,
  or when user mentions "start dev", "restart", "stop services",
  "servers not working", or "ports blocked".
---

# Start/Stop Development Environment

## Why This Exists

Content-Craft has interdependent services (frontend, backend, workers) with specific port and env var requirements. The shell scripts handle these correctly. Running `npm run dev` directly breaks things.

## Quick Start

```bash
./stop-all.sh && sleep 5 && ./start-all.sh
```

## Individual Commands

### Stop Everything
```bash
./stop-all.sh
```

### Start Everything
```bash
./start-all.sh
```

### Full Restart (Recommended)
```bash
./stop-all.sh && sleep 5 && ./start-all.sh
```

The 5-second delay ensures ports are fully released before restart.

## What It Starts

| Service | Port | Purpose |
|---------|------|---------|
| Frontend (Next.js) | 3000 | Web UI |
| Backend (FastAPI) | 8000 | API server |

## Troubleshooting

**Port still blocked after stop?**
```bash
kill $(lsof -ti:8000)  # Backend
kill $(lsof -ti:3000)  # Frontend
```

**Check what's running:**
```bash
lsof -i:3000,8000
```

## Never Do This

```bash
# DON'T - breaks service dependencies
npm run dev
cd backend && uvicorn main:app
```

Always use the shell scripts.
