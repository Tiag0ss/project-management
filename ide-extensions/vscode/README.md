# Project Management — Kanban

Project Kanban opens in an **editor tab** (full width). Works in **VS Code** and **Cursor**.

## Setup

1. Profile → API Tokens → Create → copy `pt_…`.
2. Activity Bar → **Project Management** → **Open Kanban Board** (or Command Palette → **Project Management: Open Kanban**).
3. **Configure** on the board (Base URL + token).
4. Pick a project.

## Settings (`projectManagement.*`)

| Setting | Purpose |
|---------|---------|
| `kanbanLayout` | `horizontal` (columns) or `vertical` (stacked) |
| `kanbanHiddenStatuses` | Status names to hide, separated by `;` (e.g. `Done; Cancelled`) |
| `kanbanMaxVisibleCards` | Cards shown per status before **Show more** (`0` = all; default `2`) |
| `baseUrl` / refresh / AI | Connection and AI defaults |

## Actions

| Action | How |
|--------|-----|
| Open board | Activity Bar item / Command Palette |
| Refresh | Command Palette / board button |
| Send to AI | Card **AI** |
| Open in browser | Card **Open** |
