# Project Management App

A full-stack, self-hosted project management application with task tracking, resource planning, time tracking, and multi-tenant organization support.

## Features

- 📋 **Project & Task Management** — Kanban boards, task hierarchy (parent/subtasks), dependencies, custom statuses and priorities
- 📊 **Resource Planning** — Gantt chart with drag-and-drop allocation, user availability tracking, intelligent replanning
- ⏱️ **Time Tracking** — Daily and weekly timesheet views, per-task time entries
- 👥 **Multi-Tenant Organizations** — Multiple organizations, team management, permission groups
- 🔐 **Role-Based Permissions** — Developer, Support, Manager roles with granular permission control
- 🎫 **Ticket System** — Support ticket management with auto-numbering and task conversion
- 👤 **Customer Management** — Customer database with organization associations
- 📧 **Email Notifications** — SMTP integration with encrypted credentials
- 🌙 **Dark Mode** — Full dark mode support across the entire UI
- 📱 **Responsive Design** — Mobile-friendly interface
- 🧙 **Install Wizard** — Guided first-time setup

## Tech Stack

| Component | Technology |
|-----------|------------|
| Frontend | Next.js 16, React 19, TypeScript, Tailwind CSS |
| Backend | Node.js 20, Express.js, TypeScript |
| Database | MySQL 8.0 |
| Auth | JWT with HTTP-only cookies |
| Container | Alpine-based Node.js image |

## Quick Start

### 1. Create environment file

```bash
# Download the example and edit with your values
curl -o .env.docker https://raw.githubusercontent.com/YOUR_REPO/main/.env.docker.example
```

Or create `.env.docker` manually:

```env
# Database
DB_HOST=mysql
DB_USER=appuser
DB_PASSWORD=your-strong-password-here
DB_NAME=projectmanagement
DB_CONNECTION_LIMIT=50

# JWT Secret (REQUIRED - generate a strong random key)
# Generate with: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
JWT_SECRET=your-super-secret-jwt-key-minimum-64-characters

# CORS
ALLOWED_ORIGINS=http://localhost:3000,https://yourdomain.com

# Frontend URL
NEXT_PUBLIC_API_URL=http://localhost:3000

# Logging (debug, info, warn, error)
LOG_LEVEL=warn

# API URL (internal)
API_URL=http://localhost:3000
```

### 2. Run with Docker Compose (Recommended)

Download the `docker-compose.yml`:

```yaml
version: '3.8'

services:
  app:
    image: tiag0ss/project-management:latest
    container_name: project-management-app
    env_file:
      - .env.docker
    restart: unless-stopped
    ports:
      - "3000:3000"
    volumes:
      - app-logs:/app/logs
      - app-uploads:/app/uploads
    depends_on:
      mysql:
        condition: service_healthy
    networks:
      - app-network
    healthcheck:
      test: ["CMD", "node", "-e", "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

  mysql:
    image: mysql:8.0
    container_name: project-management-mysql
    restart: unless-stopped
    environment:
      MYSQL_ROOT_PASSWORD: ${DB_PASSWORD}
      MYSQL_DATABASE: ${DB_NAME:-projectmanagement}
      MYSQL_USER: ${DB_USER:-appuser}
      MYSQL_PASSWORD: ${DB_PASSWORD}
    ports:
      - "3306:3306"
    volumes:
      - mysql-data:/var/lib/mysql
    networks:
      - app-network
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  mysql-data:
  app-logs:
  app-uploads:

networks:
  app-network:
    driver: bridge
```

Then start everything:

```bash
docker-compose up -d
```

### 3. Run standalone (with external MySQL)

```bash
docker run -d \
  --name project-management \
  -p 3000:3000 \
  --env-file .env.docker \
  tiag0ss/project-management:latest
```

### 4. First-Time Setup

1. Open `http://localhost:3000` in your browser
2. The **Install Wizard** will guide you through initial setup:
   - Create admin account
   - Configure organization
   - Set up email (optional)
3. Start managing your projects!

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DB_HOST` | Yes | `mysql` | MySQL host |
| `DB_USER` | Yes | `appuser` | MySQL user |
| `DB_PASSWORD` | **Yes** | — | MySQL password |
| `DB_NAME` | No | `projectmanagement` | Database name |
| `DB_CONNECTION_LIMIT` | No | `50` | Connection pool size |
| `JWT_SECRET` | **Yes** | — | Secret key for JWT tokens |
| `ALLOWED_ORIGINS` | No | — | CORS allowed origins (comma-separated) |
| `NEXT_PUBLIC_API_URL` | No | `http://localhost:3000` | Public API URL |
| `API_URL` | No | `http://localhost:3000` | Internal API URL |
| `LOG_LEVEL` | No | `warn` | Log level (debug/info/warn/error) |
| `PORT` | No | `3000` | Application port |

## Ports

| Port | Description |
|------|-------------|
| `3000` | Application (frontend + API) |

## Volumes

| Path | Description |
|------|-------------|
| `/app/logs` | Application log files |
| `/app/uploads` | File attachments and uploads |

## Health Check

The container includes a built-in health check endpoint:

```
GET http://localhost:3000/health
```

## Architecture

This is a **single container** that serves both the Next.js frontend and Express.js API:

```
┌─────────────────────────────────┐
│     project-management:latest   │
│                                 │
│  ┌───────────┐  ┌────────────┐  │
│  │  Next.js  │  │  Express   │  │
│  │  Frontend │  │  API       │  │
│  └───────────┘  └─────┬──────┘  │
│                       │         │
│              Port 3000          │
└───────────────┬─────────────────┘
                │
         ┌──────┴──────┐
         │   MySQL 8   │
         │  Port 3306  │
         └─────────────┘
```

- **Base image**: `node:20-alpine`
- **Runs as**: Non-root user (`nodejs`, UID 1001)
- **Process**: `node dist/server/index.js`

## Updating

```bash
docker-compose pull
docker-compose up -d
```

## Backup

### Database

```bash
docker exec project-management-mysql \
  mysqldump -u root -p"$DB_PASSWORD" projectmanagement > backup.sql
```

### Restore

```bash
docker exec -i project-management-mysql \
  mysql -u root -p"$DB_PASSWORD" projectmanagement < backup.sql
```

## License

MIT

## Links

- 🐛 [Report Issues](https://github.com/tiag0ss/project-management/issues)
- 📖 [Documentation](https://github.com/tiag0ss/project-management)
