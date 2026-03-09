# Antfarm installer for Windows
# Usage: powershell -ExecutionPolicy Bypass -Command "iwr -useb https://raw.githubusercontent.com/snarktank/antfarm/v0.5.1/scripts/install.ps1 | iex"

$ErrorActionPreference = "Stop"

$REPO = "https://github.com/snarktank/antfarm.git"
$DEST = "$env:USERPROFILE\.openclaw\workspace\antfarm"

Write-Host "Installing Antfarm..." -ForegroundColor Green

# Check if git is installed
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Host "Error: Git is not installed. Please install Git from https://git-scm.com/download/win" -ForegroundColor Red
    exit 1
}

# Check if node is installed
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "Error: Node.js is not installed. Please install Node.js from https://nodejs.org/" -ForegroundColor Red
    exit 1
}

# Check node version
$nodeVersion = node --version
Write-Host "Found Node.js $nodeVersion" -ForegroundColor Cyan

# Clone or pull
if (Test-Path "$DEST\.git") {
    Write-Host "Updating existing install..." -ForegroundColor Yellow
    Set-Location $DEST
    git pull --ff-only origin main
} else {
    Write-Host "Cloning repository..." -ForegroundColor Yellow
    git clone $REPO $DEST
}

Set-Location $DEST

# Build
Write-Host "Installing dependencies..." -ForegroundColor Yellow
npm install --no-fund --no-audit

Write-Host "Building..." -ForegroundColor Yellow
npm run build:windows

# Link CLI globally
Write-Host "Linking CLI..." -ForegroundColor Yellow
npm link

# Install workflows
Write-Host "Installing workflows..." -ForegroundColor Yellow
antfarm install

Write-Host ""
Write-Host "Antfarm installed successfully!" -ForegroundColor Green
Write-Host "Run 'antfarm workflow list' to see available workflows." -ForegroundColor Cyan
