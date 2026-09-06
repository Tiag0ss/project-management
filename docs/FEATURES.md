# Project Management App — Feature Reference

Comprehensive documentation of all features available in the application. Use this as the primary reference when implementing new features, writing tests, or onboarding new team members.

**End-user manual (in-app):** `/docs` — step-by-step workflows, playbooks, and permission matrices.  
**Test scenarios:** [TESTING_SCENARIOS.md](../TESTING_SCENARIOS.md)  
**Deploy/ops:** [README.md](../README.md), [DEPLOYMENT.md](../DEPLOYMENT.md)

---

## Table of Contents

1. [Authentication & User Accounts](#1-authentication--user-accounts)
2. [Organizations & Members](#2-organizations--members)
3. [Customers & Customer Portal](#3-customers--customer-portal)
4. [Applications & Releases](#4-applications--releases)
5. [Projects](#5-projects)
6. [Tasks](#6-tasks)
7. [Tickets](#7-tickets)
8. [Resource Planning (Gantt & Scheduling)](#8-resource-planning-gantt--scheduling)
9. [Time Tracking](#9-time-tracking)
10. [Call Records](#10-call-records)
11. [Active Timers](#11-active-timers)
12. [Memos](#12-memos)
12b. [Expenses (Optional)](#12b-expenses-optional)
13. [Dashboard & Analytics](#13-dashboard--analytics)
14. [Portfolio](#14-portfolio)
15. [Work Summary](#15-work-summary)
15b. [Reporting Hub](#15b-reporting-hub)
16. [Permissions System](#16-permissions-system)
17. [Jira Integration](#17-jira-integration)
18. [Email & Notifications](#18-email--notifications)
19. [Search & Navigation](#19-search--navigation)
20. [Administration](#20-administration)
21. [API Tokens](#21-api-tokens)
22. [Outlook Calendar Integration](#22-outlook-calendar-integration)
23. [Email Task Queue (Cloudflare)](#23-email-task-queue-cloudflare)
24. [GitHub & Gitea Integration](#24-github--gitea-integration)
25. [Redis Cache (Optional)](#25-redis-cache-optional)
26. [IDE Extensions (Project Kanban)](#26-ide-extensions-project-kanban)
27. [Mobile (phases 1–3)](#27-mobile-phases-13)

---

## 1. Authentication & User Accounts

### First-Time Setup (Install Wizard)
When the database is empty and no admin exists, navigating to the app automatically redirects to `/install`. The wizard collects:
- Admin account credentials (username, email, password, first/last name)
- Initial organization name
- Optional SMTP configuration

After completion the wizard is permanently disabled and the app redirects to `/login`.

### Login / Logout
- Credentials validated against bcrypt hashes stored in `Users.PasswordHash`
- On success a JWT is issued and stored in an HTTP-only cookie (inaccessible to JavaScript)
- JWT payload carries `userId`, `isAdmin`, `customerId` (for customer portal users)
- Logout clears the cookie server-side

### Password Recovery
1. User visits `/forgot-password` and submits their email address
2. Server generates a cryptographically random token, stores a bcrypt hash in `PasswordResetTokens` with a 1-hour expiry
3. A reset link (`/reset-password?token=...`) is emailed to the user
4. The reset page validates the token, lets the user pick a new password, and invalidates the token (single-use)
5. Responses are generic — the system never reveals whether an email exists in the database

### User Profile
Each user can edit their own profile at `/profile`:
- First name, last name, email, username, password change
- **Avatar**: Upload a profile picture
- **Work hours per day**: Per-weekday capacity used by the planning engine (e.g., 8h Mon–Fri, 0h Sat–Sun)
- **Work start time**: Determines when daily work begins (used for calendar-based planning)
- **Lunch time**: Inserted as a break in the daily schedule
- **Hourly rate**: Used in budget calculations (Manager-visible)
- **Rate cascade for monetary cost**: `COALESCE(task.HourlyRate, project.HourlyRate, user.HourlyRate, 0)` — task overrides project, project overrides user
- **Project HourlyRate**: optional default on the project (visible with `CanViewBudgetInfo`)
- **Task HourlyRate**: optional override; UI/API only when the project has `Budget` set and the user has `CanViewBudgetInfo`
- **Timezone**: IANA timezone for correct date/time display
- **Email preferences**: Opt in/out of specific notification types (assignment, due-date reminders, work summary, etc.)
- **Vacations**: Request and manage vacation days (approval workflow when enabled)
- **Out Of Office**: Request unavailable days that block planning capacity (approval workflow when enabled)
- **Dev Support**: Mark informational dev-support days (auto-saved, full days only). Visible on the calendar and planning overlay but **does not** reduce allocation capacity or block drag-and-drop. Team leaders/admins manage others via **Management → Dev Support** (`/dev-support`).

---

## 2. Organizations & Members

### Organizations
Organizations are the top-level grouping entity. Projects, tasks, tickets, and team members all belong to an organization.

- Admin users can create organizations at `/organizations`
- Each organization has a name and rich-text description
- Member who creates an org is automatically added as a member

### Members & Roles
Users are added to organizations with a **role** (`Developer`, `Support`, `Manager`) and an optional **Permission Group**.

- Roles determine global permission sets (see [Permissions System](#16-permissions-system))
- Permission groups can further restrict or expand individual permissions within this org

### Custom Status Values
Each organization defines its own status vocabularies used throughout the app:

| Entity | Fields |
|---|---|
| **Project Statuses** | Value (name), Color (hex), IsDefault |
| **Task Statuses** | Value (name), Color (hex), IsDefault |
| **Task Priorities** | Value (name), Color (hex), IsDefault |
| **Task Types** | Value (name), Color (hex), Icon (Lucide name), IsDefault |
| **Ticket Statuses** | Value, Color, StatusType (`open`/`in_progress`/`waiting`/`resolved`/`closed`/`other`), IsClosed, IsCancelled |
| **Ticket Priorities** | Value, Color, IsDefault |

Only one status per type can be `IsDefault` — it is automatically pre-selected in new items.

### Task Form Visibility (Fields & Tabs)
Optional task modal fields and tabs can be hidden to simplify the UI. Resolution order for each user in an organization:

1. **Personal override** — My Profile → **Task Form** (`UserTaskFieldVisibility`, per organization), if the user has saved one
2. **Organization default** — Organization → **Task Form** (`OrganizationTaskFieldVisibility`), if present
3. **Global template** — Administration → **Task Form** (`SystemSettings.taskFieldVisibility`)

- **Sync from global** (org): overwrites the org copy with the current global template
- **Use organization default** (profile): deletes the personal override for that org
- New organizations are seeded from the global template; missing org rows fall through to global for effective reads (admin org GET still lazy-creates a copy for editing)
- **Locked (always visible)**: Task Name, Status, Priority, Task Type, Details tab
- **Section labels**: optional toggle to hide form section headings while keeping fields visible
- **Optional header controls**: Project/Customer/Synapse pills, timer, hours summary cards, tags, print, task actions menu
- **Optional Details fields**: Description, linked ticket/Jira board refs, Jira/GitHub/Gitea keys, Assignees, Customer (global projects), Due Date flags, Estimates, Story Points, Application/Release, Custom fields block
- **Optional Hours fields**: Parent/Depends On, Child tasks list, Planned allocations, Time entries (also hides Hours sub-tabs when empty)
- **Optional tabs**: History / Comments / Attachments / Hours / Checklist
- Visibility is **UI-only** in `TaskDetailModal` (API create/update still accepts values for imports/integrations)
- Config UI is grouped by location (Modal tabs / Header / Details / Hours) with short location hints

---

## 3. Customers & Customer Portal

### Customers
Customer records represent external clients. Fields include:
- Name, External Name (used in reports), Email, Phone, Address, Website
- Contact Person, Contact Email, Contact Phone
- Rich-text notes/description
- Associated organizations (many-to-many)
- **Default support user**: Automatically assigned to new tickets for this customer

Customers can be associated with **Applications** (which apps they use) and **Projects** (which projects are for them).

### Customer User Accounts
Customer users (`CustomerUsers` table) may log in to the **Customer Portal** (`/portal`):
- Scoped to their customer's data only
- Can view their own open tickets and project status summaries
- Can create new tickets (minimal form — no project selection)
- Cannot access internal pages (enforced by `CustomerUserGuard` and customer-only AppShell nav)

### Customer Portal
Customer login lands on **Dashboard** (`/dashboard`), which shows:
- **Needs your attention**: tickets with `StatusType = waiting` (awaiting customer response), with direct links to ticket detail
- Compact stats: total, open, in progress, needs you, resolved, urgent (when internal tickets are enabled) — cards link to `/tickets`
- Short **recent updates** strip (excludes waiting tickets so the list is not duplicated with Tickets)
- Projects grid with status and progress (customer-visible projects)

The full ticket list and filters live on **Tickets** (`/tickets`), not as a second full table on the dashboard.

Sidebar for customer users is limited to **Dashboard** and **Tickets** (when the tickets module is enabled). The header still shows **Notifications** (and Profile). Internal pages are blocked by `CustomerUserGuard`. `/portal` redirects to `/dashboard` for compatibility.

### Change History
Every meaningful field change to a customer record is logged and visible in the **History** tab of the customer detail page. The history UI renders only in that tab (not in other tabs like Attachments).

---

## 4. Applications & Releases

### Applications
Applications represent software products that projects may be building or maintaining.

- Created and managed at `/applications`
- Fields: Name, Description (rich text), Repository URL, Organization, `IsCustomerSpecific` flag, optional **Image** (`ImagePath`)
- Application image is **upload-only** (PNG/JPEG/WebP/SVG) to `/uploads/applications/…` — no external image URL field
- Customers are linked via a searchable multi-select (many-to-many)
- Projects and tasks can reference an application; tasks can further reference a specific **version**
- Detail and list pages show the uploaded image (or a package icon fallback)
- Sidebar tabs on detail pages persist in `?tab=` (overview / versions / commits) so refresh keeps the active panel

### Application Versions (Releases)
Each application can have multiple versioned releases:

- Fields: Version Number, Version Name, Status, Release Date, Patch Notes (rich text with images), `IsCustomerSpecific` flag
- Tasks are linked to a version — once linked, the task disappears from the available pool for other versions
- Linking tasks auto-sets `Tasks.ReleaseVersionId`

### Patch Notes PDF Export
Two export modes exist:

**Single version PDF** (`Print to PDF` button on version detail):
- Application name + version number + release date in header
- Patch notes rendered from HTML including embedded images (base64, hosted URLs, or local `/uploads/` paths)
- List of linked tasks with status/priority/assignee

**Date-range PDF** (`Print Date Range`):
- Aggregates all releases within selected start–end dates
- Each release on its own section
- Sorted by release date; page breaks between releases

Images in patch notes are fetched at render time. Supported sources:
- Inline base64 data URIs (`data:image/...;base64,...`)
- Local server uploads (`/uploads/...` path)
- External HTTP/HTTPS URLs

---

## 5. Projects

### Project List & Creation
- `/projects` — lists all projects the user has access to
- Filters: organization, status, customer, search
- Fields: Name, Description (rich text), Organization, Status, Start Date, End Date, Budget, BudgetType (`monetary` | `hours`), optional HourlyRate (default billing rate), Customer, linked Applications, Jira Board ID (when Projects Jira integration is configured), `IsHobby` flag, `IsGlobal`, `IsVisibleToCustomer`
- **Global Project rule**: When `IsGlobal = true`, project cannot be associated with a customer and `IsVisibleToCustomer` is forced off

### Project Detail Tabs

#### Overview Tab
- **RAG health score**: Automatic Red/Amber/Green banner based on overdue tasks, unassigned work, and budget burn
- **Quick stats**: Dates, estimated hours (leaf tasks only — no double counting), open tickets, team size
- **Task analytics** widgets: priority breakdown, types of work (%), team workload (open by assignee), parent-task progress (Done / In progress / To do)
- **Requires attention**: overdue, due this week, and unassigned summary chips
- **Alerts**: Overdue tasks, upcoming tasks (next 7 days), unassigned tasks
- **Team members grid**: Per-user progress, task counts, hours assigned

#### Kanban Tab
- Columns represent task statuses (custom or default)
- Drag-and-drop within and between columns changes task status
- `DisplayOrder` field persists card order within each column
- Cards show: task name, priority badge, assignee avatar, completion %, linked Jira badge (if any)
- **Import Tasks** dropdown: CSV import, Jira import, Check Jira Ticket Status

#### Gantt Tab (Project Gantt)
- Hierarchical view: parent tasks with indented children
- Timeline view modes: **Week** (28 days), **Month** (90 days), **Year** (365 days)
- Navigation adjusts ±28/90/365 days per mode
- Dependencies (arrows), baseline comparison (drift bars), critical path highlight (red ring)
- Clicking a bar opens the task detail modal

#### Reporting Tab
Four sub-tabs:
- **Summary**: Task table with estimated/allocated/worked hours; totals use **leaf tasks only**; CSV export
- **By User**: Per-user statistics (allocated hours, worked hours, task count)
- **Allocations**: All allocation rows with dates, users, and `SplitOrder` / `TaskAllocationHeaderId` identifiers
- **Time Entries**: All logged time entries with description
- **Scheduled Reports**: Create/edit/delete schedules to auto-email PDF reports (weekly or monthly) to specified recipients

#### Sprints Tab (🏃 tab)
- Full sprint/iteration management: create, edit, delete sprints linked to the project
- Sprint cards show progress bars, date range, task counts
- Backlog panel with multi-select for moving tasks between sprints
- Inline task status management within a sprint card

#### Burndown Tab (📉 tab)
- SVG chart toggling between **Burndown** and **Burnup** modes
- Data points: date, remaining hours ideal line, actual remaining, cumulative worked
- Uses `/api/projects/:id/burndown` endpoint

#### Dependencies Tab (🔗 tab)
- SVG directed acyclic graph (DAG) showing task dependencies
- Topological layout, colour-coded by task status
- Bézier arrows between dependent tasks
- Click a task node to open its detail modal

#### Settings Tab
- Edit all project fields (name, description, dates, budget, status, applications, customer, Jira Board ID, global flags)
- Enforced constraint: Global projects cannot have customer association
- Danger zone: archive or delete project

---

## 6. Tasks

### Task Fields
- Name, Description (rich text with images)
- Status (from org's TaskStatusValues), Priority (from org's TaskPriorityValues)
- **Estimated Hours** — used in planning and reporting
- **Completion Percentage** — 0–100% slider, independent from status
- Assigned Users (primary `AssignedTo` + multiple via `TaskAssignees` junction table)
- Planned Start Date, Planned End Date (managed by planning — read-only in task modal)
- **Due Date** — hard deadline used for overdue detection and reminders
- Application + Version (searchable dropdowns)
- **Parent Task** — establishes a subtask hierarchy (`ParentTaskId`)
- **Depends On** — task dependency chain (`DependsOnTaskId`)
- Sprint association (`SprintId`)
- Jira issue linkage via `TicketId → Tickets.ExternalTicketId`

### Task Hierarchy (Parent / Child)
- Any task can be a **parent** by having other tasks reference its `Id` as `ParentTaskId`
- **Leaf tasks** are tasks with no children — these are the only ones included in hour totals (no double counting)
- Parent tasks appear collapsed/expanded in Kanban and Gantt views
- When calculating project totals, always filter to leaf tasks:
  ```
  taskIdsWithChildren = Set of all ParentTaskId values
  leafTasks = tasks where Id not in taskIdsWithChildren
  total = sum(leafTasks.EstimatedHours)
  ```

### Task Detail Modal — Sections
- **Header**: Name, status badge, priority badge, Synapse chip (when linked), project/customer pills
- **Details**: Task fields with inline editing (optional fields/tabs filtered by [Task Form Visibility](#task-form-visibility-fields--tabs))
- **Description**: Full rich text editor (when visible)
- **Timer**: Live elapsed counter, Start/Stop/Discard buttons (see [Active Timers](#11-active-timers))
- **Checklist** tab: Checklist items with progress bar and checkbox toggles
- **Comments** tab: Rich text comments with `@mention` support; attachments per comment
- **Hours / Plan & Deps** tab: Parent/depends editors plus allocations and time entries
- **Attachments** tab: Upload / download / delete file attachments
- **History** tab: Change log showing all field changes with timestamp and user
- **Create from ticket**: uses the same `TaskDetailModal` (prefills name/description/ticketId); project picker only when the ticket has no project

### Task Checklists
- Each task can have a checklist (ordered list of items)
- Progress bar reflects completed/total items
- Items added, reordered, checked, unchecked, and deleted
- API: `/api/task-checklists` (CRUD per task)

### Task Templates
- Templates (`TaskTemplates` + `TaskTemplateItems`) define a set of tasks to create at once
- Templates page accessible from the project task tab
- "Apply Template" copies all template items as real tasks into the project
- Template items can have predefined fields (name, description, estimated hours, priority)

### Task Attachments
- Uploaded files stored server-side at `/app/uploads/attachments`
- Max file size: 5 MB
- Attachment list in task detail with download and delete actions
- Attachment manager component (`AttachmentManager.tsx`) used in both tasks and tickets

### Import Tasks from CSV
1. Download CSV template (project task tab → Import Tasks → CSV)
2. Fill in task data
3. Upload filled CSV
4. Preview shown before import is confirmed
5. Tasks created with parent/child and dependency relationships inferred from CSV columns

### Import Tasks from Jira
1. From the project Kanban tab → Import Tasks → Import from Jira
2. Jira issues fetched from the org's configured Jira (Tickets) instance
3. Status mapping panel maps Jira statuses → local TaskStatusValues
4. Selected issues converted to tasks with linked `ExternalTicketId`

### Import Tasks from GitHub / Gitea
1. From the project task import menu → Import from GitHub or Import from Gitea (when org integration is enabled)
2. Search issues from the configured repository instance
3. Selected issues become tasks with `GitHubIssueNumber` or `GiteaIssueNumber` reference
4. Duplicate imports for the same issue are prevented

### Import Tasks from Outlook Email Queue
1. Send email from your registered user address to the configured Cloudflare queue address (see [Email Task Queue](#23-email-task-queue-cloudflare))
2. When pending items exist, project Import Tasks shows **Import from Outlook Queue**
3. Select queued item → import as task (subject → name, normalized body → description)
4. Dismiss items you do not want to import

### Task Type Icons
- Each organization defines **Task Types** with name, color, and Lucide icon
- Icons appear in: project Kanban, project Gantt, Planning Gantt bars, dashboard Kanban, task grids
- Default task type is used when creating tasks without an explicit type
- Icon picker in organization settings is searchable

### Check Jira Ticket Status (Batch Update)
From the project Kanban tab → Import Tasks → 🔍 Check Jira Ticket Status:
1. System queries Jira for current statuses of all tasks that have a linked Jira issue key
2. Modal shows list of tickets with: Jira status, local task status, and whether they differ
3. "Show only changed" filter to focus on mismatches
4. **No tickets selected by default** — user explicitly selects which to update
5. **Select All / Deselect All** buttons for quick bulk selection
6. **Global mapping panel**: map Jira status names → local task status values for the whole batch
7. **Per-ticket override**: each ticket row has an individual status select that overrides the global mapping for that ticket
8. Click "Apply Updates" to bulk-update selected tickets' statuses

### Split Allocation Button (Task Allocations Tab)
Within a task's Allocations tab, each allocation slice shows a **Split** button:
1. Click Split on an existing slice
2. Choose **Parallel** or **Sequential** split mode
3. Define per-user entries: user, hours, hours-per-day
4. Confirm — original allocation header is replaced by multiple headers with incrementing `SplitOrder` values
5. Planning Gantt shows individual bars per user

---

## 7. Tickets

### Ticket Fields
- Ticket number: auto-generated in `TKT-ORG-NNN` format
- Title, Description (rich text), Customer, Project
- Status (`TicketStatusValues.Id`), Priority (`TicketPriorityValues.Id`)
- Category, Assigned Support User, Assigned Developer
- `ExternalTicketId` — Jira issue key if linked
- Linked Task (`TaskId`) — when the ticket has been converted to a task
- SLA tracking: `FirstResponseAt` timestamp, per-org SLA rules per priority

### Auto-Assignment
When creating a ticket for a customer that has a **Default Support User** configured, that user is automatically assigned without manual selection.

### Ticket Status System
- Statuses are fully custom per organization (`TicketStatusValues`)
- Each status has a `StatusType`: `open`, `in_progress`, `waiting`, `resolved`, `closed`, or `other`
- `StatusType` enables robust filtering regardless of custom status names (no hard-coded string matching)
- Dashboard ticket stats and workflow use `StatusType`-based logic
- `IsClosed = true` excludes tickets from open counts

### SLA Rules
- Defined per organization per priority in `SLARules` table: `FirstResponseHours`, `ResolutionHours`
- `Tickets.FirstResponseAt` auto-set on first staff reply (comment)
- Ticket list shows color-coded SLA badges: 🟢 on time / 🟡 at risk / 🔴 breached

### Comments & @Mentions
- Rich text comments with attachments
- `@username` in comment body creates an in-app notification and sends an email to the mentioned user
- Comment timestamps and author visible

### Ticket Detail Tabs
- **Details**: All ticket fields, edit, assign
- **Comments**: Conversation thread with rich text and attachments
- **Attachments**: Files directly attached to the ticket
- **History**: Complete change log (status, priority, assignment changes)

### Convert Ticket to Task
From the ticket detail page:
1. Click "Convert to Task"
2. Select project, fill task details (pre-populated from ticket)
3. Creates a task linked to the ticket (`Tickets.TaskId` → `Tasks.Id`)
4. Ticket shows a badge linking to the associated task

---

## 8. Resource Planning (Gantt & Scheduling)

### Overview
The Planning page (`/planning`) provides a resource-centric Gantt view driven by `TaskAllocationHeaders` and `TaskAllocations`. Every allocation belongs to a header (a logical "slice"), ensuring bars are header-driven — not merged by date proximity.

### Mobile

On viewports ≤767px (`useIsMobile`), Planning is **read-only** even when the user has `canPlanTasks`. Device gate: `canPlanOnThisDevice = canPlanTasks && !isMobile`. Drag, resize, planning tools, allocation deletes, and related edit chrome reuse the existing read-only path; a banner explains the device lock. Edit allocations on a larger screen.

### View Modes
| Mode | Days Shown | Navigation Step | Column Headers |
|---|---|---|---|
| Week | 28 days | ±28 days | Week number + date range |
| Month | 90 days | ±90 days | Month + week labels |
| Year | 365 days | ±365 days | Month labels |

### Resource View vs Task View
- **Resource View**: Rows grouped by user. Each row shows all tasks allocated to that user across all projects. Ideal for checking individual capacity.
- **Task View**: Rows grouped by task. Each task row shows which users are allocated and for how long.

### Toolbar Filters
- Filter by organization, project, user
- "Show only my tasks" toggle (restricts to current user's allocations)
- **View Options** (persisted in localStorage): dependencies, critical path, baseline, daily totals, bar hours, time entries overlay, user visibility
- **Hide not-planned tasks without hours**: when enabled in resource grouping, hides **Not Planned** parent tasks that have no estimated hours (leaf or own). Unplanned tasks that still have estimated hours remain visible. Unscheduled work remains on assignee rows. A top amber warning lists the hidden tasks (expandable, open task, or restore them in Not Planned).
- 🔴 **Critical Path** toggle: highlights tasks on the critical path with a red ring (CPM forward/backward pass)
- 📏 **Baseline** toggle + 📐 **Set Baseline**: captures `BaselineStartDate`/`BaselineEndDate` snapshot; drift bars rendered as coloured thin strips beside each bar (🟢 ahead / 🟡 minor drift / 🟣 late)

### Allocation Mechanics

#### Allocation Headers
Every group of allocation records belongs to a `TaskAllocationHeader`:
- `TaskId`, `UserId`, `AllocationMode`, `SplitOrder`, `PlannedHours`, `CreatedBy`
- One bar per header in the Gantt (never merged across headers)
- Multiple headers on the same task = split allocations

#### Drag-and-Drop Allocation
1. Drag an unallocated task from the sidebar onto a user row on a specific date
2. A dialog collects: allocated hours per day (or total), allocation mode
3. System checks user availability for each target day:
   - Daily work capacity (`WorkHoursMonday–Sunday`)
   - Existing `TaskAllocations` for that user on that day
   - Existing `TaskChildAllocations` for that user on that day
   - Recurring tasks scheduled for that user on that day
4. `TaskAllocationHeader` + `TaskAllocations` records created
5. `Tasks.PlannedStartDate` / `PlannedEndDate` updated from the allocation range

#### Normal Drag vs Ctrl + Drag
- **Normal drag**: Moves the **entire allocation slice** (all days in that header) to the new start date
- **Ctrl + drag**: Opens a **partial slice flow by hours** — user enters how many hours to move; source slice decreases, new slice created for the moved hours at the target date

#### Intelligent Replanning
When replanning an existing allocation:
1. System fetches existing `TimeEntries` for that task
2. Calculates: `remainingHours = estimatedHours - sum(timeEntries hours)`
3. Shows confirmation dialog displaying remaining hours
4. **Blocks replanning if remaining ≤ 0**
5. Only the remaining hours are scheduled — already-worked hours are not re-allocated

### Split Allocations
A task can be split across multiple users, each with their own allocation slice and `SplitOrder`:

| Mode | Behavior |
|---|---|
| **Parallel** | All users share the same date range (concurrent work) |
| **Sequential** | Users are chained; user N+1 starts after user N finishes |

Split allocations can be created:
- Via the allocation dialog in Planning (Enable Split toggle)
- Via the **Split button** in the Task Detail Modal → Allocations tab

For split tasks with multiple users, dropping on the task header row shows an alert; drop on a specific user's day to replan only that user's slice.

### Unscheduled Work
Leaf tasks with `UnscheduledWork = 1` are treated differently:
- They have **no traditional allocation bars** on the Gantt
- Instead, they appear as **ghost markers** on specific dates:
  - On the date the task transitioned to a closed status ("done" transition date)
  - Or on today's date if still open
- Sorted to the bottom of the user's task list
- Parent tasks with unscheduled children also receive an indicator in the parent row
- Clicking the marker opens the task detail modal

### Recurring Tasks
Recurring tasks are created in the user profile (`/profile`):
- Show in Planning Gantt with a pink background and 🔄 icon
- Their hours are subtracted from the user's available capacity on those days
- The push-forward algorithm skips around recurring blocks

### Outlook Calendar Overlay
When enabled in System Settings (Microsoft Graph credentials):
- Planning loads Outlook events **in the background** after the Gantt renders (does not block initial page load)
- Banner **"Still loading Outlook calendar…"** shown near overdue milestones while fetching
- Non-all-day events appear as blocks on user rows; other users' events show as **Busy**
- Event hours reduce daily availability in capacity calculations
- Click own event → open in Outlook or start call timer

### Dev Support overlay (informational)
**Team leaders and admins** schedule Dev Support days from **Management → Dev Support** (`/dev-support`). Regular users see assigned days on Planning and the dashboard calendar but cannot create or delete them. Unlike vacations and out-of-office:

| Surface | Dev Support | Out Of Office / Vacation |
|---|---|---|
| Planning column | Sky/indigo tint, 🛠️ footer icon | Amber tint (blocking), blocks allocation |
| Dashboard calendar | Indigo all-day event | Cyan (vacation) / rose (OOO) all-day |
| Allocation API | **Ignored** | Reduces available capacity |

Dev Support entries are created immediately (no approval tab). Team leaders and admins can see subordinate dev support days on the planning calendar endpoint. **Team leaders** configure direct reports; **admins** configure any active user via `/dev-support` in the main menu (below Approvals).

### Planning Import (`/planning-import`)
Batch import of allocation plans from CSV:
- Upload a CSV specifying task, user, date, and hours columns
- Column mapping step to match CSV headers to system fields
- Preview shows per-user/per-task allocations to be created
- Import creates `TaskAllocationHeaders` + `TaskAllocations` entries

### AllocationHeaderDetail Modal
Clicking an allocation bar in Planning opens a detail modal showing:
- Header metadata (task name, user, planned hours, split order, mode)
- Per-day allocation breakdown (expandable table)
- Actions: Move, Recalculate, Split, Delete slice

### Child Task Allocations
Parent tasks with subtasks can have their allocation time split across specific child tasks via `TaskChildAllocations`:
- Child task gets `PlannedStartDate`/`PlannedEndDate` when child allocations are created
- When moving a parent slice, only the `TaskChildAllocations` with the same `TaskAllocationHeaderId` are updated
- Availability checking always includes both `TaskAllocations` and `TaskChildAllocations`

---

## 9. Time Tracking

### Daily Entry Tab
- Select any date
- Pick a task from a searchable dropdown
- Enter hours and a description
- Click "Save Entry"

### Weekly Grid Tab
- Rows: tasks with time entries in the selected week
- Columns: days of the week (Mon–Sun)
- Each cell is editable inline
- "Save All Changes" commits the entire grid at once
- Setting a cell to 0 deletes that time entry
- Previous/Current/Next week navigation buttons

### All Entries Tab
- Filterable table: date range, project, task, user (admin only)
- Totals footer: total hours, billable hours, entry count
- CSV export with current filters applied

### Approval Workflow
- `TimeEntries.ApprovalStatus`: `pending`, `approved`, `rejected`
- Managers navigate to pending entries via the Approvals page
- Approved entries are locked (cannot be edited)
- Rejected entries show rejection comment to the user

### Resume Tab
- Period-based aggregation of time entries: current week, month, quarter, year, or `allTime`
- Breakdown by project and task
- Visual summary of worked hours over the selected period

### Scheduled PDF Reports
From the project Reporting tab → Scheduled Reports sub-tab:
- Create schedules: frequency (weekly/monthly), recipients (email list), content (summary, tasks, time entries)
- `pdfReportScheduler.ts` runs hourly, generates PDF with PDFKit, sends via SMTP
- Schedule CRUD API: `/api/project-report-schedules`

---

## 10. Call Records

### Overview
Call Records (`/call-records`) track phone calls, meetings, or any communication event linked to a project or task.

### Fields
- **Call Date**, **Start Time**, **Duration (minutes)**
- **Call Type** (customizable: Meeting, Call, Support, etc.)
- **Participants** (free-text list of attendees)
- **Subject** (title of the call)
- **Notes** (rich text description)
- **Organization** (optional link)
- **Project** (optional link)
- **Task** (optional link)

### Manual Creation
Click "New Call Record" → fill the form → Save.  
The record appears immediately in the list with date, duration, participants, and linked project/task.

### CSV Import
1. Click "Import CSV" → download the template
2. Template columns: `callDate`, `startTime`, `durationMinutes`, `callType`, `participants`, `subject`, `notes`
3. Upload filled CSV → preview shown → confirm import
4. Success summary shows count of imported records
5. Invalid rows (missing required fields, bad date format) are flagged with an error

### Microsoft Teams Import
1. Click "Import from Teams"
2. Select a period: **7 days**, **30 days**, **90 days**, or **custom date range**
3. System polls the Teams integration for call data
4. Duplicate detection skips calls already imported (based on call date + participants hash)
5. Result summary: imported / skipped / failed counts

### Filtering & Search
- Filter by date range, call type, project
- Search by subject or participant name
- Filters combine (AND logic)
- "Clear Filters" restores the full unfiltered list

### Call Timer
Each call record has a timer button. Starting it creates an `ActiveTimers` entry with `TimerType = 'call'`.  
Stopping the call timer updates the record's `DurationMinutes` field with the elapsed time.  
Call timers do **not** create `TimeEntries` — they only affect call record duration.

---

## 11. Active Timers

### Overview
The Active Timer system allows users to time their work or calls in real-time. At most **one active timer per user** is permitted at any time. The system uses the `ActiveTimers` database table with fields: `UserId`, `TaskId` (nullable), `StartedAt`, `TimerType` (`task` or `call`), `CallRecordId` (nullable).

### Starting a Timer

**Task timer**:
1. Open a task detail modal
2. In the "Timer" section click **Start Timer**
3. Server creates an `ActiveTimers` record with `TimerType = 'task'`
4. The modal shows a live elapsed counter (HH:MM:SS, updated every second)

**Call timer** (see [Call Records](#10-call-records)):
1. On the Call Records page, click the timer icon on a record
2. Server creates an `ActiveTimers` record with `TimerType = 'call'`

**Switching context while a timer is already active**:
1. Open the target task detail (or target call in Call Records)
2. Start timer in that target context while one is running
3. Timesheet is not a timer-switch surface; it only reflects persisted time entries after stop/switch
4. Backend auto-persists the existing timer first
5. New timer starts after persistence completes
6. UI labels this as **Switch & Save** in task context

### Navbar Timer Indicator
When any timer is running, the Navbar displays a persistent **live timer button**:
- Shows elapsed time in HH:MM:SS format, updated every second via a client-side interval
- Syncs with server every ~60 seconds (polls `/api/timers/active`) to stay accurate across tabs/reloads
- For task timers: shows the linked task name
- For call timers: shows the call subject or type
- Clicking the indicator opens the **Timer Start Modal** where the user can stop, discard, or start a new timer
- Starting a new timer from this state preserves previous elapsed work (auto-save), it does not discard previous run

### Stopping a Timer
1. Click the Navbar timer indicator → Stop Timer
2. Elapsed seconds calculated from `ActiveTimers.StartedAt` → current time
3. **Task timers**: A time entry is created automatically for the task. User confirms or adjusts the description.
4. **Call timers**: The `CallRecords.DurationMinutes` field is updated with elapsed minutes. No time entry is created.
5. `ActiveTimers` record deleted
6. Navbar indicator disappears

### Discarding a Timer
- Clicking "Discard Timer" in the timer modal immediately deletes the `ActiveTimers` record without creating any time entry or updating any call record duration.

### Timer Persistence
- On page load / refresh the Navbar polls `/api/timers/active`
- If a record exists, the counter is initialized from the server timestamp (`StartedAt`)
- Elapsed time is always server-authoritative (not dependent on client clock uptime)

---

## 12. Memos

Memos are personal or shared notes with calendar integration.

### Fields
- Title, Content (rich text with images)
- **Visibility**: `private` (creator only), `organizations` (all members of creator's orgs), `public` (all users)
- Tags (comma-separated; used for filtering)
- `CreatedAt` timestamp (used for calendar display)

### Calendar Interface
- Month grid calendar displayed alongside the memo list
- Bold dates on the calendar indicate days that have memos
- **Today** highlighted in blue
- **Selected date** (when date filter active) highlighted in dark blue

### Date Filter (Toggle Behavior)
- **Default**: Date filter disabled — all memos across all dates shown
- **Click a date**: Filter activates — only memos from that date shown; selected date highlighted
- **Click same date again**: Filter deactivates — all memos shown again; date highlight removed
- "Clear Date Filter" button appears when filter is active

### Other Filters
- **Visibility filter**: All / Private / Organizations / Public
- **Tag filter**: Click a tag to activate; click again to remove; multiple tags can be active (AND logic)
- "Clear All Filters" button appears when any filter is active
- "Show All Memos" shortcut shown when date filter is active and returns no results

---

## 12b. Expenses (Optional)

Optional module for project and internal (overhead) expenses with invoice attachments, approval, and partial reimbursement.

### Feature flags (Administration → Features & AI)
- `expensesEnabled` — default **off**; when disabled, APIs return 403 and the navbar link is hidden
- `autoApproveExpenses` — when on, new expenses are created as approved

### Permissions
- `CanViewExpenses` / `CanCreateExpenses` / `CanManageExpenses` / `CanApproveExpenses`
- Team leaders can approve subordinates’ expenses (same pattern as time entries)
- Customer users never see the module

### Data model
- **ExpenseCategoryGroups** / **ExpenseCategoryValues** — per organization; default catalogue seeded on org create and lazy backfill; optional **MaxReimbursementAmount** per category caps reimbursable total
- **Expenses** — org-scoped; optional `ProjectId` / `TaskId` (null project = internal); `PaidBy` employee|company
- **ExpenseAttachments** — Base64 images/PDF invoices
- **ExpenseReimbursementPayments** — payment history for partial reimbursements

### Workflow
1. Submit expense (category, amount, date, optional project/task, invoice files)
2. Approve / reject (`Approvals & Expenses` → Expenses tab only; not on `/expenses`); rejected expenses set reimbursement to **not applicable**
3. Admins can **revert rejected** expenses back to pending for re-review
4. Manager/admin sets **amount to reimburse** (may be less than expense total) and records payments; can mark fully settled after a partial payment
5. After any reimbursement payment, submitters may only update **description** and **attachments**; admins can correct other fields from Approvals
6. Delete is allowed while `ApprovalStatus` is `pending`; **admins** may delete anytime from Approvals

### Surfaces
- `/expenses` list and form (create/edit while allowed; status is view-only)
- Organization detail → Expense Categories (groups + categories)
- Project overview → expenses section + approved total
- Approvals & Expenses → Expenses tab (approve/reject, reimbursement, admin corrections)
- Dashboard pending-approval badge
- Reporting Hub organization overview → approved expense totals (project vs internal, by group)

Expense amounts are **not** mixed into hourly `CostSpent` / budget hours calculations.

---

## 13. Dashboard & Analytics

### Dashboard (`/dashboard`)
Tabs:
- **Overview**: KPI cards (open tasks, overdue tasks, pending time entries, open tickets)
- **Calendar**: Month view showing tasks due on each day; click a day to see all tasks
- **Analytics**: Admin-only global KPIs, hours, top projects/contributors, plus a **Task analytics** 2×2 widget grid (priority breakdown, types of work, team workload, parent-task progress). Task widgets are a current-state snapshot; the period selector still drives hours and other period KPIs.

### KPI Cards & Drilldown
- Each KPI card is configurable (widget system via `DashboardKPIs` table)
- Clicking a card opens a drill-down modal with the backing list of records
- **Task/TimeEntry** rows in drill-down open the Task Detail Modal
- **Project** rows navigate to `/projects/:id`
- **Customer** rows navigate to `/customers/:id`
- **Ticket** rows navigate to `/tickets/:id`
- Summary totals on cards are derived from the same dataset as the drill-down (single source of truth)

### Analytics Period Selection
- Default: current month
- Period selector: this week, this month, this quarter, this year, **All Time**
- Charts and totals update for the selected period

---

## 14. Portfolio

`/portfolio` — high-level overview across all projects:
- **RAG health score** per project (Red/Amber/Green)
- Progress bars showing % completion
- Budget burn indicator
- Open ticket counts
- Filters: organization, status, RAG score
- Sort by: name, progress, budget, start/end date

---

## 15. Work Summary

`/work-summary` — aggregated view of a user's work over a period:

- **Period selector**: last 7 days, 30 days, 90 days, custom range
- **Entries section**: combined list of time entries + call records in chronological order
  - Time entries: shows task name, project, hours logged, description
  - Call records: shows subject (falls back to Subject if Notes is empty), duration, participants, linked project/task
- **Stats cards**: total hours worked, number of tasks touched, calls made
- **By-project breakdown**: hours grouped by project

### Work Summary Emails
Automated emails sent by `workSummaryScheduler.ts`:
- **Daily summary**: sent at end of user's configured work day
- **Weekly summary**: sent on Friday at end of day (configurable)
- Each summary breaks down worked hours by project, highlights overdue tasks
- `WorkSummaryEmailLog` table prevents duplicate sends on server restart
- Respects user's `work_summary` email preference

---

## 15b. Reporting Hub

Unified reporting at **`/reporting`** (nav: **Reporting**). Replaces standalone **Reports** (`/reports`) and **Advanced Reports** (`/web-reports`) as primary entry points; old URLs redirect into the hub (`/reports` → Extract; Explore remains `/web-reports` for admins/managers, linked from the hub).

Personal open/overdue work stays on the **Dashboard** (and Work Summary) — Reporting does not duplicate a My Work pack.

### Audience & gates

| Section | Who |
|---------|-----|
| **Organization**, **Portfolio**, **Delivery**, **Data Quality**, **Expenses** | Admins or managers (+ org membership) |
| **Capacity** | Admins/managers, or users with `CanViewOthersPlanning` |
| **Extract** | Internal users with `CanViewReports` |
| **Explore** | Admins and managers only (advanced pivots / saved reports) |

Customer portal users never see org-wide packs or Explore. APIs under `/api/reporting/*`, `/api/reports`, `/api/saved-reports`, and `/api/dynamic-reports` enforce the same rules.

### Filters

Shared bar: **organization** (required for manager packs), optional **project**, **date range**. Manager packs show metrics vs the **previous period of equal length**. Org context sticks across Organization / Portfolio / Delivery / Capacity / Data Quality.

### Packs

- **Organization** — health (RAG counts), effort (leaf estimated, **planned**, logged, leaf with/without hours, unscheduled), delivery throughput, risk signals; **charts** (RAG donut, planned vs logged, top projects, throughput, open vs overdue, estimate/schedule mix, optional RAG snapshot trend); **task analytics** widgets (priority, type, assignee workload, parent progress); drill into other packs; task/project rows link for quick navigation; optional **email digest** schedule (structured metrics).
- **Portfolio** — projects in org with RAG, progress, overdue, budget (if `CanViewBudgetInfo`); expandable leaf tasks; monetary spend uses the rate cascade (task → project → user); shows spent / remaining / burn % and flags hours without an effective rate; project name opens `/projects/:id`.
- **Delivery** — throughput / active sprints / recently closed for the org period; project and task links for navigation.
- **Capacity** — planned vs logged by org member; pending time approvals.
- **Data Quality** — unestimated leaf tasks, unassigned, no sprint (when project has sprints), stale overdue, pending approvals; CSV export; project/task links.
- **Expenses** — approved expense lines with category/group/submitter filters, reimbursable cap and reimbursement status (when `expensesEnabled`).
- **Extract** — CSV export datasets: projects, tasks, time entries, calls, customers, applications, releases, tickets, planning allocations, vacations, out-of-office, memos, and expenses (when the module is enabled).
- **Explore** — advanced pivot builder (former Advanced Reports); also `/web-reports` for managers/admins.

### History & digests (Phase 3)

- **`ProjectHealthSnapshots`** — daily job persists per-project health + key counts for trend charts.
- **`OrganizationReportDigests`** — weekly/monthly overview email to configured recipients (no LLM narrative).

### Out of scope here

AI narrative summaries; replacing project-level Reporting / scheduled project PDFs; full BI / arbitrary SQL for all users.

---

## 16. Permissions System

Permissions are evaluated at two levels: **Global Role Permissions** and **Organization Permission Groups**.

### Role-Based Permissions (Global)
Each user has boolean role flags: `IsDeveloper`, `IsSupport`, `IsManager`.  
The `RolePermissions` table defines allowed actions per role:

| Permission | Description |
|---|---|
| `CanViewDashboard` | Access dashboard and analytics |
| `CanViewPlanning` | Access the planning/Gantt page |
| `CanViewReports` | Access Reporting hub (Extract + manager packs by role); manager packs need admin/manager role |
| `CanViewBudgetInfo` | See budget-related data (project costs, hourly rates) |
| `CanManageProjects` | Edit existing project details |
| `CanCreateProjects` | Create new projects |
| `CanDeleteProjects` | Delete projects |
| `CanManageTasks` | Edit task details |
| `CanCreateTasks` | Create new tasks |
| `CanDeleteTasks` | Delete tasks |
| `CanAssignTasks` | Assign tasks to users |
| `CanManageTickets` | Edit ticket details |
| `CanCreateTickets` | Create new tickets |
| `CanDeleteTickets` | Delete tickets |
| `CanAssignTickets` | Assign tickets to users |
| `CanManageTimeEntries` | Log and edit time entries |
| `CanManageOrganizations` | Manage organization settings and members |
| `CanManageUsers` | Create and manage user accounts |

**Default role capabilities:**

| Permission | Developer | Support | Manager |
|---|---|---|---|
| CanViewDashboard | ✓ | ✓ | ✓ |
| CanViewPlanning | ✓ | ✓ | ✓ |
| CanViewReports | | ✓ | ✓ |
| CanViewBudgetInfo | | | ✓ |
| CanManageProjects | ✓ | | ✓ |
| CanCreateProjects | ✓ | | ✓ |
| CanDeleteProjects | | | ✓ |
| CanManageTasks | ✓ | | ✓ |
| CanCreateTasks | ✓ | | ✓ |
| CanDeleteTasks | | | ✓ |
| CanAssignTasks | | | ✓ |
| CanManageTickets | ✓ | ✓ | ✓ |
| CanCreateTickets | ✓ | ✓ | ✓ |
| CanDeleteTickets | | | ✓ |
| CanAssignTickets | | ✓ | ✓ |
| CanManageTimeEntries | ✓ | ✓ | ✓ |
| CanManageOrganizations | | | |
| CanManageUsers | | | |

### Permission Combination Rule
A user with **multiple roles** gets the **union** of all permissions (OR logic).  
A Manager role grants all of the above permissions regardless of other roles.  
`isAdmin = true` overrides everything — admin users have full access to all features.

### Organization Permission Groups
Each org can create `PermissionGroups` with org-specific overrides:
- Fields: `CanManageProjects`, `CanManageTasks`, `CanManageMembers`, `CanManageSettings`, `CanViewBudgetInfo`
- Assigned to members when adding them to an organization
- Budget visibility: `canViewBudgetInfo` is `TRUE` if **either** the role permission OR the org group permission allows it

### Frontend Usage
```typescript
const { permissions, isLoading } = usePermissions();
// Conditional UI:
{permissions?.canCreateProjects && <button>Create Project</button>}
```

### Backend Validation
All mutation endpoints check permissions server-side. Unauthorized requests return `403 Forbidden` even if the UI is bypassed.

---

## 17. Jira Integration

### Two-Tier Architecture
The integration supports **two separate Jira instances** per organization:

| Tier | Purpose | Config Fields |
|---|---|---|
| **Jira for Tickets** | Ticket management, issue search, status sync | `JiraUrl`, `JiraEmail`, `JiraApiToken`, `JiraProjectKey` |
| **Jira for Projects** | Project boards, kanban views | `JiraProjectsUrl`, `JiraProjectsEmail`, `JiraProjectsApiToken` |

Both instances can be the same Jira, but they are configured independently.
Project issue import prefers **Jira for Projects** credentials and falls back to **Jira for Tickets** credentials when Projects credentials are not configured.

### Configuration
In Organization Settings → Jira Integration tab:
1. Enable the integration (`IsEnabled` toggle)
2. Enter credentials for the Tickets instance
3. Test the connection
4. (Optional) Enter credentials for the Projects instance
5. Save

API tokens are encrypted with AES-256-CBC before storage and never returned in API responses.

### Project-Level Board Association
- Project Settings → Jira Board ID field (only visible when Projects integration is configured)
- Links a project to a specific Jira board URL
- Used to fetch issues from that board for display/import

### Ticket ↔ Task Relationship Chain
```
Tasks.TicketId → Tickets.Id
Tickets.ExternalTicketId → Jira issue key
Tickets.OrganizationId → OrganizationJiraIntegrations.OrganizationId → JiraUrl
```
Task detail modal shows a Jira badge that opens the correct Jira URL in a new tab.

### Features
- **Search Jira issues** while creating/editing a ticket (queries Tickets Jira instance)
- **Import tasks from Jira** board (queries Projects Jira instance)
- **Check Jira Ticket Status**: batch query current Jira statuses for all linked tasks; selectively update local task statuses with global mapping + per-ticket override (see [Tasks section](#6-tasks))
- **Jira board view** in project detail

### Jira Search Behavior (Configured JQL + Search Text)
- Organization-level `JiraTicketsJqlFilter` is applied by default
- If the user provides explicit search text, search can bypass configured JQL to prioritize direct lookup
- Query supports key, summary, and description matching
- Default ordering is newest-first unless configured JQL defines an `ORDER BY`

---

## 18. Email & Notifications

### SMTP Configuration
In Administration → System Settings → Email Settings:
- SMTP Host, Port, Username, Password (stored encrypted), TLS/SSL toggle
- FROM Name and FROM email address
- Test email button to verify settings

Saving an empty SMTP password field clears the stored password (no masked placeholder token returned in API).

### Notification Types
| Event | Trigger | Recipient |
|---|---|---|
| Task assigned | Task `AssignedTo` changed | New assignee |
| Task priority changed | Priority field updated | Task assignee |
| Task status changed | Status field updated | Task assignee |
| Ticket assigned | Support/Developer field changed | Newly assigned user |
| @mention in comment | `@username` parsed after comment save | Mentioned user |
| Due date reminder | 1 day before `DueDate` | Task assignee |
| Work summary | Daily/weekly schedule | Each user |
| Project PDF report | Scheduled (weekly/monthly) | Configured recipients |

### In-App Notifications
`createNotification()` inserts a record in `Notifications` and emits a `'notification'` WebSocket event via `socket.io` to the relevant user's connected browser tab. The Navbar shows a badge count and prepends the notification to the bell-icon dropdown without requiring a page refresh.

### Email Preferences
Each user can opt out of specific notification types in their Profile → Email Preferences panel. Preferences stored per user; disabled types skip email sending while in-app notifications still fire.

---

## 19. Search & Navigation

### Global Search
Accessible via the search icon in the Navbar:
- Searches across: Tasks, Projects, Organizations, Users
- Results appear as-you-type (debounced)
- Each category shows paginated results with a **Load More** button
- Clicking a result navigates to the detail page for that entity

### Searchable Dropdowns (`SearchableSelect`)
Single-select dropdowns with a type-to-filter input:
- Case-insensitive filtering
- Matches display label and subtitle
- Works with large lists (100+ items)
- Used for: users, projects, tasks, statuses, applications, etc.

### Searchable Multi-Select (`SearchableMultiSelect`)
Multi-select dropdowns with checkbox selection:
- Search input filters the checkbox list
- "Clear all" button removes all selections
- Selected count badge shown on the trigger button
- Used for: customer → application associations, organization multi-select, etc.

### Navbar
- Links adapt based on user permissions (hidden when no access)
- Active Timer indicator (see [Active Timers](#11-active-timers))
- Notification bell with real-time badge count
- User avatar/name with dropdown: Profile link, Logout
- Theme toggle (light/dark)
- Global search icon

---

## 20. Administration

### System Settings (`/administration`)
Admin-only page:

- **General**: App name, logo, branding, demo mode flag
- **Email / SMTP**: Configure mail server (see [Email & Notifications](#18-email--notifications))
- **Outlook calendar**: Microsoft Graph credentials and enable toggle
- **Jira / GitHub / Gitea**: Organization-level integration credentials (see respective sections)
- **AI Assistant**: Provider (OpenAI or Ollama), credentials/model, enable toggle
- **Timezone**: Default system timezone
- **Task Form**: Global template for which task modal fields/tabs are visible (see [Task Form Visibility](#task-form-visibility-fields--tabs))
- **User Management**: Create, edit, activate/deactivate users; assign global roles; set hourly rate; manage admin flag
- **Activity Logs**: Audit log of all admin actions

Server operators may also set `REDIS_ENABLED` and related env vars (see [Redis Cache](#25-redis-cache-optional)); not configured in the UI.

### Branding
- Company name, logo, and favicon under Administration → System Settings → Branding
- Logo / favicon accept an external URL **or** an upload stored under `/uploads/branding/…` (PNG/JPEG/WebP/SVG/ICO)
- Uploaded assets fill the URL fields with the local path; Navbar / layout / PDFs use the stored value

### AI Assistant Widget
- Available as a floating widget on supported views
- Queries the backend AI assistant (`/api/ai-assistant`) which answers natural language questions about project data
- Assistant has read access to tasks, allocations, time entries, and org members via database views (see `docs/AI_ASSISTANT_VIEWS.md`)
- **Providers**: **OpenAI** (API key + model) or **Ollama** (Base URL + model name, OpenAI-compatible `/v1/chat/completions`)
- Same provider is used for translate/summarize on tasks and AI patch-notes improvement

#### Assistant Modes (Analytics vs Docs)
- The widget includes a mode toggle:
  - **Analytics mode**: Answers with organization/project/task/time context from AI backend views.
  - **Docs mode**: Answers from curated in-app documentation context (module usage, workflows, permissions, settings).
- Docs mode injects only relevant documentation sections based on query keywords, not the full manual.
- If the question clearly has documentation intent, backend may route to docs-context response flow.
- Responses remain English-only by assistant policy.

#### Availability and Access Rules
- Assistant visibility requires global AI enablement + a configured provider in System Settings (OpenAI key, or Ollama base URL + model).
- Analytics answers still enforce report/visibility permission constraints for business data scope.
- Budget insights remain hidden when `canViewBudgetInfo` is denied.

---

## 21. API Tokens

Personal integration tokens for scripts, Cloudflare Workers, and IDE extensions.

### Creating Tokens
1. **My Profile → API Tokens** (any signed-in user) — manage your own tokens
2. Create token with name and optional expiry
3. Copy the `pt_...` secret immediately (shown only once)

Admins can also open **Administration → API Tokens** to see **all** users’ tokens (revoke/delete any). Creating a token there still creates it for the admin’s own account.

### Using Tokens
- Send as `Authorization: Bearer pt_...` on API requests
- Authenticates as the token owner (same effective access as that user)
- Webhooks (e.g. email task queue) require a valid active token

### Revoking Tokens
- **Deactivate** — immediate revocation; cached auth invalidated
- **Delete** — permanent removal from list

Admins can view all tokens under Administration; regular users manage only their own under My Profile.

---

## 21b. SSO for companion apps (PM Synapse)

Minimal OAuth-style handoff so companion apps (e.g. **PM Synapse**) can use the same users without planner UI changes.

1. Companion redirects the browser to `/sso/authorize?redirect_uri=…&state=…&client_id=…`
2. User logs in on PM if needed (`returnUrl` supported on `/login`)
3. PM issues a one-time code via `POST /api/sso/handoff` (authenticated)
4. Companion backend exchanges the code at `POST /api/sso/token` for a short-lived PM **access** JWT plus a longer **refresh** JWT
5. Before the access token expires (or after idle), companion calls `POST /api/sso/token` with `grant_type=refresh_token` + `refresh_token` (same client credentials) to get a new pair without browser login

Env: `ALLOWED_SSO_REDIRECTS`, `SSO_CLIENT_ID` / `SSO_CLIENT_SECRET` (or `SSO_CLIENTS`). No Navbar or task deep links.

Access JWT TTL: 8h. Refresh JWT TTL: 30 days (`typ: sso_refresh`). Sliding `X-New-Token` on authenticated API calls still applies when the companion is actively calling PM.

---

## 22. Outlook Calendar Integration

### Admin Configuration
System Settings → Outlook calendar:
- Enable integration toggle
- Azure AD: Tenant ID, Client ID, Client Secret (**Value**, not Secret ID)
- Credentials encrypted at rest (`ENCRYPTION_KEY` or `JWT_SECRET`)

### User Experience
- Dashboard Calendar tab can include Outlook events (when enabled)
- Planning Gantt overlays events for the visible date range
- Load is asynchronous; planning remains usable while calendar syncs

### Privacy
- Users see full details for their own events
- Other users' events display as **Busy** on the planning timeline

---

## 23. Email Task Queue (Cloudflare)

Per-user queue for turning emails into tasks. Setup: [cloudflare/README.md](../extras/cloudflare/README.md).

### Flow
1. Cloudflare Email Routing delivers mail to a Worker
2. Worker POSTs to `/api/webhooks/email-task-queue` with API token auth
3. Server queues row in `EmailTaskQueue` when sender matches active `Users.Email`
4. User imports from project → **Import from Outlook Queue**

### Idempotency & Security
- `ExternalMessageId` (Message-ID header) deduplicates retries
- Unknown senders accepted with 202 but not queued
- API token required on webhook; queue owner resolved from email From address

---

## 24. GitHub & Gitea Integration

Per-organization integration (Organization settings):

| Integration | Config | Import |
|---|---|---|
| **GitHub** | URL + personal access token | Project → Import from GitHub |
| **Gitea** | URL + API token | Project → Import from Gitea |

Tokens encrypted like Jira credentials. Issue search and import follow the same pattern as Jira board import.

---

## 25. Redis Cache (Optional)

Optional read-through cache for performance on a single VPS. **Disabled by default** (`REDIS_ENABLED=false`).

### Behaviour
- MySQL/MSSQL remain the only source of truth
- Reads cached for lists, planning bootstrap, settings, KPIs (short TTL for aggregates)
- **Invalidate-on-write** after every create/update/delete — next read is fresh
- Active timers and live notification counts are not cached
- If Redis is down, app falls back to database (`/health` still reports `redis: error` without failing)

### Configuration
```env
REDIS_ENABLED=true
REDIS_URL=redis://localhost:6379
REDIS_KEY_PREFIX=pm:
REDIS_DEFAULT_TTL_SECONDS=300
```

Docker: `docker compose --profile redis up -d`

---

## 26. IDE Extensions (Project Kanban)

IDE plugins that show a **project Kanban** (project dropdown, drag-and-drop status columns) using `pt_` API tokens. Shared board UI under [`ide-extensions/shared-kanban`](../extras/ide-extensions/shared-kanban/).

| IDE | Location |
|-----|----------|
| VS Code / Cursor | [`ide-extensions/vscode`](../extras/ide-extensions/vscode/) |
| Rider | [`ide-extensions/rider`](../extras/ide-extensions/rider/) |
| Visual Studio 2022 | [`ide-extensions/visualstudio`](../extras/ide-extensions/visualstudio/) |

Setup, contract, and test checklist: [`ide-extensions/README.md`](../extras/ide-extensions/README.md) · [`ide-extensions/CONTRACT.md`](../extras/ide-extensions/CONTRACT.md)

### Behaviour
- Auth: `Authorization: Bearer pt_…` + Base URL
- Data: `GET /api/projects`, `GET /api/tasks/project/{id}`, `GET /api/status-values/task/{orgId}`, DnD via `POST /api/tasks/reorder-kanban`
- **Send to AI Chat…** on cards (Cursor uses the active chat; Rider/VS clipboard)
- Self-signed HTTPS not supported in v1

### Tampermonkey: Task # links in git commit history
Userscript [`scripts/tampermonkey/pm-task-commit-links.user.js`](../scripts/tampermonkey/pm-task-commit-links.user.js) turns `Task #N` on GitHub / Bitbucket / Gitea commit pages into links to `/dashboard?task=N` (opens `TaskDetailModal`). Configure one PM base URL per git host in `PM_BY_HOST` (or Tampermonkey menu override).

Deep-link handled by the app: `/dashboard?task=<id>` (also `?taskId=`).

---

## 27. Mobile (phases 1–3)

Phone layouts (viewport ≤767px / Tailwind `md`). Shared hook: [`hooks/useIsMobile.ts`](../hooks/useIsMobile.ts).

### Phase 1 — daily work

| Surface | Behaviour |
|---------|-----------|
| Top Navbar | Hamburger drawer with primary links (`md:hidden`); search hidden below `sm` |
| Dashboard | Horizontal tabs instead of `w-64` aside; stacked welcome header; mobile **Install app** PWA banner (Synapse-style) |
| Projects list | Grid view forced on phone; RAG tiles `2×2`; list table scrolls if used |
| Project detail | Horizontal scrollable tabs; denser main padding |
| TaskDetailModal | Full-height sheet; scrollable tabs; denser header |
| Timesheet | Scrollable Daily/Weekly tabs; denser padding; edit form stacks |

### Phase 2 — ops, org, admin, reports, auth

| Surface | Behaviour |
|---------|-----------|
| Customer / Organization / Profile / Administration | Horizontal tabs replace `w-64` aside below `md` |
| Applications detail (Versions) | Version list stacks above detail panel on phone |
| Customer / Organization / Application lists | Grid forced on phone; view toggle hidden below `sm`; KPI tiles denser `2×2`; toolbars wrap |
| Tickets / Call records / Notifications / Memos | Stacked toolbars; wrap action buttons |
| CallRecordFormModal / ConfirmAlertModal / auth forms | Stacked grids / denser padding |
| Work summary / planning-import | Denser page padding |

### Phase 3 — Planning Gantt

| Surface | Behaviour |
|---------|-----------|
| Planning (`/planning`) | `canPlanOnThisDevice = canPlanTasks && !isMobile`; drag/resize/tools/deletes disabled on phone |
| RO banner | Distinct message when locked for device vs missing permission |
| Toolbar | Date nav / view controls wrap on narrow widths |

**URL tabs:** Project / Customer / Organization / Profile / Administration / Application detail sidebars write `?tab=` so a hard refresh restores the active panel.

Planning remains desktop-first for editing.

---

## Appendix: Key Database Tables

| Table | Purpose |
|---|---|
| `Users` | User accounts, roles, work hours, hourly rate |
| `RolePermissions` | Global capability set per role |
| `Organizations` | Top-level grouping entity |
| `OrganizationMembers` | User ↔ Org membership with role and permission group |
| `PermissionGroups` | Org-specific permission overrides |
| `Customers` | External client records |
| `CustomerUsers` | Portal user accounts scoped to a customer |
| `Applications` | Software products |
| `ApplicationVersions` | Versioned releases with patch notes |
| `Projects` | Projects; linked to org, customer, application |
| `Tasks` | Tasks with hierarchy (ParentTaskId), dependencies, and status |
| `TaskAssignees` | Multiple assignees per task (junction table) |
| `TaskChecklists` | Ordered checklist items per task |
| `TaskTemplates` / `TaskTemplateItems` | Reusable task templates |
| `TaskAllocationHeaders` | Planning slice identity (per task/user/split) |
| `TaskAllocations` | Per-day allocated hours (linked to header) |
| `TaskChildAllocations` | Parent allocation time split across child tasks |
| `ActiveTimers` | Currently running timers; `TimerType`: `task` or `call` |
| `TimeEntries` | Actual worked hours per task/user/date |
| `CallRecords` | Meeting and call logs |
| `Tickets` | Support tickets with SLA, status, and Jira linkage |
| `Memos` | Rich-text personal or shared notes |
| `Sprints` | Iteration planning linked to projects |
| `Notifications` | In-app notification inbox |
| `DueDateReminderLog` | Deduplication log for due-date reminder emails |
| `WorkSummaryEmailLog` | Deduplication log for work summary emails |
| `PasswordResetTokens` | Single-use tokens for password recovery |
| `OrganizationJiraIntegrations` | Jira credentials per org (two-tier) |
| `ApiTokens` | Personal API tokens (`TokenHash`, prefix, expiry) |
| `EmailTaskQueue` | Pending emails for task import per user |
| `SLARules` | Per-org per-priority SLA thresholds |
| `ProjectReportSchedules` | Scheduled PDF report config |
| `ProjectHealthSnapshots` | Weekly/daily org project health bands for Reporting trends |
| `OrganizationReportDigests` | Scheduled Organization Overview email digests |
| `DashboardKPIs` | Configurable KPI widget definitions |
