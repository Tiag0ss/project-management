# Rider — Pending Tasks

IntelliJ Platform plugin (Rider). Native **Tool Window**, no webview.

v1 **Copy AI prompt** puts the draft on the clipboard (no stable public JetBrains AI prefill API).

## Build

Requires JDK 17+.

```bash
cd ide-extensions/rider
./gradlew buildPlugin
```

If the Gradle wrapper is missing, generate it from IntelliJ (**Build → Generate Gradle Wrapper**) or:

```bash
gradle wrapper --gradle-version 8.7
./gradlew buildPlugin
```

Install `build/distributions/*.zip` via **Settings → Plugins → ⚙ → Install Plugin from Disk**.

## Configure

**Settings → Tools → Project Management**: Base URL + API token (`pt_…`).

See [../CONTRACT.md](../CONTRACT.md).
