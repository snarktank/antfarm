#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
echo "ROOT=$ROOT"

# Required paths
test -d "$ROOT/scripts" || { echo "ERROR missing: $ROOT/scripts"; exit 1; }
test -d "$ROOT/config"  || { echo "ERROR missing: $ROOT/config"; exit 1; }
test -f "$ROOT/scripts/antfarm-worker.js" || { echo "ERROR missing: $ROOT/scripts/antfarm-worker.js"; exit 1; }

# Antfarm CLI
test -f "$ROOT/bin/antfarm" || { echo "ERROR missing: $ROOT/bin/antfarm"; exit 1; }
chmod +x "$ROOT/bin/antfarm" 2>/dev/null || true

# Node
command -v node >/dev/null 2>&1 || { echo "ERROR: node not found in PATH"; exit 1; }

# DB dir (don't require DB file yet)
DB="/root/.openclaw/antfarm/antfarm.db"
mkdir -p "$(dirname "$DB")"

echo "OK validate passed"
echo
echo "Antfarm help (first 80 lines):"
"$ROOT/bin/antfarm" --help 2>&1 | head -n 80 || true
