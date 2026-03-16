# Project Management App

[![Docker Hub](https://img.shields.io/docker/pulls/tiag0ss/project-management?label=Docker%20Pulls&logo=docker)](https://hub.docker.com/r/tiag0ss/project-management)
[![Docker Image](https://img.shields.io/badge/Docker%20Hub-tiag0ss%2Fproject--management-blue?logo=docker)](https://hub.docker.com/r/tiag0ss/project-management)

A full-stack, self-hosted project management application with task tracking, resource planning, time tracking, and multi-tenant organization support.

This project is a work in progress, can be still found bugs, report the bugs in github.

## Features

- 📋 **Project & Task Management** — Kanban boards, task hierarchy (parent/subtasks), dependencies, custom statuses/priorities, clear project/customer context in task details, and quick navigation from tasks to projects
- 📊 **Resource Planning** — Gantt chart with drag-and-drop allocation, user availability tracking, intelligent replanning, better split planning, clearer timeline visualization, and flexible planning even when tasks start with no remaining planned hours
- ⏱️ **Time Tracking** — Daily and weekly timesheet views, per-task time entries, CSV export
- ✅ **Approvals Center** — Team-lead/admin approval flows for time entries and vacations with batch actions
- 🏖️ **Vacations & Holidays** — Annual vacation management, non-working-day-aware requests, and country holiday calendars
- 👥 **Multi-Tenant Organizations** — Multiple organizations, team management, permission groups
- 🔐 **Role-Based Permissions** — Developer, Support, Manager roles with granular permission control
- 🎫 **Ticket System** — Support ticket management with auto-numbering, auto-assignment to default support users, task conversion, Jira integration, and fully customizable per-organization statuses and priorities
- 🌐 **Customer Portal** — Customer-facing overview with ticket/project visibility and constrained ticket creation
- 👤 **Customer Management** — Customer database with organization associations and default support user assignment
- 📞 **Call Records** — Structured call logging with time, participants, notes, and optional task/project linkage
- 🛠️ **Application Lifecycle Management** — Application registry, version control, release management with PDF exports, task-to-release linking
- 🔗 **Jira Integration** — Two-tier Jira system connecting tickets and project boards with external linking and encrypted credentials; linked issue fields are shown only when each integration is enabled
- 📝 **Rich Text Editor** — Tiptap-based editor with formatting, images (inline base64), and markdown support for descriptions and comments
- 📔 **Memos System** — Calendar-based note-taking with visibility controls (Private, Organizations, Public), tags, and rich content
- 🔄 **Recurring Tasks** — Outlook-style recurring time blocks for meetings, standups, and fixed schedules that planning respects
- 📧 **Email Notifications** — SMTP integration; task assignment, status change, priority change, @mention, and due-date reminder emails
- 🔑 **Password Recovery** — Forgot-password flow with temporary email reset links and one-time token validation
- 🚦 **RAG Health Score** — Automatic Red/Amber/Green project health indicator based on overdue tasks, budget burn, and unassigned work
- 🔍 **Global Search** — Cross-entity search with paginated results and direct navigation
- 🌙 **Dark Mode** — Full dark mode support across the entire UI
- 📱 **Responsive Design** — Mobile-friendly interface with grouped top menus and grouped left-sidebar navigation
- 🧙 **Install Wizard** — Guided first-time setup

## Additional Notes

- This README is intentionally concise to comply with Docker Hub overview size limits.
- For complete feature walkthroughs and implementation details, see the source repository docs and in-app pages.
- Core operational setup remains documented below (environment variables, Docker Compose, health checks, and backup/restore).

## Tech Stack

| Component | Technology |
|-----------|------------|
| Frontend | Next.js 16, React 19, TypeScript, Tailwind CSS |
| Rich Text | Tiptap (StarterKit, Image, Placeholder extensions) |
| Backend | Node.js 20, Express.js, TypeScript |
| Database | MySQL 8.0 or MSSQL (SQL Server) |
| Auth | JWT with HTTP-only cookies |
| Integrations | Jira REST API, AES-256-CBC encryption |
| Container | Alpine-based Node.js image |

## Quick Start

### 1. Create environment file

```bash
# Download the example and edit with your values
curl -o .env.docker https://raw.githubusercontent.com/tiag0ss/project-management/main/.env.docker.example
```

Or create `.env.docker` manually.

MySQL example (default):

```env
# Database (MySQL)
DB_PROVIDER=mysql
DB_HOST=mysql
DB_PORT=3306
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

MSSQL example:

```env
# Database (MSSQL)
DB_PROVIDER=mssql
DB_HOST=sqlserver
DB_PORT=1433
DB_USER=sa
DB_PASSWORD=your-strong-password-here
DB_NAME=projectmanagement
DB_CONNECTION_LIMIT=50
DB_ENCRYPT=false
DB_TRUST_SERVER_CERT=true

# JWT Secret (REQUIRED)
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

For MSSQL with Docker Compose, point the app to an external SQL Server (or a SQL Server service in your own compose file) by setting:

```env
DB_PROVIDER=mssql
DB_HOST=your-sqlserver-host
DB_PORT=1433
DB_USER=your-user
DB_PASSWORD=your-password
DB_NAME=projectmanagement
DB_ENCRYPT=false
DB_TRUST_SERVER_CERT=true
```

### 3. Run standalone (with external DB)

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
| `DB_PROVIDER` | No | `mysql` | Database provider (`mysql` or `mssql`) |
| `DB_HOST` | Yes | `mysql` (Docker MySQL) | Database host |
| `DB_USER` | Yes | `appuser` | Database user |
| `DB_PASSWORD` | **Yes** | — | Database password |
| `DB_NAME` | No | `projectmanagement` | Database name |
| `DB_CONNECTION_LIMIT` | No | `50` | Connection pool size |
| `DB_PORT` | No | `3306` (mysql), `1433` (mssql) | Database port |
| `DB_ENCRYPT` | No | `false` | MSSQL TLS encrypt flag |
| `DB_TRUST_SERVER_CERT` | No | `true` | MSSQL trust server certificate |
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
| `/app/uploads` | File attachments (Tasks, Tickets, Projects, Organizations, Customers, Memos) |

**Note:** Rich text editor images are stored as base64 in the database, not in the uploads folder.

## Health Check

The container includes a built-in health check endpoint:

```
GET http://localhost:3000/health
```

## Architecture

This is a **single container** that serves both the Next.js frontend and Express.js API:

```
+----------------------------------+
|   project-management:latest      |
|                                  |
|  +-----------+  +------------+   |
|  | Next.js   |  | Express    |   |
|  | Frontend  |  | API        |   |
|  +-----------+  +------------+   |
|                                  |
|         Port 3000                |
+----------------------------------+
               |
               |
      +--------+--------+
      | MySQL 8 / MSSQL |
      | Port 3306/1433  |
      +-----------------+
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

## Testing

Comprehensive testing scenarios covering all features are available in [TESTING_SCENARIOS.md](TESTING_SCENARIOS.md). The test suite includes:

- **150+ test scenarios** covering all major features
- Authentication & authorization testing
- Feature-specific tests (projects, tasks, tickets, etc.)
- Integration and end-to-end scenarios
- Security testing (SQL injection, XSS, authorization bypass)
- Performance and stress testing
- Browser compatibility testing
- Edge cases and error handling

See the [Testing Scenarios document](TESTING_SCENARIOS.md) for detailed test cases and expected results.

## License

MIT

## Links

- 🐳 [Docker Hub](https://hub.docker.com/r/tiag0ss/project-management)
- 🐛 [Report Issues](https://github.com/tiag0ss/project-management/issues)
- 📖 [Source Code](https://github.com/tiag0ss/project-management)
- 🧪 [Testing Scenarios](https://github.com/Tiag0ss/project-management/blob/main/TESTING_SCENARIOS.md) — Comprehensive test suite with 150+ scenarios
