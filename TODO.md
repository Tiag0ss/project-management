# Project TODO

## 🔧 Improvements to Existing Features

### Task Management
- [x] **Task completion percentage** — `CompletionPercentage` int field added to `Tasks`.
- [x] **Kanban drag-to-reorder** — Uses existing `DisplayOrder` field via `tasksApi.updateOrder`. Drag within and between columns fully working.
- [x] **Multiple assignees per task** — `TaskAssignees` junction table schema created (`TaskId`, `UserId`, `AssignedAt`, `AssignedBy`).

### Time Entries
- [x] **Approval workflow** — `ApprovalStatus`, `ApprovedBy`, `ApprovedAt` fields added to `TimeEntries`. New endpoints: `GET /pending-approval/organization/:orgId` and `PUT /:id/approval`.
- [x] **Timer / start-stop tracking** — `ActiveTimers` table + `/api/timers` backend; start/stop/discard UI in TaskDetailModal with live elapsed counter.

### Tickets
- [ ] **Fix ticket status to use `TicketStatusValues` table** — `Tickets.Status` is a raw varchar (`"Open"`, `"Closed"`). Should be FK to `TicketStatusValues` like tasks use `TaskStatusValues`. Same for `Priority`.
- [ ] **SLA / response time tracking** — Add `FirstResponseAt`, `ResolvedAt` fields and breach alerts based on SLA rules per organization.

### Projects
- [x] **Budget tracking** — `Budget` decimal(15,2) field added to `Projects` schema. Auto-calculated `BudgetSpent` from time entries × user hourly rate pending UI.
- [x] **Automatic RAG health score** — Auto-calculate Red/Amber/Green status based on overdue tasks, unassigned work, and budget overrun. Displayed as a coloured banner in Project Overview.

### Planning / Gantt
- [ ] **Critical path highlighting** — Use existing `DependsOnTaskId` dependencies to calculate and visually highlight the critical path in the Gantt.
- [ ] **Baseline comparison** — Store original planned dates as a baseline and show drift vs current planned dates (scope creep tracking).

### Notifications
- [x] **Email notifications for task events** — `sendNotificationEmail` wired in `server/routes/tasks.ts` for assignment, priority change, and status change events (alongside existing in-app `createNotification` calls).
- [x] **@mention system in task comments** — Parses `@username` in comment plain text after save; creates in-app notification + email for each mentioned user (deduplicates within same comment).

### Reports
- [x] **Export time entries to CSV** — Export CSV button in the All Entries (History) tab of the Timesheet page. Applies current date/project/task filters. PDF and scheduled reports still pending.
- [ ] **Scheduled PDF report by email** — Weekly/monthly project report PDF sent automatically to project managers.

---

## 🆕 New Features

- [x] **Project Portfolio Dashboard** — `/portfolio` page with RAG health, progress bars, budget burn, open tickets; filter by org/status/RAG; sort by name/progress/budget/date; Navbar link added.
- [x] **Due date reminder emails** — `dueDateReminderScheduler.ts` runs hourly; sends amber warning email 1 day before `DueDate` per task. Deduplicates via `DueDateReminderLog` table. Respects `due_date_reminder` email preference.
- [ ] **Sprint / Iteration Management** — Add `Sprints` table linked to projects. Tasks assigned to sprints with start/end dates, velocity tracking, and burndown charts.
- [ ] **Real-time notifications via WebSocket** — Replace polling-based notifications with `socket.io` push notifications for instant updates on task assignments and comments.
- [ ] **Task Templates** — Save a task (with subtasks and standard estimates) as a reusable template to speed up repeated project setups.
- [x] **Task Checklists** — `TaskChecklists` table, full CRUD API (`/api/task-checklists`), and checklist tab in TaskDetailModal with progress bar and checkbox items.
- [ ] **Burndown / Burnup Charts** — Use `TimeEntries` + `EstimatedHours` + sprint dates to render burndown per project or sprint. Data already exists.
- [ ] **Customer Portal** — Dedicated portal view for customers (using existing `CustomerUsers` + `CustomerUserGuard`) — see their own tickets and project status without internal access.
- [x] **Task Dependency Graph** — New 🔗 Dependencies tab in the project detail page; SVG DAG with topological layout, colour-coded status stripes, bezier arrows and click-to-open task modal.

---

## 🏗️ Technical Debt

- [x] **API rate limiting** — `express-rate-limit` middleware applied to all API routes (`authLimiter` + `apiLimiter` in `server/index.ts`).
- [x] **Server-side HTML sanitisation** — `sanitize-html` installed; `sanitizeRichText()` and `sanitizePlainText()` in `server/utils/sanitize.ts`. Applied to tasks, task comments, memos, and tickets.
- [ ] **Expand automated test coverage** — `__tests__/` only has basic health and validation tests. Add integration tests for key routes (tasks, time entries, projects).
- [x] **Global search pagination** — `page` query param + `OFFSET` added to all four search queries in `search.ts`. Response includes `{ page, limit, hasMore }`. Navbar shows a **Load More** button when more pages exist.
- [x] **User hourly rate field** — `HourlyRate` decimal(10,2) added to `Users` table. Editable in profile page ($ prefix) and admin Users Management. Used in budget calculations.

---

## ✅ Completed

- [x] **Email notifications for task events** — `sendNotificationEmail` called for assignment, priority change, and status change in `server/routes/tasks.ts`.
- [x] **Export time entries to CSV** — Client-side CSV export in Timesheet → All Entries tab with active filter support.
- [x] **Automatic RAG health score** — Red/Amber/Green project health banner in Project Overview based on overdue tasks, budget %, and unassigned tasks.
- [x] **Global search pagination** — `page`/`OFFSET` in `search.ts`; Load More button in Navbar search dropdown.

- [x] **Timezone support** — Added timezone field to user profile and admin system settings with IANA dropdown.
- [x] **Work summary emails** — Daily and weekly work summary scheduler with hobby/work split and overdue highlighting.
- [x] **Duplicate email prevention** — `WorkSummaryEmailLog` DB table prevents re-sending on server restart.
- [x] **Planned dates read-only in task modal** — Planned Start/End Date no longer editable in TaskDetailModal; managed via planning.
- [x] **Dashboard due date fix** — Dashboard now uses `DueDate` instead of `PlannedEndDate` for overdue detection.
- [x] **API rate limiting** — `express-rate-limit` applied to all API routes.
- [x] **Server-side HTML sanitisation** — `sanitize-html` applied to tasks, comments, memos, and tickets.
- [x] **User hourly rate** — `HourlyRate` field on `Users`; editable in profile and admin UI.
- [x] **Task completion percentage** — `CompletionPercentage` field + range slider in TaskDetailModal.
- [x] **Task checklists** — `TaskChecklists` table, full CRUD API, checklist tab in TaskDetailModal.
- [x] **Time entry approval workflow** — `ApprovalStatus`/`ApprovedBy`/`ApprovedAt` on `TimeEntries`; pending-approval + approval API endpoints.
- [x] **Budget tracking (schema)** — `Budget` decimal field on `Projects`.
- [x] **Multiple assignees (schema)** — `TaskAssignees` junction table schema.
- [x] **@mention in task comments** — Parses `@username` after comment save; creates notification + email per mentioned user.
- [x] **Due date reminder emails** — `dueDateReminderScheduler.ts` sends 1-day-before reminders; `DueDateReminderLog` prevents duplicates.
- [x] **Kanban drag-to-reorder** — `DisplayOrder` persistence via `tasksApi.updateOrder` in Kanban board.
