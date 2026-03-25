# Skill: Dashboard KPI Drill-down (Values + Details Parity)

## Goal
Implement or adjust Dashboard KPI cards so card totals and drill-down details are always consistent and navigable.

## Task Input

Use this structure:

```text
Feature scope:
KPI types involved:
Expected card values:
Expected drill-down row types:
Navigation/open behavior:
Permissions involved:
Out of scope:
```

## Execution Rules

1. Keep a single source of truth for list-backed KPI cards:
   - `/api/dashboard-kpis/values` must return both `values` and `detailsByWidget`.
   - Card totals for list-backed KPIs must be derived from the same list data used in drill-down.
2. Reuse one shared backend query builder for both endpoints:
   - `/api/dashboard-kpis/values`
   - `/api/dashboard-kpis/:widgetId/details`
   - Differences should be pagination only.
3. Keep SQL provider-safe (MySQL + MSSQL):
   - parameterized queries only,
   - avoid MySQL-only constructs unless provider-gated.
4. Detail payloads must include navigation IDs where needed:
   - `taskId`, `projectId` for task/time-entry rows.
5. Customer labels in project/task KPI queries:
   - never read `Projects.CustomerName` directly,
   - use `LEFT JOIN Customers` + `COALESCE(Customers.ExternalName, Customers.Name)`.
6. Type-aware detail modal rendering is required:
   - `tasks`, `projects`, `customers`, `tickets`, `timeEntries`.
7. Row click contract:
   - `tasks` and `timeEntries` -> open `TaskDetailModal`.
   - `projects` -> navigate `/projects/:id`.
   - `customers` -> navigate `/customers/:id`.
   - `tickets` -> navigate `/tickets/:id`.
8. Task detail rows must include tags when available (`TaskTags` + `Tags`) and use project tag UI patterns (`SegmentedTagBadge`) when rendering.
9. Keep UX compact and consistent with existing dashboard card/modal style.
10. Validate with TypeScript compile for both frontend and backend.

## Output Contract

- Implement code changes directly.
- Return concise summary with:
  - files changed,
  - parity guarantees (value/detail),
  - navigation behavior,
  - validation result.
