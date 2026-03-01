# Skill: Backend Route (Express + MySQL/MSSQL)

## Goal
Create or modify backend route handlers with secure and consistent project patterns.

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

## Output Contract

- Implement route changes directly.
- Return concise summary with:
  - files touched,
  - validation done,
  - any assumptions.
