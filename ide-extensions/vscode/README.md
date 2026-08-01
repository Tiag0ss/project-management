# Project Management — Pending Tasks

Lists **your** pending tasks in a native Activity Bar TreeView (no webview). Works in **VS Code** and **Cursor**.

## Setup

1. In the web app: **Profile → API Tokens → Create** → copy the `pt_…` value (shown once).
2. In the IDE, open the **Project Management** icon in the Activity Bar → **Pending Tasks**.
3. Run **Project Management: Configure Connection** (Command Palette, or the **⋯** menu on the Pending Tasks view).
4. Enter:
   - **Base URL** — app origin, no trailing slash (e.g. `https://pm.example.com`)
   - **API token** — paste `pt_…` (stored in the editor’s secret storage, not in Settings)
5. Use **Project Management: Test Connection** if you want to verify the account.

Settings (optional): `projectManagement.baseUrl`, refresh interval, AI auto-submit, custom AI prompt template. The token is **only** set via Configure Connection.

## What you see

- Pending tasks assigned to you (or where you are a multi-assignee / have a task allocation)
- Grouped by project; overdue first, then due date, priority, name
- Closed, cancelled, and “hide from planning/statistics” statuses are hidden

## Actions

| Action | How |
|--------|-----|
| Refresh | Toolbar refresh / status bar |
| Open in browser | Context menu on a task → project page |
| Send to AI Chat… | Context menu → choose name / name+description / full context; prefill by default |

Network: HTTPS with a valid certificate, or HTTP on LAN/VPN. Self-signed HTTPS is not supported in v1.
