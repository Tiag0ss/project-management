# Visual Studio 2022 — Pending Tasks

Native **Tool Window** (WPF, no WebView2). Uses `pt_` API token.

## Build

1. Install Visual Studio 2022 with **Visual Studio extension development** workload.
2. Open `ProjectManagement.PendingTasks.sln`.
3. Build → produces a `.vsix`.
4. Install via double-click or **Extensions → Manage Extensions → Install from disk**.

## Configure

**Tools → Options → Project Management → General**: Base URL + API token.

**View → PM Pending Tasks** opens the tool window.

AI prompts are copied to the clipboard for Copilot Chat (edit before send by default).

See [../CONTRACT.md](../CONTRACT.md).
