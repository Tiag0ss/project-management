# Project Management — IDE Extensions

IDE plugins that show a **project Kanban** using the app REST API and `pt_` API tokens. Shared board UI: [`shared-kanban/`](./shared-kanban/).

| IDE | Folder | UI |
|-----|--------|-----|
| VS Code / Cursor | [`vscode/`](./vscode/) | Activity Bar **Webview** Kanban |
| Rider | [`rider/`](./rider/) | Tool Window (JBCef) |
| Visual Studio 2022 | [`visualstudio/`](./visualstudio/) | Tool Window (WebView2) |

Shared rules: [`CONTRACT.md`](./CONTRACT.md).  
Deploy guide: [`DEPLOYMENT.md` §11](../DEPLOYMENT.md#11-ide-extensions-pending-tasks).

## Setup (all IDEs)

1. In the web app: **Profile → API Tokens → Create** → copy the `pt_…` value (shown once).
2. In the IDE extension settings / Configure:
   - **Base URL** — e.g. `https://pm.example.com` (no trailing slash)
   - **API token** — paste `pt_…` into the secure store / password field
3. Open the Kanban view → pick a **project** from the dropdown.

### Network baseline

- Valid HTTPS certificates, or plain **HTTP** on LAN / VPN
- Self-signed HTTPS is **not** supported in v1

## Features (v0.3)

- Opens in an **editor tab** (VS Code/Cursor) for full width — Activity Bar only launches it
- Project dropdown → org status columns (ordered by `SortOrder`) + project tasks
- **Sprint filter** (after project is selected): All sprints, Backlog (no sprint), or a specific sprint
- Settings: `kanbanLayout` (`horizontal` / `vertical`), `kanbanHiddenStatuses` (`Done; Cancelled`), `kanbanMaxVisibleCards`
- Drag cards between columns / reorder (uses `POST /api/tasks/reorder-kanban`)
- Refresh (manual + optional interval on VS Code/Cursor)
- Open project in browser
- **Send to AI Chat…** on each card
  - Content: Name only / Name + description / Full context
  - Mode: Edit before send (default) / Send now
  - Cursor: pastes into the **active** chat (does not open a new agent)
  - Rider / Visual Studio: clipboard (+ notification)
  - HTML descriptions stripped to plain text

## Build

After editing [`shared-kanban/`](./shared-kanban/), copy `board.css` / `board.js` into each host’s resource folder (VS Code: `pnpm run sync-kanban`).

### VS Code / Cursor (pnpm)

```bash
cd ide-extensions/vscode
pnpm install --ignore-workspace
pnpm run package
# → project-management-pending-tasks-<version>.vsix
```

Install: Command Palette → **Extensions: Install from VSIX…**

### Rider

```bash
cd ide-extensions/rider
./gradlew buildPlugin
```

Install ZIP from `build/distributions/` via **Settings → Plugins → Install from Disk**.

### Visual Studio

Requires **WebView2 Runtime**. Open `ide-extensions/visualstudio/ProjectManagement.PendingTasks.sln` (VSIX workload). Build → install the `.vsix`.

## Manual test checklist

- [ ] Valid `pt_` token → Configure / Test Connection OK
- [ ] Project dropdown lists accessible projects
- [ ] Selecting a project loads status columns and cards
- [ ] Drag card to another column updates status in the web app
- [ ] Drag onto another card reorders within / across columns
- [ ] Workflow policy errors show a clear message (no silent fail)
- [ ] Invalid token → clear error, no crash
- [ ] HTTP base URL works; self-signed HTTPS fails clearly
- [ ] Send to AI (default): prefill / clipboard, **not** auto-sent (VS Code **and** Cursor)
- [ ] Cursor: uses **active** chat (no new agent chat)
- [ ] Rider: clipboard + notification
- [ ] Open opens `{baseUrl}/projects/{id}`
