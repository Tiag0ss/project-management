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
| `PriorityColor` | string | Optional card accent |
| `PrioritySortOrder` | number | Lower = higher priority |
| `DueDate` | string \| null | ISO / date string |

### `GET /api/status-values/task/{organizationId}`

Kanban columns. Returns `{ success: true, statuses: StatusValue[] }` for the org (requires membership).

Relevant fields: `Id`, `StatusName`, `ColorCode`, `SortOrder`, `IsClosed`, `IsCancelled`, `IsInProgress`, `HideFromPlanningAndStatistics`.

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

1. Host injects `{ type: 'config', baseUrl, token, selectedProjectId }`.
2. Board loads projects → user selects one → loads statuses + project tasks.
3. Columns sorted by `SortOrder`; cards by `DisplayOrder` within `Status`.
4. Card actions: **Send to AI** / **Open** (host messages).
5. Persist last `selectedProjectId` in host settings.

Shared assets: [`shared-kanban/`](./shared-kanban/) (`board.css`, `board.js`). Hosts copy into their resource folders.

## HTML → plain text

Apply before AI prompts:

1. Remove `<style>…</style>` and `<script>…</script>` (case-insensitive)
2. Replace `<br>` / `<br/>` with `\n`
3. Replace `</p>` with `\n\n`
4. Strip remaining tags: `<[^>]+>` → space
5. Decode `&nbsp;` `&amp;` `&lt;` `&gt;` `&quot;` `&#39;`
6. Collapse spaces/tabs; collapse 3+ newlines to 2; trim

## Open in app (v1)

```text
{baseUrl}/projects/{ProjectId}
```

No trailing slash on `baseUrl`.

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

App: {baseUrl}/projects/{ProjectId}
```

Empty optional fields: omit the line or use `—`.

## Send mode

| Mode | Behaviour |
|------|-----------|
| Prefill (default) | Open AI chat with draft; user edits then sends (`aiAutoSubmit=false`) |
| Auto-submit | Submit immediately when host supports it (`aiAutoSubmit=true` or “Send now”) |

Clipboard fallback when chat APIs are unavailable (expected for Rider / Visual Studio v1).

## Chat command IDs

| Host | Prefill | Auto-submit |
|------|---------|-------------|
| VS Code (Copilot Chat) | `workbench.action.chat.open` `{ query, isPartialQuery: true }` | `{ query, isPartialQuery: false }` then `workbench.action.chat.submit` if needed |
| Cursor | `composer.focusComposer` / `composer.openComposer` + clipboard paste into the **active** chat. Never `composer.newAgentChat`. | Same + `workbench.action.chat.submit` / `composer.startGeneration` when available |
| Rider | Clipboard + notification (v1) | Clipboard |
| Visual Studio | Clipboard (+ Copilot Chat when available) | Same |

## Network

- Supported: HTTPS with valid certificate, or HTTP (LAN / on-prem)
- Not supported in v1: self-signed HTTPS
