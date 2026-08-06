# Project Management — Kanban

Project Kanban opens in an **editor tab** (full width). Works in **VS Code** and **Cursor**.

## Setup

1. Profile → API Tokens → Create → copy `pt_…`.
2. Activity Bar → **Project Management** → **Open Kanban Board** (or Command Palette → **Project Management: Open Kanban**).
3. **Configure** on the board (Base URL + token).
4. Search/pick a project.

## Settings (`projectManagement.*`)

| Setting | Purpose |
|---------|---------|
| `kanbanLayout` | `horizontal` (columns) or `vertical` (stacked) |
| `kanbanHiddenStatuses` | Status names to hide, separated by `;` (e.g. `Done; Cancelled`) |
| `kanbanMaxVisibleCards` | Cards shown per status before **Show more** (`0` = all; default `2`) |
| `aiInProgressStatusId` | Numeric task status Id for Send to AI (`0` = use org task status flagged **In Progress** under Organization → Statuses). Not in the Configure wizard — open **Cursor/VS Code Settings** and search “Project Management”. |
| `baseUrl` / refresh / AI template | Connection and prompt defaults |

## Actions

| Action | How |
|--------|-----|
| Open board | Activity Bar item / Command Palette |
| Refresh | Command Palette / board button |
| Search project | Type in the project combobox |
| Add task | Toolbar **Add task** or column **+** |
| Timer | Card **Timer** / **Stop**; toolbar **Stop** for active timer |
| View task | Card **View** → read-only preview in IDE |
| Open in app | Card **App** → `/projects/{id}?tab=tasks&taskId={id}` |
| Send to AI | Card **AI** (sets In Progress when possible, prefills active chat) |

The board shows only tasks assigned to the API-token user (primary assignee or `TaskAssignees`).
