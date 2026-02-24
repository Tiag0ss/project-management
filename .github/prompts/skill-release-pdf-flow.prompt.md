# Skill: Release + PDF Export Flow

## Goal
Implement or refine application release workflows, task linkage, and PDF exports.

## Task Input

```text
Flow requested (create release / assign tasks / export PDF):
Scope (single release / date range):
Filters/constraints:
Expected PDF content:
Permissions required:
Edge cases:
```

## Execution Rules

1. Preserve release-task integrity:
   - avoid duplicate task assignment across releases when prohibited,
   - keep linked task version updates consistent.
2. Maintain rich-text safety/formatting when rendering patch notes to PDF.
3. Keep date filtering deterministic and timezone-safe.
4. Enforce release-related permissions on both frontend actions and backend routes.
5. Use existing response and error patterns.
6. Avoid introducing new visual patterns outside existing design system.
7. Validate exports for empty-result and large-result scenarios.

## Output Contract

- Implement changes directly.
- Summarize:
  - flow adjusted,
  - validations added,
  - export behavior verified (single/range as applicable).
