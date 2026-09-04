---
name: release-pdf-flow
description: >-
  Implement or refine application release workflows, task linkage, and PDF
  exports. Use when creating releases, assigning tasks to releases, or changing
  release PDF export behavior.
---

# Skill: Release + PDF Export Flow

## Goal
Implement or refine application release workflows, task linkage, and PDF exports.

## Placement

- Prefer new/changed API under `server/modules/**`; UI under `app/(app)/`.
- Do not add features under `*/old/**`.
- New domain logic (assignment rules, PDF builders) requires unit tests under `__tests__/unit/`.

## Stack notes

- Keep SQL portable for **MySQL + MSSQL**; date filtering timezone-safe for both.
- Releases are typically **active-org** / application scoped — preserve that filtering.
- After writes that affect cached release lists, invalidate **optional Redis** when applicable.
- PDF/UI styling should stay within the existing design system / **Synapse theme**.

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
8. Add or update unit tests under `__tests__/unit/` for new domain logic.

## Related skills

Prefer matching skills under `.cursor/skills/` (e.g. `backend-route`, `permission-gated-ui`).

## Output Contract

- Implement changes directly.
- Summarize:
  - flow adjusted,
  - validations added,
  - export behavior verified (single/range as applicable).
