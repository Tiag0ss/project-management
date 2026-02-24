# Skill: Database Schema via JSON Structure

## Goal
Apply database field/table changes using JSON schema files under `server/database/structure/systemtables/`.

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

## Output Contract

- Implement JSON and required code updates directly.
- Provide concise summary of:
  - updated schema file(s),
  - dependent code changes,
  - follow-up command user should run (DB sync command used by project).
