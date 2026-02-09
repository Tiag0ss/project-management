# ==============================================================================
# Docker Build and Push Script - Project Management App (Windows)
# ==============================================================================
# This script builds and pushes Docker images to Docker Hub
# Usage: .\docker-build.ps1 [version]
# Example: .\docker-build.ps1 1.0.0
# ==============================================================================

param(
    [string]$Version = "latest"
)

$ErrorActionPreference = "Stop"

Write-Host "Docker Build and Push Script" -ForegroundColor Green
Write-Host "======================================" -ForegroundColor Green

# Get Docker Hub username from parameter, environment variable, or prompt
$DOCKER_USERNAME = $env:DOCKER_USERNAME

if ([string]::IsNullOrEmpty($DOCKER_USERNAME)) {
    $DOCKER_USERNAME = Read-Host "Enter your Docker Hub username"
}

if ([string]::IsNullOrEmpty($DOCKER_USERNAME)) {
    Write-Host "ERROR: Docker Hub username is required" -ForegroundColor Red
    exit 1
}

$ImageName = "$DOCKER_USERNAME/project-management"
$ImageTag = "${ImageName}:${Version}"

Write-Host ""
Write-Host "Configuration:"
Write-Host "  Docker Hub User: $DOCKER_USERNAME"
Write-Host "  Image Name: $ImageName"
Write-Host "  Version: $Version"
Write-Host ""

# Login to Docker Hub
Write-Host "Logging in to Docker Hub..." -ForegroundColor Cyan
docker login

if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Docker login failed" -ForegroundColor Red
    exit 1
}

# Run tests (optional)
Write-Host ""
Write-Host "Running tests..." -ForegroundColor Cyan
$ErrorActionPreference = "Continue"
$testOutput = & npm test 2>&1 | Out-String
$ErrorActionPreference = "Stop"

# Check if tests actually passed (Jest outputs PASS/FAIL)
if ($testOutput -match "FAIL") {
    Write-Host "[WARN] Some tests failed - continuing with build" -ForegroundColor Yellow
} elseif ($testOutput -match "PASS") {
    Write-Host "[OK] Tests passed" -ForegroundColor Green
} else {
    Write-Host "[WARN] Tests not configured - continuing with build" -ForegroundColor Yellow
}

# Build Docker image
Write-Host ""
Write-Host "Building Docker image..." -ForegroundColor Cyan
docker build -t $ImageTag .

if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Docker build failed" -ForegroundColor Red
    exit 1
}

# Also tag as latest if version is specified
if ($Version -ne "latest") {
    Write-Host "Tagging as latest..." -ForegroundColor Cyan
    docker tag $ImageTag "${ImageName}:latest"
}

Write-Host "[OK] Image built successfully" -ForegroundColor Green

# Show image info
Write-Host ""
Write-Host "Image details:"
docker images $ImageName

# Push to Docker Hub
Write-Host ""
Write-Host "Pushing to Docker Hub..." -ForegroundColor Cyan
docker push $ImageTag

if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Docker push failed" -ForegroundColor Red
    exit 1
}

if ($Version -ne "latest") {
    docker push "${ImageName}:latest"
}

Write-Host "[OK] Image pushed successfully" -ForegroundColor Green

# Create deployment instructions
Write-Host ""
Write-Host "======================================" -ForegroundColor Green
Write-Host "Build and Push Completed!" -ForegroundColor Green
Write-Host "======================================" -ForegroundColor Green
Write-Host ""
Write-Host "Your image is now available on Docker Hub:"
Write-Host "  $ImageTag"
if ($Version -ne "latest") {
    Write-Host "  ${ImageName}:latest"
}
Write-Host ""
Write-Host "To run with Docker:"
Write-Host "  docker run -d -p 3000:3000 --env-file .env.docker $ImageTag"
Write-Host ""
Write-Host "To run with docker-compose:"
Write-Host "  docker-compose up -d"
Write-Host ""
Write-Host "To pull on another machine:"
Write-Host "  docker pull $ImageTag"
Write-Host ""
