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
2. Use full-width page wrappers (`w-full`) for screens; do not introduce `container` wrappers unless explicitly requested.
3. Keep changes minimal and localized to requested files.
4. For API calls, always:
   - check token,
   - handle non-OK responses,
   - use `try/catch` with user-facing error state.
5. Never use browser `alert()` or `confirm()`; use modal pattern already in codebase.
6. Respect permissions via `usePermissions()` checks before rendering actions.
7. For date handling, normalize database date values (MySQL string/Date or MSSQL datetime) before comparisons.
8. If hours are aggregated at project/report level, use leaf-task rule to avoid double counting.
9. Keep feature placement consistent with current UX (e.g., Resume belongs to Timesheet; ChangeHistory only in History tab).
10. For period selectors in analytics/resume contexts, include `allTime` when the requirement asks for aggregate lifetime metrics.

## Output Contract

- Implement code changes directly.
- Briefly summarize:
  - what changed,
  - where changed,
  - what was validated.
