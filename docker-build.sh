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

# Preflight: Docker daemon reachable (common Linux issue after joining docker group)
if ! docker info >/dev/null 2>&1; then
    echo -e "${RED}ERROR: Cannot connect to the Docker daemon${NC}"
    echo ""

    if getent group docker >/dev/null 2>&1 && id -nG "$USER" 2>/dev/null | grep -qw docker; then
        echo -e "${YELLOW}You are in the docker group but this shell session does not have it yet.${NC}"
        echo "Run one of:"
        echo "  newgrp docker          # refresh group in this terminal (bash/zsh)"
        echo "  sg docker -c \"\$0 $*\"  # run this script with docker group (works in fish too)"
        echo "  # or open a new terminal / log out and back in"
    elif getent group docker >/dev/null 2>&1 && grep -q "^docker:.*\b${USER}\b" /etc/group 2>/dev/null; then
        echo -e "${YELLOW}You were added to the docker group but this shell was opened before that.${NC}"
        echo "Open a new terminal, or run:"
        echo "  sg docker -c \"./docker-build.sh${1:+ $1}\""
    else
        echo "On Linux, try:"
        echo "  sudo systemctl start docker"
        echo "  sudo usermod -aG docker \$USER   # then open a new terminal"
    fi

    if ! systemctl is-active --quiet docker 2>/dev/null; then
        echo ""
        echo -e "${YELLOW}Docker service is not running. Start it with:${NC}"
        echo "  sudo systemctl start docker"
    fi

    echo ""
    if [[ "$(pwd)" == /run/media/* ]] || [[ "$(df -T . 2>/dev/null | tail -1)" == *ntfs* ]]; then
        echo -e "${YELLOW}Note: this project is on an NTFS/external drive.${NC}"
        echo "Even with Docker working, builds from NTFS often fail."
        echo "Copy to a native Linux path first, e.g.:"
        echo "  rsync -a --exclude node_modules --exclude .next --exclude dist . ~/project-management/"
        echo "  cd ~/project-management && ./docker-build.sh"
    fi
    exit 1
fi

# Warn when building from NTFS/FUSE mounts (Docker daemon may fail reading the context)
FS_TYPE="$(df -T . 2>/dev/null | awk 'NR==2 {print $2}')"
if [[ "$(pwd)" == /run/media/* ]] || [[ "$FS_TYPE" == ntfs* ]] || [[ "$FS_TYPE" == fuse* ]]; then
    echo -e "${YELLOW}[WARN] Building from $FS_TYPE at $(pwd)${NC}"
    echo -e "${YELLOW}       If the build fails with tar/pipe errors, copy the project to an ext4 path first.${NC}"
    echo ""
fi

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
if ! docker login; then
    echo -e "${RED}ERROR: Docker login failed${NC}"
    exit 1
fi

# Run tests (optional)
echo ""
echo -e "${BLUE}Running tests...${NC}"
TEST_OUTPUT="$(npm test 2>&1)" || TEST_EXIT=$?
if [[ "${TEST_OUTPUT:-}" == *"FAIL"* ]]; then
    echo -e "${YELLOW}[WARN] Some tests failed - continuing with build${NC}"
elif [[ "${TEST_OUTPUT:-}" == *"PASS"* ]]; then
    echo -e "${GREEN}[OK] Tests passed${NC}"
else
    echo -e "${YELLOW}[WARN] Tests failed or not configured - continuing with build${NC}"
fi

# Build and push (buildx + provenance matches Docker Desktop on Windows)
echo ""
echo -e "${BLUE}Building and pushing Docker image...${NC}"

build_with_buildx() {
    local -a tags=(-t "$IMAGE_TAG")
    if [ "$VERSION" != "latest" ]; then
        tags+=(-t "${IMAGE_NAME}:latest")
    fi

    # Ensure a buildx builder exists (creates Image Index + provenance attestation on push)
    if ! docker buildx inspect --bootstrap >/dev/null 2>&1; then
        echo -e "${BLUE}Creating buildx builder...${NC}"
        docker buildx create --name project-management-builder --use --bootstrap >/dev/null
    fi

    docker buildx build \
        "${tags[@]}" \
        --push \
        --provenance=true \
        .
}

if docker buildx version >/dev/null 2>&1; then
    if ! build_with_buildx; then
        echo -e "${RED}ERROR: Docker build/push failed${NC}"
        exit 1
    fi
else
    echo -e "${YELLOW}[WARN] docker buildx not installed — output will differ from Docker Desktop${NC}"
    echo -e "${YELLOW}       Windows creates 3 registry entries (index + image + attestation).${NC}"
    echo -e "${YELLOW}       Install buildx for the same result: sudo pacman -S docker-buildx${NC}"
    echo ""
    DOCKER_BUILDKIT=0 docker build -t "$IMAGE_TAG" .

    if [ "$VERSION" != "latest" ]; then
        echo -e "${BLUE}Tagging as latest...${NC}"
        docker tag "$IMAGE_TAG" "${IMAGE_NAME}:latest"
    fi

    echo -e "${GREEN}[OK] Image built successfully${NC}"
    echo ""
    echo "Image details:"
    docker images "$IMAGE_NAME"

    echo ""
    echo -e "${BLUE}Pushing to Docker Hub...${NC}"
    if ! docker push "$IMAGE_TAG"; then
        echo -e "${RED}ERROR: Docker push failed${NC}"
        exit 1
    fi

    if [ "$VERSION" != "latest" ]; then
        docker push "${IMAGE_NAME}:latest"
    fi
fi

echo -e "${GREEN}[OK] Image built and pushed successfully${NC}"

# Show local image info when buildx was used (--push does not populate local docker images)
if docker buildx version >/dev/null 2>&1; then
    echo ""
    echo "Registry tags pushed:"
    echo "  $IMAGE_TAG"
    if [ "$VERSION" != "latest" ]; then
        echo "  ${IMAGE_NAME}:latest"
    fi
else
    echo ""
    echo "Image details:"
    docker images "$IMAGE_NAME"
fi

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
