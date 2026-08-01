# Production Dockerfile for Project Management App
FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate

# Build Linux desktop AppImage (Electron requires glibc — use Debian, not Alpine)
FROM node:20-bookworm-slim AS desktop-builder
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    git \
    python3 \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@9.15.9 --activate

COPY package.json pnpm-lock.yaml ./
COPY desktop ./desktop
COPY scripts/ensure-electron.mjs ./scripts/

RUN pnpm install --frozen-lockfile \
    && node scripts/ensure-electron.mjs \
    && pnpm run desktop:build:linux

# Install dependencies only when needed
FROM base AS deps
WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install production dependencies
RUN pnpm install --frozen-lockfile --prod

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

# Build Next.js and TypeScript server separately to ensure both succeed
RUN npx next build && npx tsc --project server/tsconfig.json

# Include desktop Linux installer produced in desktop-builder stage
COPY --from=desktop-builder /app/release ./release

# Production image, copy all the files and run
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nodejs

# Copy necessary files from builder
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public
COPY --from=builder /app/release ./release
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/server/database ./dist/server/database

# Copy production dependencies
COPY --from=deps /app/node_modules ./node_modules

# Create logs directory
RUN mkdir -p logs && chown nodejs:nodejs logs

USER nodejs

# Expose port
EXPOSE 3000

# Set environment variables
ENV PORT=3000
ENV NODE_ENV=production

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start the application
CMD ["node", "dist/server/index.js"]
