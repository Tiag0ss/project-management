# Copilot Prompt Library (Skills-like)

This folder provides reusable, project-specific prompt templates that work like "skills".

Use them when asking Copilot for implementation work, so output stays consistent with this repository.

## How to use

- Open a prompt file in this folder.
- Copy its **Task Input** block.
- Fill the placeholders.
- Send it to Copilot in chat.

## Available prompts

- `skill-frontend-feature.prompt.md` — Next.js App Router UI/UX changes
- `skill-backend-route.prompt.md` — Express route or API endpoint changes
- `skill-db-schema-json.prompt.md` — Database structure updates via JSON schema files
- `skill-bugfix-debug.prompt.md` — Root-cause debugging and fix flow
- `skill-timesheet-summary.prompt.md` — Timesheet/history grouping and totals logic
- `skill-jira-integration.prompt.md` — Jira org/project integration and issue-link workflows
- `skill-permission-gated-ui.prompt.md` — UI changes with strict role/permission gating
- `skill-release-pdf-flow.prompt.md` — Application releases, task linking, and PDF export flows

## Notes

- All prompts assume:
  - TypeScript strict mode
  - Parameterized SQL only
  - No `alert()` / `confirm()`
  - Dark mode classes preserved
  - Leaf-task hours rule where required
