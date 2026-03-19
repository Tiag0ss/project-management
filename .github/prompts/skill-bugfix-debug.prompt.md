# Skill: Bugfix & Root-Cause Debugging

## Goal
Fix a bug by identifying root cause, implementing minimal safe change, and validating affected flow.

## Task Input

```text
Bug description:
Where it happens (page/route/component):
Expected behavior:
Actual behavior:
Repro steps:
Any known logs/errors:
```

## Execution Rules

1. Reproduce from code path first (and runtime/tests if feasible).
2. Fix root cause, not only symptoms.
3. Keep patch scoped; avoid unrelated refactors.
4. Preserve existing UX unless change is explicitly requested.
5. Validate with targeted checks first, then broader checks if needed.
6. If bug touches timesheet/reporting totals, verify grouping and aggregation logic carefully.
7. If bug touches tabs, verify content is rendered only in the intended tab (no cross-tab duplication).
8. If bug touches project Gantt, validate hierarchical ordering and expand/collapse behavior (not flat rendering).
9. If bug touches backend SQL, verify MySQL and MSSQL compatibility and keep the API response contract unchanged.
10. Prefer wrapper-level compatibility fixes (`server/config/database.ts`) when they are safe and reusable; use route-level branching only when semantics differ.
11. If bug touches planning rendering, verify bars are grouped/rendered by `TaskAllocationHeaderId` (header-driven), not by date-gap heuristics.
12. If bug touches planning drag behavior, preserve contract: normal drag moves full header slice; `Ctrl + drag` triggers partial slice transfer by hours (not date prompts).
13. If bug touches planning data creation flows, ensure every inserted allocation has `TaskAllocationHeaderId` and startup backfills repair null/orphan references.
14. If bug touches slice move/delete logic, validate header-aware endpoints first (`/header/:headerId`, `/header/:headerId/hours`, `/header/:headerId/dates`) before broad task/user/date deletes.
15. If bug touches parent/child slice planning, ensure `TaskChildAllocations.TaskAllocationHeaderId` is populated and every child query/delete/recalc is filtered by that header, not only by date.

## Output Contract

- Implement fix directly.
- Return:
  - root cause,
  - exact files changed,
  - validation result,
  - any remaining risk.
