# Agent context — Project Management

Cursor agents: read **`.cursor/rules/project-management.mdc`** (always on) plus scoped rules for the files you edit.

## Language (mandatory)

- **Assistant responses: English (EN) only.**
- User messages may be in European Portuguese (PT). Understand PT; do not answer in PT or PT-BR unless explicitly requested.
- Non-English UI strings require user approval.

## Documentation map

| Need | Read |
|------|------|
| Full conventions (1100+ lines) | [.github/copilot-instructions.md](.github/copilot-instructions.md) |
| Feature reference | [docs/FEATURES.md](docs/FEATURES.md) |
| Permissions | [docs/ROLE_PERMISSIONS.md](docs/ROLE_PERMISSIONS.md) |
| Manual test catalog | [TESTING_SCENARIOS.md](TESTING_SCENARIOS.md) |
| End-user manual | `/docs` in app |
| Deploy / Redis / env | [README.md](README.md) |

## Cursor rules (`.cursor/rules/`)

| File | When |
|------|------|
| `project-management.mdc` | **Always** — stack, map, non-negotiables |
| `backend-express.mdc` | `server/**` |
| `frontend-nextjs.mdc` | `app/**`, `components/**`, `lib/**` |
| `database-json-schema.mdc` | `server/database/**` |
| `planning-gantt.mdc` | Planning UI + allocation routes |
| `redis-cache.mdc` | Cache reads/writes |
| `permissions-auth.mdc` | Auth, portal, permissions |
| `integrations.mdc` | Jira, Outlook, email queue, API tokens |
| `testing-quality.mdc` | `__tests__/**`, CI |

## Prompt skills (`.github/prompts/`)

Open the matching skill **before** implementing:

- `skill-backend-route.prompt.md` — API routes
- `skill-frontend-feature.prompt.md` — UI pages
- `skill-db-schema-json.prompt.md` — JSON schema
- `skill-validated-route.prompt.md` — Zod middleware
- `skill-permission-gated-ui.prompt.md` — permissions UI + API
- `skill-dashboard-kpi-drilldown.prompt.md` — KPI widgets
- `skill-jira-integration.prompt.md` — Jira/GitHub/Gitea
- `skill-bugfix-debug.prompt.md` — regressions
- `skill-timesheet-summary.prompt.md` — time entries
- `skill-auth-password-recovery.prompt.md` — auth flows
- `skill-release-pdf-flow.prompt.md` — PDF exports

## Stack (short)

Next.js 16 · React 19 · Tailwind · Express · TypeScript · MySQL/MSSQL · optional Redis

## Non‑negotiables (summary)

- Parameterized SQL via `pool`; no driver imports in routes.
- Schema = JSON in `systemtables/`; no column migration scripts.
- `validateRequest` + `invalidateByEntity` on new write routes with cached reads.
- `logger` not `console` in server code.
- `ConfirmAlertModal` not `alert`/`confirm`.
- Leaf-only hour totals; header-driven planning bars.
- `usePermissions()` + backend permission checks.
- Minimal diffs; English only; commit when user asks.
