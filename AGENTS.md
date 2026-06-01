# Agent context — Project Management

This repository was developed with GitHub Copilot in VS Code. Cursor agents should follow the same conventions.

## Language (mandatory)

- **Assistant responses: English (EN) only.**
- User messages may be in European Portuguese (PT). Understand PT; do not answer in PT or PT-BR unless the user explicitly requests Portuguese for that reply.
- Avoid PT-BR vocabulary, spelling, and phrasing in all assistant output.

## Primary references

| Resource | Path |
|----------|------|
| Full project conventions | [.github/copilot-instructions.md](.github/copilot-instructions.md) |
| Reusable task prompts (skills) | [.github/prompts/](.github/prompts/) |
| Cursor rules (always-on + scoped) | [.cursor/rules/](.cursor/rules/) |

## Stack

Next.js 16 (App Router) + React 19 + Tailwind · Express + TypeScript · MySQL / MSSQL via `server/config/database.ts`

## Non‑negotiables

- TypeScript strict; parameterized SQL only; use `pool` from `server/config/database.ts` in routes (no direct `mysql2` in routes).
- Schema changes via JSON in `server/database/structure/systemtables/` — no manual migration scripts for columns.
- No `alert()` / `confirm()` — use modals (`ConfirmAlertModal` pattern).
- Full-width layouts (`w-full`); dark mode on UI.
- Hour totals on aggregates: **leaf tasks only** (avoid double-counting parent + children).
- Planning: bars are **header-driven** (`TaskAllocationHeaderId`); include **TaskChildAllocations** in availability checks.
- Permissions: `usePermissions()` on UI; validate on backend.

## When to open a prompt skill

Match the task to a file under `.github/prompts/` (e.g. `skill-backend-route`, `skill-db-schema-json`, `skill-permission-gated-ui`) and follow its structure.
