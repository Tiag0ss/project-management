# Agent context — Project Management

Cursor agents: read **`.cursor/rules/project-management.mdc`** (always on) plus scoped rules for the files you edit.

## Language (mandatory)

- **Assistant responses: English (EN) only.**
- User messages may be in European Portuguese (PT). Understand PT; do not answer in PT or PT-BR unless explicitly requested.
- Non-English UI strings require user approval.

## Documentation map

| Need | Read |
|------|------|
| Feature reference | [docs/FEATURES.md](docs/FEATURES.md) |
| Permissions | [docs/ROLE_PERMISSIONS.md](docs/ROLE_PERMISSIONS.md) |
| Manual test catalog | [TESTING_SCENARIOS.md](TESTING_SCENARIOS.md) |
| End-user manual | `/docs` in app |
| Deploy / Redis / env | [README.md](README.md) |

## Layout

| Path | Role |
|------|------|
| `app/` | App Router UI (public auth pages + authenticated routes; shell via `AuthenticatedAppGate`) |
| `components/` | Live UI components |
| `server/modules/` | Live API domains (only mount point) |
| `server/database/` | Shared JSON schema SOT |
| `old/` | **Dead archive** (`old/frontend`, `old/backend`) — not mounted, not imported |
| `extras/` | ide-extensions, cloudflare, desktop, release |
| `__tests__/unit/` | Unit tests (required for new domain logic) |
| `.cursor/skills/` | Task skills (Cursor-only) |
| `.github/workflows/` | CI only |

**Never add features under `old/`.** Never import from `old/` into the live app. Live Express mounts **only** `server/modules/*`.

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

## Prompt skills (`.cursor/skills/`)

Open the matching skill **before** implementing:

- `backend-route` — API routes / modules
- `frontend-feature` — UI pages
- `db-schema-json` — JSON schema
- `validated-route` — Zod middleware
- `permission-gated-ui` — permissions UI + API
- `dashboard-kpi-drilldown` — KPI widgets
- `jira-integration` — Jira/GitHub/Gitea
- `bugfix-debug` — regressions
- `timesheet-summary` — time entries
- `auth-password-recovery` — auth flows
- `release-pdf-flow` — PDF exports
- Plus kit skills: `new-api-route`, `new-ui-feature`, `new-change`, `add-tests`, etc.

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
- **Unit tests** for new/changed pure logic (`pnpm run test:unit`).
- Minimal diffs; English only; commit when user asks.
