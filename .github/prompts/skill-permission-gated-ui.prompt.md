# Skill: Permission-Gated UI

## Goal
Implement UI features that correctly respect role-based and permission-based access rules.

## Task Input

```text
Feature/UI area:
Who should see it:
Who can execute actions:
Required permissions:
Backend endpoints involved:
Fallback behavior when denied:
```

## Execution Rules

1. Use `usePermissions()` for frontend gating.
2. Treat UI gating and backend authorization as separate mandatory layers.
3. Gate buttons, tabs, forms, and dangerous actions individually.
4. Keep hidden/disabled behavior consistent with existing page patterns.
5. Preserve loading states while permissions are still resolving.
6. Avoid exposing unauthorized actions via optimistic rendering.
7. For mutations, ensure corresponding server route enforces permission checks.

## Output Contract

- Implement code changes directly.
- Summarize:
  - permission checks added (UI + API),
  - affected roles/actions,
  - denial behavior in interface.
