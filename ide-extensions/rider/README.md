# Rider — Project Management Kanban

Tool window (**PM Kanban**) with a JBCef-hosted board. Select a project, drag cards to change status.

## Setup

1. Create a `pt_…` API token in the web app (Profile → API Tokens).
2. **Settings → Tools → Project Management**: Base URL + API token.
3. Open **View → Tool Windows → PM Kanban**, pick a project.

The API token is kept in the plugin settings file (and also in the IDE PasswordSafe when that store is durable). If tokens vanished after restart, set **Settings → Appearance & Behavior → System Settings → Passwords** to a saving option (not “Do not save”), then re-apply the token once after upgrading.

## AI

**AI** on a card copies a prompt to the clipboard (JetBrains has no stable public chat prefill API in v1). Paste into AI Assistant.

## Build

Requires **JDK 17** (Gradle wrapper is included). On systems where the default Java is newer (e.g. JDK 26), point `JAVA_HOME` at 17 first.

```bash
cd ide-extensions/rider
# refresh shared board assets if needed:
cp ../shared-kanban/board.css ../shared-kanban/board.js src/main/resources/kanban/
# example if Temurin 17 is installed elsewhere:
# export JAVA_HOME=/path/to/jdk-17
./gradlew buildPlugin
```

Plugin zip: `build/distributions/`.
