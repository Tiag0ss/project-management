# Project Management — IDE Extensions

Native IDE plugins that list **your pending tasks** using the app REST API and `pt_` API tokens. **No webviews.**

| IDE | Folder | UI |
|-----|--------|-----|
| VS Code / Cursor | [`vscode/`](./vscode/) | Activity Bar TreeView |
| Rider | [`rider/`](./rider/) | Tool Window |
| Visual Studio 2022 | [`visualstudio/`](./visualstudio/) | Tool Window (WPF) |

Shared rules: [`CONTRACT.md`](./CONTRACT.md).  
Deploy guide: [`DEPLOYMENT.md` §11](../DEPLOYMENT.md#11-ide-extensions-pending-tasks).

## Setup (all IDEs)

1. In the web app: **Profile → API Tokens → Create** → copy the `pt_…` value (shown once).
2. In the IDE extension settings:
   - **Base URL** — e.g. `https://pm.example.com` (no trailing slash)
   - **API token** — paste `pt_…` into the secure store / password field
3. Run **Test Connection** / refresh the Pending Tasks view.

### Network baseline

- Valid HTTPS certificates, or plain **HTTP** on LAN / VPN
- Self-signed HTTPS is **not** supported in v1

## Features (v1)

- Pending tasks (not closed / cancelled / hidden from planning stats)
- Grouped by project; overdue → due date → priority → name
- Refresh (manual + optional interval)
- Open project in browser
- **Send to AI Chat…**
  - Content: Name only / Name + description / Full context
  - Mode: Edit before send (default) / Send now
  - Setting `aiAutoSubmit` for default one-click send
  - HTML descriptions stripped to plain text
  - Rider: copies prompt to clipboard (no public JetBrains chat prefill API)

## Build

### VS Code / Cursor (pnpm)

```bash
cd ide-extensions/vscode
pnpm install --ignore-workspace
pnpm run package
# → project-management-pending-tasks-<version>.vsix
```

Install in **Cursor or VS Code**: Command Palette → **Extensions: Install from VSIX…**

`pnpm run package:cursor` is an alias of `package` (same `.vsix`). Full deploy notes: [DEPLOYMENT.md §11](../DEPLOYMENT.md#11-ide-extensions-pending-tasks).

### Rider

```bash
cd ide-extensions/rider
./gradlew buildPlugin
```

If the Gradle wrapper is missing:

```bash
gradle wrapper --gradle-version 8.7
./gradlew buildPlugin
```

Install ZIP from `build/distributions/` via **Settings → Plugins → Install from Disk**.

### Visual Studio

Open `ide-extensions/visualstudio/ProjectManagement.PendingTasks.sln` (VSIX workload). Build → install the `.vsix`.

## Manual test checklist

- [ ] Valid `pt_` token → Test Connection OK
- [ ] Pending list matches Dashboard pending tasks
- [ ] Closed / cancelled / hide-from-stats tasks hidden
- [ ] Ordering: overdue first, then due date, priority, name
- [ ] HTML description → clean plain text in AI prompt
- [ ] Invalid token → clear error, no crash
- [ ] HTTP base URL works; self-signed HTTPS fails clearly
- [ ] Refresh after status change in the web app
- [ ] Send to AI (default): prefill, **not** auto-sent (VS Code **and** Cursor)
- [ ] Send now / `aiAutoSubmit`: submits when host supports it
- [ ] Rider: clipboard + notification
- [ ] Open in browser opens `{baseUrl}/projects/{id}`
