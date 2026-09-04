# IDE Extensions — API Contract

Shared contract for VS Code / Cursor, Rider, and Visual Studio extensions.

## Auth

| Item | Value |
|------|--------|
| Header | `Authorization: Bearer pt_<token>` |
| Token source | App → Profile → API Tokens |
| Test call | `GET /api/user/profile` |

Successful profile response includes at least `username` / `Username` and `email` / `Email`.

The Kanban board UI runs in a host webview and calls these endpoints with the same `pt_` token (injected by the host). Do **not** embed the Next.js SPA (it needs a separate JWT session).

## Endpoints

### `GET /api/user/profile`

Connection test. Any `2xx` with a user identity means the token works.

### `GET /api/projects`

Project dropdown. Returns `{ success: true, projects: Project[] }` for orgs the user belongs to.

Relevant fields: `Id`, `ProjectName` / `Name`, `OrganizationId`, `OrganizationName`.

### `GET /api/tasks/project/{projectId}`

Kanban cards for one project. Returns `{ success: true, tasks: Task[] }` (subject to manage/plan/own-task visibility rules on the server).

Relevant fields:

| Field | Type | Notes |
|-------|------|-------|
| `Id` | number | Task id |
| `ProjectId` | number | |
| `OrganizationId` | number | From project (needed for status list) |
| `ProjectName` | string | |
| `TaskName` | string | |
| `Description` | string \| null | **HTML** rich text |
| `Status` | number | Status value id |
| `StatusName` | string | |
| `DisplayOrder` | number | Column order |
| `PriorityName` | string | |
| `PriorityColor` | string | Optional card accent (left border) |
| `PrioritySortOrder` | number | Lower = higher priority |
| `TaskTypeName` | string | Shown on card meta chip |
| `TaskTypeColor` | string | Optional type chip color |
| `DueDate` | string \| null | ISO / date string |

### `GET /api/status-values/task/{organizationId}`

Kanban columns. Returns `{ success: true, statuses: StatusValue[] }` for the org (requires membership).

Relevant fields: `Id`, `StatusName`, `ColorCode`, `SortOrder`, `IsDefault`, `IsClosed`, `IsCancelled`, `IsInProgress`, `HideFromPlanningAndStatistics`.

### `GET /api/status-values/priority/{organizationId}`

Priority options for create-task. Returns `{ success: true, priorities: PriorityValue[] }`.

Relevant fields: `Id`, `PriorityName`, `ColorCode`, `SortOrder`, `IsDefault`.

### `POST /api/tasks`

Create a task (org membership required). Minimum body:

```json
{
  "projectId": 42,
  "taskName": "New task",
  "status": 7,
  "priority": 3
}
```

`status` / `priority` are org FK ids (not names). `taskType` is optional (server picks org default).

Success `201`: `{ success: true, message, taskId }` (top-level `taskId`).

### `POST /api/tasks/reorder-kanban`

Drag-and-drop commit (same as web Kanban).

Body:

```json
{
  "updates": [
    { "taskId": 1, "displayOrder": 10, "status": 3 }
  ]
}
```

- Drop on empty column: one update (new status + end order).
- Drop on a card: reassign gap orders `10, 20, 30…` for the target column (include `status` when moving columns).
- Surface `message` from non-2xx responses (including workflow policy blocks).

### `PUT /api/tasks/{id}`

Optional single-task status update `{ "status": <StatusValueId> }`. Prefer `reorder-kanban` for board DnD.

## Kanban UX (v1)

1. Host injects `{ type: 'config', baseUrl, token, selectedProjectId, aiInProgressStatusId, … }`.
2. Board loads projects → searchable project picker → loads statuses, priorities, active timer, and project tasks.
3. Tasks are filtered to the API-token user (`AssignedTo` or `TaskAssignees`).
4. Columns sorted by `SortOrder`; cards by `DisplayOrder` within `Status`.
5. **Add task** / column **+** → create modal → `POST /api/tasks` (with `assignedTo` = current user).
6. **Timer** on cards + toolbar Stop for the active timer (`/api/timers/*`).
7. **AI** sets In Progress (when resolvable) then prefills chat.
8. Card actions: **Timer** / **AI** / **View** / **App**.
9. Persist last `selectedProjectId` in host settings.

Shared assets: [`shared-kanban/`](./shared-kanban/) (`board.css`, `board.js`). Hosts copy into their resource folders.

