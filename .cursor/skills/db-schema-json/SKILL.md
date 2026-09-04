---
name: db-schema-json
description: >-
  Apply database field/table changes via JSON schema files under
  server/database/structure/systemtables/. Use when adding or modifying tables
  or columns — never hand-written column migration scripts.
---

# Skill: Database Schema via JSON Structure

## Goal
Apply database field/table changes using JSON schema files under `server/database/structure/systemtables/`.

## Placement

- Schema source of truth: `server/database/structure/systemtables/*.json` only.
- Dependent API/domain code: prefer `server/modules/**`; UI under `app/(app)/` when needed.
- Do not add features under `*/old/**`.
- New domain logic that consumes schema changes requires unit tests under `__tests__/unit/`.

## Stack notes

- Schema must remain valid for **MySQL and MSSQL** sync.
- If new fields are read by cached endpoints, plan **optional Redis** invalidation (`invalidateByEntity`) on related writes.
- Org-scoped tables/fields must respect **active org** in consuming routes.

## Task Input

```text
Change type (add field / modify field / new table):
Target table JSON file:
Field/table definition:
Nullability/default requirements:
Related API/UI impacts:
```

## Execution Rules

1. Never create SQL migration scripts for schema updates.
2. Update only the JSON structure files.
3. For new tables, use top-level `PrimaryKeyFields` (string, comma-separated for composite keys).
4. For string `DefaultValue`, do not add extra quotes inside string value.
5. Keep field names/types aligned with existing naming and conventions.
6. Include required API/interface updates if schema changes are consumed by app logic.
7. For permission flags, update both global (`RolePermissions`) and org-level (`PermissionGroups`) models when feature requirements indicate dual-scope control.
8. Add or update unit tests under `__tests__/unit/` when domain logic changes with the schema.

## Related skills

Prefer matching skills under `.cursor/skills/` (e.g. `backend-route`) for API follow-up.

## Output Contract

- Implement JSON and required code updates directly.
- Provide concise summary of:
  - updated schema file(s),
  - dependent code changes,
  - follow-up command user should run (DB sync command used by project).
