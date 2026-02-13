#!/usr/bin/env bash
set -euo pipefail

# Antfarm installer
# Usage: curl -fsSL https://raw.githubusercontent.com/snarktank/antfarm/main/scripts/install.sh | bash

REPO="https://github.com/snarktank/antfarm.git"
DEST="${HOME}/.openclaw/workspace/antfarm"

echo "Installing Antfarm..."

# Clone or pull
if [ -d "$DEST/.git" ]; then
  echo "Updating existing install..."
  git -C "$DEST" pull --ff-only origin main
else
  echo "Cloning repository..."
  git clone "$REPO" "$DEST"
fi

cd "$DEST"

# Build
echo "Installing dependencies..."
npm install --no-fund --no-audit

echo "Building..."
npm run build

# Link CLI globally
echo "Linking CLI..."
npm link

# Install workflows — use linked CLI or fall back to direct node
ANTFARM="$(command -v antfarm 2>/dev/null || echo "")"
if [ -z "$ANTFARM" ]; then
  ANTFARM="node $DEST/dist/cli/cli.js"
fi

echo "Installing workflows..."
$ANTFARM install

echo ""
echo "Antfarm installed! Run 'antfarm workflow list' to see available workflows."