## HTML → plain text

Apply before AI prompts:

1. Remove `<style>…</style>` and `<script>…</script>` (case-insensitive)
2. Replace `<br>` / `<br/>` with `\n`
3. Replace `</p>` with `\n\n`
4. Strip remaining tags: `<[^>]+>` → space
5. Decode `&nbsp;` `&amp;` `&lt;` `&gt;` `&quot;` `&#39;`
6. Collapse spaces/tabs; collapse 3+ newlines to 2; trim

## Open in app

```text
{baseUrl}/projects/{ProjectId}?tab=tasks&taskId={Id}
```

Opens the project Tasks tab and auto-opens `TaskDetailModal` (same as Synapse deep links). Legacy `?task=` is also accepted.

No trailing slash on `baseUrl`.

## Board card actions

| Action | Behaviour |
|--------|-----------|
| Project search | Filterable combobox (name + organization) |
| Add task / column + | Webview create modal → `POST /api/tasks` |
| Timer / Stop | Start or stop via `/api/timers/*` (start switches previous) |
| Toolbar Stop | Stops active timer even if task not on board |
| View | IDE read-only task preview (VS Code/Cursor); Rider/VS open the deep link. Sets active task for commit messages. |
| Commit | Copy `Task #Id - Task Name`; sets active task for Cursor Generate commit message |
| App | Browser deep link to the full task modal |
| AI | Set In Progress (optional) + prefill AI chat / clipboard; sets active task |
| Timer | Start/stop; start sets active task |

## Active task → Cursor commit messages

Cursor’s SCM **Generate commit message** button does **not** use `.cursor/rules` or User Rules. It does read a repo-root **`.cursorrules`** file.

When you activate a task from the Kanban (Commit / AI / View / Timer start), the VS Code/Cursor extension:

1. **Adds** the task to `.git/pm-active-task.json` (list of all tasks since last commit — not a single overwrite)
2. Upserts a managed block in `.cursorrules` listing **every** active task as `Task #<Id> - <Name>`
3. Installs `.git/hooks/prepare-commit-msg` + `.git/hooks/post-commit` (only if missing or already ours):
   - **prepare-commit-msg**: appends any missing `Task #Id` lines before the commit is created
   - **post-commit**: clears the active-task list (and the `.cursorrules` block) after a successful commit

**Workflow (personal projects in Cursor):** open that project folder → use Kanban on each task you touch → stage changes → Generate commit message / commit. Expect all touched `Task #…` references until the commit succeeds, then the list resets.

Optional repo-checked hooks (this monorepo): `git config core.hooksPath .githooks`

Add `.cursorrules` to `.git/info/exclude` in personal clones if you do not want that file committed.

## AI prompt templates

### Name only

```text
Help me work on this task: {TaskName}
```

### Name + description

```text
Help me work on this task:

Title: {TaskName}

Description:
{DescriptionPlain}
```

### Full context

```text
Help me work on this task:

Title: {TaskName}
Project: {ProjectName}
Status: {StatusName}
Priority: {PriorityName}
Due: {DueDate}

Description:
{DescriptionPlain}

App: {baseUrl}/projects/{ProjectId}?tab=tasks&taskId={Id}
```

Empty optional fields: omit the line or use `—`.

## Send mode

| Mode | Behaviour |
|------|-----------|
| Prefill (only) | Paste / open AI chat with draft into the **active** conversation; user edits then sends |

Clipboard fallback when chat APIs are unavailable (expected for Rider / Visual Studio).

Removed: Edit before send / Send now QuickPick and `aiAutoSubmit` setting (both paths were equivalent on Cursor).

## Send to AI side effects

1. Optionally set task status to In Progress (`aiInProgressStatusId` setting, else org `IsInProgress` flag) via `PUT /api/tasks/{id}`.
2. Prefill AI prompt.

## Chat command IDs

| Host | Prefill |
|------|---------|
| VS Code (Copilot Chat) | `workbench.action.chat.open` `{ query, isPartialQuery: true }` |
| Cursor | `composer.focusComposer` / `composer.openComposer` + clipboard paste into the **active** chat. Never `composer.newAgentChat`. |
| Rider | Clipboard + notification |
| Visual Studio | Clipboard (+ Copilot Chat when available) |

## Network

- Supported: HTTPS with valid certificate, or HTTP (LAN / on-prem)
- Not supported in v1: self-signed HTTPS
