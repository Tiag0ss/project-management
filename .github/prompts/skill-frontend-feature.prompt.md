# Skill: Frontend Feature (Next.js App Router)

## Goal
Implement or update a frontend feature in this project following existing patterns.

## Task Input

Use this exact structure:

```text
Feature:
Page/component paths:
User flow:
Data source/API endpoints:
Permissions involved:
Expected loading/error states:
Out of scope:
```

## Execution Rules

1. Use existing Tailwind tokens and dark-mode classes only.
2. Keep changes minimal and localized to requested files.
3. For API calls, always:
   - check token,
   - handle non-OK responses,
   - use `try/catch` with user-facing error state.
4. Never use browser `alert()` or `confirm()`; use modal pattern already in codebase.
5. Respect permissions via `usePermissions()` checks before rendering actions.
6. For date handling, normalize MySQL date values before comparisons.
7. If hours are aggregated at project/report level, use leaf-task rule to avoid double counting.

## Output Contract

- Implement code changes directly.
- Briefly summarize:
  - what changed,
  - where changed,
  - what was validated.
