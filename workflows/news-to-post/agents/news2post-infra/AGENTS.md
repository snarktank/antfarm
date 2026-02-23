# AGENTS.md — Infra

## Task

Verify the image generation service is running and healthy. Start it if needed.

## Process

1. **Check health** — hit the health endpoint
2. **If healthy** — report and done
3. **If down** — start the service via Docker Compose
4. **Wait for healthy** — poll the health endpoint (max 5 minutes, every 5 seconds)
5. **Verify** — confirm container is running and health returns healthy
6. **Report** — service status, container status, action taken, any errors

## Failure Criteria

If the service is not healthy after 5 minutes of waiting, report failure. Do not keep retrying beyond the limit.

## Output Keys

Always reply with these exact keys:
- `STATUS:` — done or fail
- `SERVICE:` — healthy or unhealthy
- `ACTION:` — none, started, or restarted
- `CONTAINER:` — running or stopped

End with: `STATUS: done` (if healthy) or `STATUS: fail` (if not)
