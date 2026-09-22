#!/bin/bash

# ==============================================================================
# Production Deployment Script - Myelin
# ==============================================================================
# This script automates the production deployment process
# Run with: ./deploy.sh
# ==============================================================================

set -e  # Exit on any error

echo "🚀 Starting Production Deployment..."
echo "====================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if .env.production exists
if [ ! -f .env.production ]; then
    echo -e "${RED}❌ ERROR: .env.production not found!${NC}"
    echo "Please create .env.production from .env.production.example"
    exit 1
fi

# Check if JWT_SECRET is set
if ! grep -q "^JWT_SECRET=" .env.production || grep -q "REPLACE_WITH_GENERATED_SECRET" .env.production; then
    echo -e "${RED}❌ ERROR: JWT_SECRET not properly configured!${NC}"
    echo "Generate one with: node -e \"console.log(require('crypto').randomBytes(64).toString('hex'))\""
    exit 1
fi

echo -e "${GREEN}✓ Environment configuration verified${NC}"

# Install dependencies
echo ""
echo "📦 Installing production dependencies..."
npm ci --only=production

echo -e "${GREEN}✓ Dependencies installed${NC}"

# Run linter
echo ""
echo "🔍 Running linter..."
npm run lint
echo -e "${GREEN}✓ Linter passed${NC}"

# Run tests
echo ""
echo "🧪 Running tests..."
npm test
echo -e "${GREEN}✓ Tests passed${NC}"

# Build application
echo ""
echo "🔨 Building application..."
npm run build

if [ ! -d "dist/server" ]; then
    echo -e "${RED}❌ ERROR: Server build failed - dist/server not found${NC}"
    exit 1
fi

if [ ! -d ".next" ]; then
    echo -e "${RED}❌ ERROR: Next.js build failed - .next not found${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Build completed successfully${NC}"

# Check if PM2 is installed
if ! command -v pm2 &> /dev/null; then
    echo -e "${YELLOW}⚠ PM2 not found. Installing globally...${NC}"
    npm install -g pm2
fi

# Stop existing PM2 process if running
echo ""
echo "🔄 Checking for existing PM2 processes..."
pm2 describe project-mgmt &> /dev/null && {
    echo "Stopping existing process..."
    pm2 stop project-mgmt
    pm2 delete project-mgmt
} || echo "No existing process found"

# Start with PM2
echo ""
echo "🚀 Starting application with PM2..."

if [ -f "ecosystem.config.json" ]; then
    pm2 start ecosystem.config.json
else
    pm2 start dist/server/index.js --name project-mgmt --env production -i 2
fi

# Save PM2 configuration
pm2 save

echo -e "${GREEN}✓ Application started successfully${NC}"

# Wait a bit for startup
echo ""
echo "⏳ Waiting for application to initialize..."
sleep 5

# Health check
echo ""
echo "🏥 Running health check..."
HEALTH_RESPONSE=$(curl -s http://localhost:3000/health)

if echo "$HEALTH_RESPONSE" | grep -q "healthy"; then
    echo -e "${GREEN}✓ Health check passed${NC}"
    echo "$HEALTH_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$HEALTH_RESPONSE"
else
    echo -e "${RED}❌ Health check failed!${NC}"
    echo "Response: $HEALTH_RESPONSE"
    echo ""
    echo "Checking logs:"
    pm2 logs project-mgmt --lines 20 --nostream
    exit 1
fi

# Show PM2 status
echo ""
echo "📊 PM2 Status:"
pm2 list

echo ""
echo "====================================="
echo -e "${GREEN}🎉 Deployment completed successfully!${NC}"
echo "====================================="
echo ""
echo "📝 Next steps:"
echo "  • View logs: pm2 logs project-mgmt"
echo "  • Monitor: pm2 monit"
echo "  • Restart: pm2 restart project-mgmt"
echo "  • Stop: pm2 stop project-mgmt"
echo ""
echo "🌐 Application URLs:"
echo "  • Health: http://localhost:3000/health"
echo "  • API Docs: http://localhost:3000/api-docs"
echo ""
echo "⚙️  Setup auto-restart on reboot:"
echo "  pm2 startup"
echo "  (then run the command it outputs)"
echo ""
