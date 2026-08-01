# IDE Extensions — API Contract

Shared contract for VS Code / Cursor, Rider, and Visual Studio extensions.

## Auth

| Item | Value |
|------|--------|
| Header | `Authorization: Bearer pt_<token>` |
| Token source | App → Profile → API Tokens |
| Test call | `GET /api/user/profile` |

Successful profile response includes at least `username` / `Username` and `email` / `Email`.

## Endpoints

### `GET /api/user/profile`

Connection test. Any `2xx` with a user identity means the token works.

### `GET /api/tasks/my-tasks`

Returns `{ success: true, tasks: Task[] }` for the authenticated user only when they are:

- primary `AssignedTo`, or
- in `TaskAssignees`, or
- have a row in `TaskAllocations`

Parent tasks are **not** included merely because they have subtasks.

Relevant fields:

| Field | Type | Notes |
|-------|------|-------|
| `Id` | number | Task id |
| `ProjectId` | number | |
| `ProjectName` | string | |
| `TaskName` | string | |
| `Description` | string \| null | **HTML** rich text |
| `StatusName` | string | |
| `StatusIsClosed` | 0 \| 1 | |
| `StatusIsCancelled` | 0 \| 1 | |
| `StatusHideFromPlanningAndStatistics` | 0 \| 1 | |
| `PriorityName` | string | |
| `PrioritySortOrder` | number | Lower = higher priority |
| `DueDate` | string \| null | ISO / date string |

## Pending filter (client-side v1)

A task is **pending** when all are true:

```text
StatusIsClosed !== 1
AND StatusIsCancelled !== 1
AND StatusHideFromPlanningAndStatistics !== 1
```

(Matches Dashboard pending tasks.)

## Tree ordering

1. Group by `ProjectName` (alphabetical, case-insensitive).
2. Inside a project:
   1. Overdue first (`DueDate` date part &lt; today, local calendar day)
   2. `DueDate` ascending (null / empty last)
   3. `PrioritySortOrder` ascending (missing → large number)
   4. `TaskName` alphabetical

## HTML → plain text

Apply before AI prompts and tooltips:

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

Clipboard fallback when chat APIs are unavailable (expected for Rider v1).

## Chat command IDs (discover / update during ship)

| Host | Prefill | Auto-submit |
|------|---------|-------------|
| VS Code (Copilot Chat) | `workbench.action.chat.open` `{ query, isPartialQuery: true }` | `{ query, isPartialQuery: false }` |
| Cursor | Detect via `vscode.env.appName`; try Cursor chat commands; fallback clipboard | Same |
| Rider | Clipboard + notification (v1) | Clipboard |
| Visual Studio | Copilot Chat when available; else clipboard | Same |

Document working IDs here after manual verification.

## Network

- Supported: HTTPS with valid certificate, or HTTP (LAN / on-prem)
- Not supported in v1: self-signed HTTPS
