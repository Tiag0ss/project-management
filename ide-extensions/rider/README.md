# Rider — Project Management Kanban

Tool window (**PM Kanban**) with a JBCef-hosted board. Select a project, drag cards to change status.

## Setup

1. Create a `pt_…` API token in the web app (Profile → API Tokens).
2. **Settings → Tools → Project Management**: Base URL + API token.
3. Open **View → Tool Windows → PM Kanban**, pick a project.

## AI

**AI** on a card copies a prompt to the clipboard (JetBrains has no stable public chat prefill API in v1). Paste into AI Assistant.

## Build

```bash
cd ide-extensions/rider
# refresh shared board assets if needed:
cp ../shared-kanban/board.css ../shared-kanban/board.js src/main/resources/kanban/
./gradlew buildPlugin
```
