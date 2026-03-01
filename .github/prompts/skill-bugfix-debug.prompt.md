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

## Output Contract

- Implement fix directly.
- Return:
  - root cause,
  - exact files changed,
  - validation result,
  - any remaining risk.
