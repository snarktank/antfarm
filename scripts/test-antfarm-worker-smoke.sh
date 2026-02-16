#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG="/var/log/antfarm/worker.log"

mkdir -p /var/log/antfarm
touch "$LOG" || true

echo "== smoke test =="
echo "ROOT=$ROOT"

if [[ ! -f "$ROOT/scripts/antfarm-worker.cjs" ]]; then
  echo "Missing worker script: $ROOT/scripts/antfarm-worker.cjs"
  exit 1
fi

# Basic checks
command -v node >/dev/null 2>&1 || { echo "ERROR: node not found"; exit 1; }
[[ -f "$ROOT/bin/antfarm" ]] || { echo "ERROR: missing $ROOT/bin/antfarm"; exit 1; }

echo
echo "== worker dry-run =="
node "$ROOT/scripts/antfarm-worker.cjs" --log "$LOG" --dry-run

echo
echo "SMOKE TEST PASSED"
tail -n 50 "$LOG" || true
