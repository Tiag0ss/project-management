# Skill: Timesheet History Summary

## Goal
Implement or adjust grouping/summarization in Timesheet "All Entries"/"Resume" flows without breaking normal detailed view.

## Task Input

```text
Summary mode requirement:
Grouping dimensions (e.g., date/customer/project/task):
Columns to show when grouped:
Columns to hide when grouped:
How descriptions should aggregate:
Sorting rules:
```

## Execution Rules

1. Keep `groupByDays = false` behavior unchanged (full detailed rows).
2. For `groupByDays = true`, explicitly define grouping key from requested dimensions.
3. Sum hours per group using numeric parse (`parseFloat`).
4. If grouped descriptions are required, render as multi-line list and preserve readability.
5. Keep daily header with day total when requested.
6. Ensure `colSpan` values match visible grouped columns.
7. Verify TypeScript types used in grouping key exist on `TimeEntry`.
8. Keep All Entries detailed table and totals footer intact; do not reintroduce removed top summary cards unless requested.
9. For Resume period logic, support `allTime` when lifetime aggregation is requested.

## Output Contract

- Implement directly in `app/timesheet/page.tsx`.
- Report:
  - grouped key used,
  - visible grouped columns,
  - errors fixed (if any).
