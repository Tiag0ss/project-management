# Skill: Backend Route (Express + MySQL)

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
5. Keep response format consistent:
   - success: `{ success: true, data, message? }`
   - error: `{ success: false, message }`
6. Normalize/format dates consistently for MySQL `DATE` fields.
7. Add only required joins; avoid N+1 style loops.

## Output Contract

- Implement route changes directly.
- Return concise summary with:
  - files touched,
  - validation done,
  - any assumptions.
