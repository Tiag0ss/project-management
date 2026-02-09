# ==============================================================================
# Production Deployment Script - Project Management App (Windows)
# ==============================================================================
# This script automates the production deployment process on Windows
# Run with: .\deploy.ps1
# ==============================================================================

$ErrorActionPreference = "Stop"

Write-Host "Starting Production Deployment..." -ForegroundColor Green
Write-Host "=====================================" -ForegroundColor Green

# Check if .env.production exists
if (-not (Test-Path .env.production)) {
    Write-Host "ERROR: .env.production not found!" -ForegroundColor Red
    Write-Host "Please create .env.production from .env.production.example" -ForegroundColor Yellow
    exit 1
}

# Check if JWT_SECRET is set
$envContent = Get-Content .env.production -Raw
if ($envContent -notmatch "^JWT_SECRET=" -or $envContent -match "REPLACE_WITH_GENERATED_SECRET") {
    Write-Host "ERROR: JWT_SECRET not properly configured!" -ForegroundColor Red
    Write-Host "Generate one with: node -e ""console.log(require('crypto').randomBytes(64).toString('hex'))""" -ForegroundColor Yellow
    exit 1
}

Write-Host "[OK] Environment configuration verified" -ForegroundColor Green

# Install dependencies
Write-Host ""
Write-Host "Installing production dependencies..." -ForegroundColor Cyan
npm ci --only=production

Write-Host "[OK] Dependencies installed" -ForegroundColor Green

# Run linter
Write-Host ""
Write-Host "Running linter..." -ForegroundColor Cyan
npm run lint
Write-Host "[OK] Linter passed" -ForegroundColor Green

# Run tests
Write-Host ""
Write-Host "Running tests..." -ForegroundColor Cyan
npm test
Write-Host "[OK] Tests passed" -ForegroundColor Green

# Build application
Write-Host ""
Write-Host "Building application..." -ForegroundColor Cyan
npm run build

if (-not (Test-Path "dist\server")) {
    Write-Host "ERROR: Server build failed - dist\server not found" -ForegroundColor Red
    exit 1
}

if (-not (Test-Path ".next")) {
    Write-Host "ERROR: Next.js build failed - .next not found" -ForegroundColor Red
    exit 1
}

Write-Host "[OK] Build completed successfully" -ForegroundColor Green

# Check if PM2 is installed
$pm2Installed = Get-Command pm2 -ErrorAction SilentlyContinue
if (-not $pm2Installed) {
    Write-Host "WARNING: PM2 not found. Installing globally..." -ForegroundColor Yellow
    npm install -g pm2
}

# Stop existing PM2 process if running
Write-Host ""
Write-Host "Checking for existing PM2 processes..." -ForegroundColor Cyan
$existingProcess = pm2 describe project-mgmt 2>$null
if ($existingProcess) {
    Write-Host "Stopping existing process..." -ForegroundColor Yellow
    pm2 stop project-mgmt
    pm2 delete project-mgmt
} else {
    Write-Host "No existing process found" -ForegroundColor Gray
}

# Start with PM2
Write-Host ""
Write-Host "Starting application with PM2..." -ForegroundColor Cyan

if (Test-Path "ecosystem.config.json") {
    pm2 start ecosystem.config.json
} else {
    pm2 start dist/server/index.js --name project-mgmt --env production -i 2
}

# Save PM2 configuration
pm2 save

Write-Host "[OK] Application started successfully" -ForegroundColor Green

# Wait for startup
Write-Host ""
Write-Host "Waiting for application to initialize..." -ForegroundColor Cyan
Start-Sleep -Seconds 5

# Health check
Write-Host ""
Write-Host "Running health check..." -ForegroundColor Cyan
try {
    $healthResponse = Invoke-RestMethod -Uri "http://localhost:3000/health" -Method Get
    if ($healthResponse.status -eq "healthy") {
        Write-Host "[OK] Health check passed" -ForegroundColor Green
        $healthResponse | ConvertTo-Json
    } else {
        Write-Host "ERROR: Health check failed!" -ForegroundColor Red
        $healthResponse | ConvertTo-Json
        pm2 logs project-mgmt --lines 20 --nostream
        exit 1
    }
} catch {
    Write-Host "ERROR: Health check failed!" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    pm2 logs project-mgmt --lines 20 --nostream
    exit 1
}

# Show PM2 status
Write-Host ""
Write-Host "PM2 Status:" -ForegroundColor Cyan
pm2 list

Write-Host ""
Write-Host "=====================================" -ForegroundColor Green
Write-Host "Deployment completed successfully!" -ForegroundColor Green
Write-Host "=====================================" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  - View logs: pm2 logs project-mgmt"
Write-Host "  - Monitor: pm2 monit"
Write-Host "  - Restart: pm2 restart project-mgmt"
Write-Host "  - Stop: pm2 stop project-mgmt"
Write-Host ""
Write-Host "Application URLs:" -ForegroundColor Cyan
Write-Host "  - Health: http://localhost:3000/health"
Write-Host "  - API Docs: http://localhost:3000/api-docs"
Write-Host ""
Write-Host "Setup auto-restart on reboot:" -ForegroundColor Cyan
Write-Host "  pm2 startup"
Write-Host "  (then run the command it outputs)"
Write-Host ""
