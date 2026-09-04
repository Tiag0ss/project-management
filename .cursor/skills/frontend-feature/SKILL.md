---
name: frontend-feature
description: >-
  Implement or update Next.js App Router UI features with dark mode, permissions,
  and existing project patterns. Use when adding or changing pages/components
  under app/ or components/.
---

# Skill: Frontend Feature (Next.js App Router)

## Goal
Implement or update a frontend feature in this project following existing patterns.

## Placement

- Prefer new app pages/features under `app/(app)/` (App Router route groups).
- Do not add features under `*/old/**`.
- New domain logic (shared helpers, transforms) requires unit tests under `__tests__/unit/`.

## Stack notes

- Preserve **Synapse theme** tokens and dark-mode classes (`bg-white dark:bg-gray-800`, etc.).
- Respect **active org** in API clients and org-scoped UI.
- Backend may use **optional Redis**; frontend should not assume stale cache — refetch after mutations as existing pages do.
- APIs target **MySQL or MSSQL**; normalize date values from either provider before comparisons.

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
5. Never use browser `alert()` or `confirm()`; use `ConfirmAlertModal` / existing modal patterns.
6. Respect permissions via `usePermissions()` checks before rendering actions.
7. For date handling, normalize database date values (MySQL string/Date or MSSQL datetime) before comparisons.
8. If hours are aggregated at project/report level, use leaf-task rule to avoid double counting.
9. Keep feature placement consistent with current UX (e.g., Resume belongs to Timesheet; ChangeHistory only in History tab).
10. For period selectors in analytics/resume contexts, include `allTime` when the requirement asks for aggregate lifetime metrics.
11. For table/grid/list action columns, use the Applications-list action style (`app/applications/page.tsx`): icon-only SVG buttons with `title` + `aria-label`, gray base color, blue hover for edit/manage/open and red hover for delete.
12. For top toolbar actions (`Import CSV`, `Export CSV`, `New ...`), normalize size with `h-10 px-4 rounded-lg text-sm font-medium inline-flex items-center` (add `gap-2` only when there is a leading icon); do not alter `Quick Actions` button sizing unless explicitly requested.
13. For Planning Gantt interactions, keep allocation slice UX consistent:
   - Bars are header-driven (`TaskAllocationHeaderId`) not inferred by date gaps.
   - Normal drag moves full allocation header slice.
   - `Ctrl+drag` enables partial slice by **hours**.
   - Avoid date-prompt slicing when partial slice mode is requested.
   - For parent task slices, child rows are also header-driven via `TaskChildAllocations.TaskAllocationHeaderId`; never infer slice membership from dates alone.
14. When a user selector exists in planning split/assignment flows, prefer the existing searchable select component over a plain `<select>` when user list can be large.
15. For Dashboard KPI cards with drill-down:
   - Use `detailsByWidget` as the backing list source for both card values and detail modal contents.
   - Render detail rows by item type (`tasks`, `projects`, `customers`, `tickets`, `timeEntries`) with type-appropriate fields.
   - Row navigation behavior must be consistent: tasks/time entries open `TaskDetailModal`; projects/customers/tickets navigate to their detail pages.
   - For task rows, show tags when `item.tags` is available.
16. API URL via `getApiUrl()` from `@/lib/api/config`.

## Related skills

Prefer matching skills under `.cursor/skills/` (e.g. `permission-gated-ui`, `dashboard-kpi-drilldown`) when the task is specialized.

## Output Contract

- Implement code changes directly.
- Briefly summarize:
  - what changed,
  - where changed,
  - what was validated.
