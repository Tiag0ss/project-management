# Project Management App

[![Docker Hub](https://img.shields.io/docker/pulls/tiag0ss/project-management?label=Docker%20Pulls&logo=docker)](https://hub.docker.com/r/tiag0ss/project-management)
[![Docker Image](https://img.shields.io/badge/Docker%20Hub-tiag0ss%2Fproject--management-blue?logo=docker)](https://hub.docker.com/r/tiag0ss/project-management)

A full-stack, self-hosted project management application with task tracking, resource planning, time tracking, and multi-tenant organization support.

## Features

- 📋 **Project & Task Management** — Kanban boards, task hierarchy (parent/subtasks), dependencies, custom statuses and priorities
- 📊 **Resource Planning** — Gantt chart with drag-and-drop allocation, user availability tracking, intelligent replanning
- ⏱️ **Time Tracking** — Daily and weekly timesheet views, per-task time entries, CSV export
- 👥 **Multi-Tenant Organizations** — Multiple organizations, team management, permission groups
- 🔐 **Role-Based Permissions** — Developer, Support, Manager roles with granular permission control
- 🎫 **Ticket System** — Support ticket management with auto-numbering, auto-assignment to default support users, task conversion, Jira integration, and fully customizable per-organization statuses and priorities
- 👤 **Customer Management** — Customer database with organization associations and default support user assignment
- � **Application Lifecycle Management** — Application registry, version control, release management with PDF exports, task-to-release linking
- �🔗 **Jira Integration** — Two-tier Jira system connecting tickets and project boards with external linking and encrypted credentials
- 📝 **Rich Text Editor** — Tiptap-based editor with formatting, images (inline base64), and markdown support for descriptions and comments
- 📔 **Memos System** — Calendar-based note-taking with visibility controls (Private, Organizations, Public), tags, and rich content
- 🔄 **Recurring Tasks** — Outlook-style recurring time blocks for meetings, standups, and fixed schedules that planning respects
- 📧 **Email Notifications** — SMTP integration; task assignment, status change, priority change, @mention, and due-date reminder emails
- 🚦 **RAG Health Score** — Automatic Red/Amber/Green project health indicator based on overdue tasks, budget burn, and unassigned work
- 🔍 **Global Search** — Cross-entity search with paginated results and direct navigation
- 🌙 **Dark Mode** — Full dark mode support across the entire UI
- 📱 **Responsive Design** — Mobile-friendly interface with organised navigation dropdowns
- 🧙 **Install Wizard** — Guided first-time setup

## Key Features in Detail

### 📋 Project & Task Management
- **Kanban boards** — Visual task management with drag-and-drop
- **Task hierarchy** — Parent tasks with subtasks for complex work breakdown
- **Dependencies** — Link tasks that must be completed in order
- **Custom statuses & priorities** — Define project/task statuses and priority levels per organization
- **Bulk operations** — Import tasks from CSV templates
- **Task details** — Rich descriptions, attachments, comments, time tracking
- **Progress tracking** — Automatic completion percentage based on subtasks

### 📊 Resource Planning (Gantt Chart)
- **Interactive timeline** — View and allocate tasks across team members
- **Three view modes**:
  - **Week** — 28-day view with daily columns
  - **Month** — 90-day view with week grouping
  - **Year** — 365-day view with month grouping
- **Drag-and-drop allocation** — Assign tasks to users visually
- **Availability checking** — Real-time validation of user daily capacity
- **Parent-child allocations** — Split parent task hours across subtasks
- **Intelligent replanning** — Considers already-worked hours when rescheduling
- **User capacity** — Configurable work hours per day of the week

### ⏱️ Time Tracking
- **Timesheet views**:
  - **Daily Entry** — Quick form for logging hours today
  - **Weekly Grid** — Spreadsheet-style view of the entire week
  - **All Entries** — Filterable history of all time entries with summary cards
- **CSV Export** — Export filtered time entries to CSV directly from the All Entries tab
- **Manual save** — Review before submitting time entries
- **Task-based tracking** — Associate hours with specific tasks
- **Historical view** — Week navigation to review past entries
- **Approval workflow** — Managers can approve/reject time entries; approved entries are locked from editing
- **Reporting integration** — Time data feeds into project reports

### 👥 Multi-Tenant Organizations
- **Multiple organizations** — Single installation supports multiple companies/teams
- **Organization isolation** — Projects, tasks, and data separated by organization
- **Team management** — Add/remove members, assign roles
- **Permission groups** — Custom permission sets per organization (CanManageProjects, CanManageTasks, CanManageMembers, CanManageSettings)
- **Cross-organization users** — Users can be members of multiple organizations

### 🔐 Role-Based Permissions
- **Global roles**: Admin, Developer, Support, Manager
- **Permission system**:
  - **View permissions** — Dashboard, Planning, Reports, Others' planning schedules
  - **Project permissions** — Create, Manage, Delete projects
  - **Task permissions** — Create, Assign, Manage, Delete tasks
  - **Ticket permissions** — Create, Assign, Manage, Delete tickets
  - **Application permissions** — Manage applications, Manage application releases
  - **Admin permissions** — Manage organizations, users, system settings
- **Permission combination** — Users get permissions from ALL their roles (OR logic)
- **Admin override** — Admin users have all permissions automatically
- **Granular UI gates** — Every action button, form, and section is gated individually (save, assign, delete, edit)
- **Backend enforcement** — All API mutations validate permissions server-side
- **Organization-level groups** — PermissionGroups layer adds per-org overrides on top of global roles

### 🎫 Ticket System
- **Auto-numbering** — Tickets get unique IDs like `TKT-ORG-123`
- **Auto-assignment** — Tickets for customer projects automatically assigned to customer's default support user
- **Intelligent detection** — Works for customer users AND internal users creating tickets for customers
- **Priority & category** — Classify tickets (Support, Bug, Feature Request, etc.)
- **Custom statuses & priorities** — Fully configurable per organization (like task statuses); each status has a `StatusType` (`open`, `in_progress`, `waiting`, `resolved`, `closed`) for consistent filtering independent of label names
- **Status workflow** — Open → In Progress → Waiting → Resolved → Closed (default); organizations can rename, recolour, or add statuses freely
- **Developer assignment** — Separate field for developers working on technical issues
- **Task conversion** — Convert tickets to project tasks
- **Comment history** — Full conversation thread with rich text
- **Attachments** — File upload support
- **Notifications** — Real-time alerts for assignments and updates

### 👤 Customer Management
- **Customer database** — Track external clients and their information
- **Organization association** — Link customers to internal organizations
- **Default support user** — Assign a dedicated support representative per customer
- **Project linking** — Associate projects with customers
- **Application linking** — Link customers to applications for access management
- **Ticket tracking** — View all tickets for a customer
- **Contact management** — Store customer contact details
- **Custom fields** — Rich text descriptions and notes
- **Searchable dropdowns** — Efficiently manage large customer lists with search functionality

### 📱 Application Lifecycle Management
- **Application registry** — Centralized database of all applications within organizations
- **Version control** — Track application versions with status workflow (Planning → In Development → Testing → Released → Archived)
- **Release management**:
  - Create releases with version numbers and patch notes (rich text)
  - Link tasks to specific releases
  - Prevent duplicate task assignments across releases
  - Auto-update task versions when release is created
- **PDF exports**:
  - **Single release PDF** — Export individual release notes with task lists
  - **Date range PDF** — Export multiple releases within a date range
  - Rich text patch notes rendered in PDFs
- **Customer associations** — Link applications to customers for license/access management
- **Project associations** — Connect applications to projects for development tracking
- **Repository integration** — Store repository URLs for quick access
- **Permission system**:
  - `CanManageApplications` — Create, edit, delete applications (global and organization-level)
  - `CanManageApplicationReleases` — Manage application releases (global and organization-level)
- **Searchable interface** — Find applications, versions, and customers quickly with integrated search
- **Task filtering** — View only tasks not yet assigned to any release
- **Version statistics** — See task counts per version at a glance

### 📝 Rich Text Editor
- **Tiptap-based editor** with full formatting toolbar:
  - Text formatting: Bold, italic, strike-through, code
  - Headings: H1, H2, H3
  - Lists: Bullet points, numbered lists
  - Alignment: Left, center, right
  - Links: Clickable URLs
- **Inline image support** — Paste or upload images directly (base64, 5MB limit)
- **Used everywhere** — Tasks, Tickets, Projects, Organizations, Customers, Memos
- **Smart rendering**:
  - List views: Strip HTML tags for clean preview
  - Detail views: Full HTML rendering with Tailwind Typography (@tailwindcss/typography)

### 📔 Memos System
- **Calendar-based interface** — Navigate by month and select specific dates
- **Smart date filtering**:
  - By default shows all memos across all dates
  - Click a date to filter memos for that specific day
  - Click the same selected date again to remove date filter
  - "Clear Date Filter" and "Clear All Filters" buttons for easy reset
- **Visibility controls**:
  - 🔒 **Private** — Only visible to you  
  - 👥 **Organizations** — Shared with members of your organizations
  - 🌍 **Public** — Visible to all users
- **Tag system** — Organize and filter memos by custom tags
- **Rich content** — Full rich text editor support with images
- **Visual indicators**:
  - Calendar shows days with memos in bold
  - Selected date highlighted when filter active
  - Current date highlighted in blue
- **Author display** — See who created each memo
- **Personal notes** — Great for daily logs, meeting notes, ideas

### 🔄 Recurring Tasks
- **Outlook-style recurrence patterns** — Daily, Weekly, Monthly, Custom Days, or Interval-based scheduling
- **Time-based scheduling** — Set specific start and end times for each recurring block
- **Automatic occurrence generation** — System pre-generates occurrences for selected date ranges
- **Profile management** — Configure recurring allocations from user profile page
- **Planning integration**:
  - Visible in Gantt chart with pink color and 🔄 icon
  - Availability calculation respects recurring time blocks
  - Push-forward algorithm skips around recurring blocks
  - Read-only detail modal on click (edit from Profile)
- **Calendar display** — Shows in Dashboard calendar with pink highlighting
- **Use cases** — Standups, team meetings, 1:1s, appointments, lunch breaks, fixed schedules

### 🔗 Jira Integration
- **Two-tier integration system** for comprehensive Jira connectivity:
  - **Jira for Tickets** — Primary instance for ticket management and issue search
  - **Jira for Projects** — Optional separate instance for project boards and kanban views
- **Organization-level configuration** — Set up Jira credentials and project keys per organization
- **Project board association** — Link projects to specific Jira boards via Board ID
- **Task-to-Jira linking** — Tasks created from tickets automatically show Jira context
- **External navigation** — Direct links to Jira tickets and boards from within the app
- **Security** — All API tokens encrypted with AES-256-CBC encryption
- **Flexible setup** — Works with single or multiple Jira instances per organization
- **Visual integration** — Jira badges and links throughout task and ticket interfaces
- **Search capability** — Find and import Jira issues directly into tickets
- **Project settings** — Manage Jira board associations in project configuration
- **Intelligent detection** — Automatic Jira field display based on organization integration status

### 🚦 RAG Health Score
- **Automatic project health** — Red/Amber/Green banner shown in every Project Overview
- **Red** — More than 2 overdue tasks, or budget fully spent/exceeded
- **Amber** — Any overdue task, budget at 80 %+, or more than 30 % of tasks unassigned
- **Green** — No issues detected
- **Reason labels** — Concise text explains why the score is Amber or Red
- **Always visible** — Displayed above the Priority Breakdown section regardless of whether a budget is set

### 🔍 Global Search
- **Cross-entity search** — Finds tasks, projects, organisations, and users in a single query
- **Keyboard-friendly** — Debounced input in the Navbar, results appear instantly
- **Paginated results** — Each category is paginated; a **Load More** button appends the next page without resetting the view
- **Direct navigation** — Click any result to jump straight to the relevant page or task

### 📧 Email Notifications
- **SMTP integration** — Send notifications via your email server
- **Encrypted credentials** — Passwords stored securely with AES-256-CBC
- **Email preferences** — Users can customise which notification types they receive
- **Notification types**:
  - Task assignment
  - Task status change
  - Task priority change
  - Ticket assignments and updates
  - @mention in task comments
  - Due date reminders (1 day before)
  - Daily / weekly work summaries
- **Deduplication** — Reminder and summary logs prevent duplicate sends on server restart

### 🌙 Dark Mode
- **Full dark mode support** — Every page and component
- **Automatic system detection** — Follows OS preference
- **Manual toggle** — Switch modes anytime
- **Consistent styling** — Tailwind CSS dark: classes throughout
- **Optimized readability** — Carefully chosen color contrasts

### 🧙 Install Wizard
- **First-time setup** — Guided wizard for initial configuration
- **Admin account creation** — Set up first user with admin privileges
- **Organization setup** — Create initial organization
- **Email configuration** — Optional SMTP setup
- **Database initialization** — Automatic table creation and seeding
- **One-time only** — Can't be accessed again after completion

### 🗂️ Navigation Organization
- **Grouped menus** for better organization:
  - **Work** dropdown: Projects, Planning
  - **Management** dropdown: Applications, Customers, Organizations
- **Quick access** to: Dashboard, Tickets, Memos, Reports
- **User menu** — Profile, notifications, logout
- **Role-based visibility** — Menu items shown based on permissions
- **Consistent experience** across all pages

## Tech Stack

| Component | Technology |
|-----------|------------|
| Frontend | Next.js 16, React 19, TypeScript, Tailwind CSS |
| Rich Text | Tiptap (StarterKit, Image, Placeholder extensions) |
| Backend | Node.js 20, Express.js, TypeScript |
| Database | MySQL 8.0 |
| Auth | JWT with HTTP-only cookies |
| Integrations | Jira REST API, AES-256-CBC encryption |
| Container | Alpine-based Node.js image |

## Quick Start

### 1. Create environment file

```bash
# Download the example and edit with your values
curl -o .env.docker https://raw.githubusercontent.com/tiag0ss/project-management/main/.env.docker.example
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
┌─────────────────────────────────┐
│     project-management:latest   │
│                                 │
│  ┌───────────┐  ┌────────────┐  │
│  │  Next.js  │  │  Express   │  │
│  │  Frontend │  │  API       │  │
│  └─────────┬─┘  └─┬──────────┘  │
│            │      │             │
│            Port 3000            │
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

- 🐳 [Docker Hub](https://hub.docker.com/r/tiag0ss/project-management)
- 🐛 [Report Issues](https://github.com/tiag0ss/project-management/issues)
- 📖 [Source Code](https://github.com/tiag0ss/project-management)
