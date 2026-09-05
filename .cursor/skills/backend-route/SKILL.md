---
name: backend-route
description: >-
  Create or modify Express API route handlers with auth, permissions,
  parameterized MySQL/MSSQL SQL, and consistent response shapes. Use when
  implementing or changing server routes under server/.
---

# Skill: Backend Route (Express + MySQL/MSSQL)

## Goal
Create or modify backend route handlers with secure and consistent project patterns.

## Placement

- Prefer new domain work under `server/modules/**` (routes/services/queries colocated by domain).
- Do not add features under `*/old/**`.
- New domain logic requires unit tests under `__tests__/unit/`.

## Stack notes

- SQL must stay portable for **MySQL and MSSQL** (`DB_PROVIDER`); gate provider-specific SQL with `dbProvider`.
- After successful writes that affect cached reads, call `invalidateByEntity(...)` when **optional Redis** (`REDIS_ENABLED`) is in use.
- Respect **active org** context on org-scoped mutations and reads.

## Task Input

```text
Route method/path:
Purpose:
Auth required (yes/no):
Permissions required:
Request params/body/query:
DB tables involved:
Response shape:
Edge cases:
```

## Execution Rules

1. Use `authenticateToken` for protected endpoints.
2. Enforce permission checks server-side for all mutations.
3. Use parameterized queries only (`pool.execute(...)` with placeholders).
4. Type DB results as `RowDataPacket[]` or `ResultSetHeader`.
5. Use provider abstraction from `server/config/database.ts`; do not import DB drivers directly in routes.
6. Keep SQL portable for both MySQL and MSSQL whenever possible.
7. If provider-specific SQL is unavoidable, gate it with `dbProvider` and keep response shape identical.
8. For aggregates, include all selected non-aggregated columns in `GROUP BY` (MSSQL strict mode).
9. Avoid MySQL-only SQL patterns in new routes (`FIELD`, `GROUP_CONCAT`, `JSON_ARRAYAGG/JSON_OBJECT`, fragile recursive CTE placement).
10. For pagination, ensure MSSQL-safe syntax (`OFFSET ... FETCH`) or wrapper-supported forms.
11. Keep response format consistent:
   - success: `{ success: true, data, message? }`
   - error: `{ success: false, message }`
12. Normalize/format dates consistently for database `DATE` fields.
13. Add only required joins; avoid N+1 style loops.
14. For period-based summaries/analytics, support explicit `allTime` mode when requested (skip date-range constraints only for that mode).
15. Keep frontend/backend field parity for supported flags (e.g., `IsCustomerSpecific`) and preserve default false behavior unless explicitly changed.
16. For permissions defined in both global roles and org groups, ensure route logic follows OR merge semantics and keeps both layers in sync.
17. For planning allocation mutations, always preserve `TaskAllocationHeaderId` semantics:
   - Create/backfill header IDs for inserted allocations.
   - Never insert new planning allocations without a header ID.
   - Prefer header-aware slice endpoints (`/header/:headerId`, `/header/:headerId/hours`, `/header/:headerId/dates`) for targeted slice operations.
18. Startup-safe migrations for planning data must be idempotent and should backfill `TaskAllocationHeaderId` for legacy rows and repair orphan header references.
19. For Dashboard KPI drill-down routes:
   - Keep one shared query source for list-backed KPI data and reuse it for both `/api/dashboard-kpis/values` and `/api/dashboard-kpis/:widgetId/details`.
   - Ensure summary KPI values for list-backed cards are derived from the same backing list used by details.
   - Include navigation identifiers (`taskId`, `projectId`) in detail payloads when rows need deep linking.
   - Include task tags when available (`TaskTags` + `Tags`) in task detail rows.
   - Never read `Projects.CustomerName` directly; resolve project customer label via `LEFT JOIN Customers` + `COALESCE(ExternalName, Name)`.
20. Wire `validateRequest(schema)` on write routes; use `logger` (not `console`) for errors.
21. Add or update unit tests under `__tests__/unit/` for new/changed domain logic.

## Related skills

Prefer matching skills under `.cursor/skills/` (e.g. `validated-route`, `db-schema-json`) when the task spans validation or schema.

## Output Contract

- Implement route changes directly.
- Return concise summary with:
  - files touched,
  - validation done,
  - any assumptions.
