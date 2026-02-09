#!/bin/bash

# ==============================================================================
# Docker Build and Push Script - Project Management App
# ==============================================================================
# This script builds and pushes Docker images to Docker Hub
# Usage: ./docker-build.sh [version]
# Example: ./docker-build.sh 1.0.0
# ==============================================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${GREEN}Docker Build and Push Script${NC}"
echo "======================================"

# Get Docker Hub username from environment variable or prompt
if [ -z "$DOCKER_USERNAME" ]; then
    read -p "Enter your Docker Hub username: " DOCKER_USERNAME
fi

if [ -z "$DOCKER_USERNAME" ]; then
    echo -e "${RED}ERROR: Docker Hub username is required${NC}"
    exit 1
fi

# Get version from argument or use 'latest'
VERSION=${1:-latest}
IMAGE_NAME="${DOCKER_USERNAME}/project-management"
IMAGE_TAG="${IMAGE_NAME}:${VERSION}"

echo ""
echo "Configuration:"
echo "  Docker Hub User: $DOCKER_USERNAME"
echo "  Image Name: $IMAGE_NAME"
echo "  Version: $VERSION"
echo ""

# Login to Docker Hub
echo -e "${BLUE}Logging in to Docker Hub...${NC}"
docker login

# Run tests (optional)
echo ""
echo -e "${BLUE}Running tests...${NC}"
if npm test 2>/dev/null; then
    echo -e "${GREEN}[OK] Tests passed${NC}"
else
    echo -e "${YELLOW}[WARN] Tests failed or not configured - continuing with build${NC}"
fi

# Build Docker image
echo ""
echo -e "${BLUE}Building Docker image...${NC}"
docker build -t "$IMAGE_TAG" .

# Also tag as latest if version is specified
if [ "$VERSION" != "latest" ]; then
    echo -e "${BLUE}Tagging as latest...${NC}"
    docker tag "$IMAGE_TAG" "${IMAGE_NAME}:latest"
fi

echo -e "${GREEN}[OK] Image built successfully${NC}"

# Show image info
echo ""
echo "Image details:"
docker images "$IMAGE_NAME"

# Push to Docker Hub
echo ""
echo -e "${BLUE}Pushing to Docker Hub...${NC}"
docker push "$IMAGE_TAG"

if [ "$VERSION" != "latest" ]; then
    docker push "${IMAGE_NAME}:latest"
fi

echo -e "${GREEN}[OK] Image pushed successfully${NC}"

# Create deployment instructions
echo ""
echo "======================================"
echo -e "${GREEN}Build and Push Completed!${NC}"
echo "======================================"
echo ""
echo "Your image is now available on Docker Hub:"
echo "  $IMAGE_TAG"
if [ "$VERSION" != "latest" ]; then
    echo "  ${IMAGE_NAME}:latest"
fi
echo ""
echo "To run with Docker:"
echo "  docker run -d -p 3000:3000 --env-file .env.docker $IMAGE_TAG"
echo ""
echo "To run with docker-compose:"
echo "  docker-compose up -d"
echo ""
echo "To pull on another machine:"
echo "  docker pull $IMAGE_TAG"
echo ""
