# Visual Studio — Project Management Kanban

Tool window (**PM Kanban**) hosted in **WebView2**. Select a project, drag cards to change status.

Requires the [WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/).

## Setup

1. Create a `pt_…` API token in the web app (Profile → API Tokens).
2. **Tools → Options → Project Management**: Base URL + API token.
3. **View → PM Kanban**, pick a project.

## AI

Card **AI** copies a prompt to the clipboard for Copilot Chat (edit before send by default).

## Build

Open `ProjectManagement.PendingTasks.sln`, build the VSIX. Ensure `Resources/kanban/board.css` and `board.js` are present (copy from `../shared-kanban/` if needed).
