# Antfarm installer (from doanbactam fork)
# Usage: iwr -useb https://raw.githubusercontent.com/doanbactam/antfarm/main/scripts/install-from-fork.ps1 | iex

$ErrorActionPreference = "Stop"

$REPO = "https://github.com/doanbactam/antfarm.git"
$DEST = "$env:USERPROFILE\.openclaw\workspace\antfarm"

Write-Host "Installing Antfarm (doanbactam fork)..." -ForegroundColor Cyan

# Clone or pull
if (Test-Path "$DEST\.git") {
    Write-Host "Updating existing install..."
    git -C $DEST pull --ff-only origin main
} else {
    Write-Host "Cloning repository..."
    New-Item -ItemType Directory -Path (Split-Path $DEST) -Force | Out-Null
    git clone $REPO $DEST
}

Set-Location $DEST

# Build
Write-Host "Installing dependencies..."
npm install --no-fund --no-audit

Write-Host "Building..."
npm run build

# Link CLI globally
Write-Host "Linking CLI..."
npm link

# Install workflows
Write-Host "Installing workflows..."
antfarm install

Write-Host ""
Write-Host "Antfarm installed! Run 'antfarm workflow list' to see available workflows." -ForegroundColor Green
