---
name: timesheet-summary
description: >-
  Implement or adjust Timesheet All Entries / Resume grouping and summarization
  without breaking detailed view. Use when changing groupByDays, resume period
  logic, or timesheet aggregate columns.
---

# Skill: Timesheet History Summary

## Goal
Implement or adjust grouping/summarization in Timesheet "All Entries"/"Resume" flows without breaking normal detailed view.

## Placement

- Prefer timesheet UI under `app/(app)/` (or existing `app/timesheet/` until migrated); helpers/domain under shared modules — not `*/old/**`.
- Prefer related API under `server/modules/**` when backend changes are needed.
- New grouping/summary domain logic requires unit tests under `__tests__/unit/`.

## Stack notes

- Time entry dates may come from **MySQL or MSSQL**; normalize before grouping/comparisons.
- Leaf-only hour aggregation rules still apply for report-level totals.
- Respect **active org** on timesheet data fetches.
- Keep **Synapse theme** / dark-mode table styling consistent.

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
10. Display times as `hh:MM:ss` via `decimalHoursToHMS` — never `1.5h`.
11. Add or update unit tests under `__tests__/unit/` for grouping/aggregation helpers.

## Related skills

Prefer matching skills under `.cursor/skills/` (e.g. `frontend-feature`, `bugfix-debug`).

## Output Contract

- Implement directly in the timesheet page (or extracted helpers).
- Report:
  - grouped key used,
  - visible grouped columns,
  - errors fixed (if any).
