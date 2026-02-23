---
name: cc-dev-install-deps
description: >-
  Install Content-Craft dependencies correctly for frontend and backend.
  Use when installing packages, adding dependencies, fixing node_modules,
  or when user mentions "npm install", "install dependencies", "package
  errors", "peer dependency conflict", or "activate venv".
---

# Install Dependencies

## Why This Exists

**Frontend**: Tailwind v4 and shadcn have peer dependency conflicts. The `--legacy-peer-deps` flag is required for every install.

**Backend**: A shared venv at `/home/msexton/venv` prevents version drift across the team. Never create a local venv.

## Quick Start

### Frontend
```bash
npm install --legacy-peer-deps
```

### Backend
```bash
source /home/msexton/venv/bin/activate
```

## Adding New Packages

### Frontend (npm)
```bash
npm install <package> --legacy-peer-deps
```

### Backend (pip)
```bash
source /home/msexton/venv/bin/activate
pip install <package>
```

## Never Do This

```bash
# DON'T - causes peer dependency errors
npm install

# DON'T - creates version drift
python -m venv .venv
pip install -r requirements.txt
```

## Troubleshooting

**Peer dependency errors?**
```bash
rm -rf node_modules package-lock.json
npm install --legacy-peer-deps
```

**Wrong Python packages?**
```bash
source /home/msexton/venv/bin/activate
which python  # Should show /home/msexton/venv/bin/python
```
