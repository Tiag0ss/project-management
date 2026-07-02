# Project Management App

[![Docker Hub](https://img.shields.io/docker/pulls/tiag0ss/project-management?label=Docker%20Pulls&logo=docker)](https://hub.docker.com/r/tiag0ss/project-management)
[![Docker Image](https://img.shields.io/badge/Docker%20Hub-tiag0ss%2Fproject--management-blue?logo=docker)](https://hub.docker.com/r/tiag0ss/project-management)

A full-stack, self-hosted project management application with task tracking, resource planning, time tracking, and multi-tenant organization support.

This project is a work in progress — bugs may still be found; please report them on GitHub.

## Features

- 📋 **Project & Task Management** — Kanban boards, Gantt view, task hierarchy (parent/subtasks), dependencies, custom statuses/priorities/types with Lucide icons, and quick navigation between tasks and projects
- 📊 **Resource Planning** — Gantt chart with drag-and-drop allocation, user availability tracking, intelligent replanning, recurring blocks, Outlook calendar overlay (loads in background), and split planning
- ⏱️ **Time Tracking** — Daily and weekly timesheet views, per-task time entries, timers, CSV export
- ✅ **Approvals Center** — Team-lead/admin approval flows for time entries and vacations with batch actions
- 🏖️ **Vacations & Holidays** — Annual vacation management, out-of-office requests, non-working-day-aware requests, and country holiday calendars
- 👥 **Multi-Tenant Organizations** — Multiple organizations, team management, permission groups
- 🔐 **Role-Based Permissions** — Developer, Support, Manager roles with granular permission control
- 🎫 **Ticket System** — Support ticket management with auto-numbering, auto-assignment, task conversion, Jira integration, and per-organization statuses/priorities
- 🌐 **Customer Portal** — Customer-facing overview with ticket/project visibility and constrained ticket creation
- 👤 **Customer Management** — Customer database with organization associations and default support user assignment
- 📞 **Call Records** — Structured call logging with time, participants, notes, and optional task/project linkage
- 🛠️ **Application Lifecycle Management** — Application registry, version control, release management with PDF exports, task-to-release linking
- 🔗 **Integrations** — Jira, GitHub, Gitea, and Outlook calendar (Microsoft Graph); credentials encrypted at rest
- 📬 **Outlook Email Task Queue** — Route emails via Cloudflare Email Routing to a per-user queue; import as tasks from the project UI ([setup guide](cloudflare/README.md))
- 📧 **Outlook Add-in** — Create tasks from Outlook desktop/web ([outlook-addin/README.md](outlook-addin/README.md))
- 🔑 **API Tokens** — Personal `pt_...` tokens for webhooks, Workers, and integrations (Profile → API Tokens)
- 📝 **Rich Text Editor** — Tiptap-based editor with formatting, images (inline base64), and markdown support
- 📔 **Memos System** — Calendar-based notes with visibility controls (Private, Organizations, Public), tags, and rich content
- 🔄 **Recurring Tasks** — Outlook-style recurring time blocks for meetings, standups, and fixed schedules
- 📧 **Email Notifications** — SMTP integration; assignment, status/priority change, @mention, and due-date reminders
- 🔑 **Password Recovery** — Forgot-password flow with temporary email reset links
- 🚦 **RAG Health Score** — Automatic Red/Amber/Green project health indicator
- 📈 **Dashboard KPIs & Statistics** — Configurable widgets and aggregate reporting
- 🔍 **Global Search** — Cross-entity search with paginated results
- 🔔 **Real-Time Updates** — Socket.io notifications and live UI refresh
- 🌙 **Dark Mode** — Full dark mode support across the UI
- 📱 **Responsive Design** — Mobile-friendly interface with grouped navigation
- 🖥️ **Desktop App** — Optional Electron wrapper (`npm run desktop:dev`)
- 🧙 **Install Wizard** — Guided first-time setup
- ⚡ **Optional Redis Cache** — Read-through cache with invalidate-on-write for faster loads; disabled by default

## Additional Notes

- This README is intentionally concise to comply with Docker Hub overview size limits.
- For feature walkthroughs and conventions, see [AGENTS.md](AGENTS.md), [docs/FEATURES.md](docs/FEATURES.md), and the in-app user manual at `/docs`.
- API documentation (Swagger): `http://localhost:3000/api-docs` when the server is running.

## Tech Stack

| Component | Technology |
|-----------|------------|
| Frontend | Next.js 16, React 19, TypeScript, Tailwind CSS, Lucide icons |
| Rich Text | Tiptap (StarterKit, Image, Placeholder extensions) |
| Backend | Node.js 20, Express.js, TypeScript |
| Database | MySQL 8.0 or MSSQL (SQL Server) — portable SQL via `server/config/database.ts` |
| Cache (optional) | Redis 7 (`ioredis`), disabled when `REDIS_ENABLED=false` |
| Auth | JWT + personal API tokens (`pt_...`) |
| Real-time | Socket.io |
| Integrations | Jira / GitHub / Gitea REST APIs, Microsoft Graph (Outlook), AES-256-CBC encryption |
| Container | Alpine-based Node.js image |

## Local Development

```bash
git clone https://github.com/tiag0ss/project-management.git
cd project-management
npm install
cp .env.example .env
# Edit .env (database, JWT_SECRET, etc.)
```

Run the API and frontend in **two terminals**:

```bash
# Terminal 1 — Express API (port 3000)
npm run dev

# Terminal 2 — Next.js dev server
npm run dev:next
```

Open `http://localhost:3000`, complete the install wizard on first run, then sign in.

Optional desktop shell:

```bash
npm run desktop:dev
```

Run tests:

```bash
npm test
```

## Quick Start (Docker)

### 1. Create environment file

```bash
cp .env.docker.example .env.docker
# Edit .env.docker with your values
```

MySQL example (default):

```env
DB_PROVIDER=mysql
DB_HOST=mysql
DB_PORT=3306
DB_USER=appuser
DB_PASSWORD=your-strong-password-here
DB_NAME=projectmanagement
DB_CONNECTION_LIMIT=50

JWT_SECRET=your-super-secret-jwt-key-minimum-64-characters
ALLOWED_ORIGINS=http://localhost:3000,https://yourdomain.com
NEXT_PUBLIC_API_URL=http://localhost:3000
API_URL=http://localhost:3000
LOG_LEVEL=warn
```

MSSQL example:

```env
DB_PROVIDER=mssql
DB_HOST=your-sqlserver-host
DB_PORT=1433
DB_USER=sa
DB_PASSWORD=your-strong-password-here
DB_NAME=projectmanagement
DB_CONNECTION_LIMIT=50
DB_ENCRYPT=false
DB_TRUST_SERVER_CERT=true

JWT_SECRET=your-super-secret-jwt-key-minimum-64-characters
ALLOWED_ORIGINS=http://localhost:3000
NEXT_PUBLIC_API_URL=http://localhost:3000
API_URL=http://localhost:3000
LOG_LEVEL=warn
```

Optional Redis (faster reads; MySQL/MSSQL remain source of truth):

```env
REDIS_ENABLED=true
REDIS_URL=redis://redis:6379
REDIS_KEY_PREFIX=pm:
REDIS_DEFAULT_TTL_SECONDS=300
```

Set `ENCRYPTION_KEY` (64-char hex) in production if you use Jira, Outlook, or other encrypted integration settings. If omitted, `JWT_SECRET` is used as fallback.

### 2. Run with Docker Compose

Use the [`docker-compose.yml`](docker-compose.yml) in this repository:

```bash
docker compose up -d
```

With optional Redis cache:

```bash
docker compose --profile redis up -d
```

When using the Redis profile, set `REDIS_ENABLED=true` and `REDIS_URL=redis://redis:6379` in `.env.docker`.

For MSSQL, point `DB_HOST` to your SQL Server instance instead of the bundled MySQL service.

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
2. The **Install Wizard** guides you through:
   - Admin account creation
   - Organization setup
   - Email configuration (optional)
3. Configure integrations under **Administration → System Settings** (SMTP, Jira, Outlook, etc.)

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DB_PROVIDER` | No | `mysql` | Database provider (`mysql` or `mssql`) |
| `DB_HOST` | Yes | `mysql` (Docker) | Database host |
| `DB_USER` | Yes | `appuser` | Database user |
| `DB_PASSWORD` | **Yes** | — | Database password |
| `DB_NAME` | No | `projectmanagement` | Database name |
| `DB_CONNECTION_LIMIT` | No | `50` | Connection pool size |
| `DB_PORT` | No | `3306` / `1433` | Database port |
| `DB_ENCRYPT` | No | `false` | MSSQL TLS encrypt flag |
| `DB_TRUST_SERVER_CERT` | No | `true` | MSSQL trust server certificate |
| `JWT_SECRET` | **Yes** | — | Secret key for JWT tokens |
| `ENCRYPTION_KEY` | No | — | 64-char hex key for encrypted settings (falls back to `JWT_SECRET`) |
| `ALLOWED_ORIGINS` | No | — | CORS allowed origins (comma-separated) |
| `NEXT_PUBLIC_API_URL` | No | `http://localhost:3000` | Public API URL (browser) |
| `API_URL` | No | `http://localhost:3000` | Internal API URL |
| `LOG_LEVEL` | No | `warn` | Log level (`debug` / `info` / `warn` / `error`) |
| `PORT` | No | `3000` | Application port |
| `NODE_ENV` | No | `development` | Set to `production` in production |
| `DEMO` | No | `false` | When `true`, enables demo-mode UI restrictions |
| `REDIS_ENABLED` | No | `false` | Enable Redis read cache |
| `REDIS_URL` | No | `redis://localhost:6379` | Redis connection URL |
| `REDIS_KEY_PREFIX` | No | `pm:` | Key prefix for all cache entries |
| `REDIS_DEFAULT_TTL_SECONDS` | No | `300` | Safety TTL for cached entities (invalidated on writes) |

## Ports

| Port | Description |
|------|-------------|
| `3000` | Application (frontend + API) |
| `6379` | Redis (optional, Docker `redis` profile only) |
| `3306` | MySQL (Docker Compose default) |

## Volumes

| Path | Description |
|------|-------------|
| `/app/logs` | Application log files |
| `/app/uploads` | File attachments (Tasks, Tickets, Projects, Organizations, Customers, Memos) |

**Note:** Rich text editor images are stored as base64 in the database, not in the uploads folder.

## Health Check

```
GET http://localhost:3000/health
```

Example response:

```json
{
  "status": "healthy",
  "timestamp": "2026-07-02T22:00:00.000Z",
  "uptime": 3600,
  "database": "connected",
  "redis": "disabled"
}
```

`redis` is `connected`, `disabled`, or `error`. Redis failures do **not** fail the health check — the app falls back to the database.

## Architecture

Single container serves Next.js frontend and Express API. MySQL or MSSQL is the system of record. Redis is optional.

```
+----------------------------------+
|   project-management:latest      |
|                                  |
|  +-----------+  +------------+   |
|  | Next.js   |  | Express    |   |
|  | Frontend  |  | API        |   |
|  +-----------+  +------------+   |
|         Port 3000                |
+----------------------------------+
          |              |
          |              +-----> Redis (optional)
          |
   +------+------+
   | MySQL / MSSQL |
   +---------------+
```

- **Base image**: `node:20-alpine`
- **Runs as**: Non-root user (`nodejs`, UID 1001)
- **Process**: `node dist/server/index.js`
- **Cache**: When `REDIS_ENABLED=true`, reads are cached with invalidate-on-write; writes always go to the database first

## Updating

```bash
docker compose pull
docker compose up -d
```

## Backup

### Database (MySQL)

```bash
docker exec project-management-mysql \
  mysqldump -u root -p"$DB_PASSWORD" projectmanagement > backup.sql
```

### Restore (MySQL)

```bash
docker exec -i project-management-mysql \
  mysql -u root -p"$DB_PASSWORD" projectmanagement < backup.sql
```

For MSSQL, use your standard backup/restore tools (`BACKUP DATABASE` / `RESTORE DATABASE`).

## Testing

Comprehensive testing scenarios are in [TESTING_SCENARIOS.md](TESTING_SCENARIOS.md):

- **220+ test scenarios** covering major features
- Authentication, authorization, and security cases
- Integration and end-to-end flows
- Performance and browser compatibility notes

```bash
npm test
npm run test:coverage
npm run test:integration
```

## License

MIT

## Links

- 🐳 [Docker Hub](https://hub.docker.com/r/tiag0ss/project-management)
- 🐛 [Report Issues](https://github.com/tiag0ss/project-management/issues)
- 📖 [Source Code](https://github.com/tiag0ss/project-management)
- 📬 [Cloudflare Email Task Queue](cloudflare/README.md)
- 📧 [Outlook Add-in](outlook-addin/README.md)
- 🧪 [Testing Scenarios](TESTING_SCENARIOS.md)
