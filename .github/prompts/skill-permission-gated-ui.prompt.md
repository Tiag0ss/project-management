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
8. Keep screen-level layout full-width (`w-full`) unless the request explicitly asks for constrained-width wrappers.
9. Ensure tab-gated content stays in the correct tab scope (e.g., history-only components remain in History tab).
10. When a permission exists in both global roles and org PermissionGroups, implement OR-merge behavior consistently with `getUserPermissions()`.
11. For sensitive financial fields (e.g., project budget), hide values, columns/cards, sort options, and budget-derived status hints when permission is denied.
12. In permission-gated action columns, render icon-only SVG buttons with `title` + `aria-label` (Applications-list style), and gate each icon independently (`view/edit/delete`) by permission.
13. Keep top toolbar action buttons (`Import CSV`, `Export CSV`, `New ...`) size-normalized with `h-10 px-4 rounded-lg text-sm font-medium inline-flex items-center` (use `gap-2` only when a leading icon exists), and do not change `Quick Actions` button sizing unless explicitly requested.

## Output Contract

- Implement code changes directly.
- Summarize:
  - permission checks added (UI + API),
  - affected roles/actions,
  - denial behavior in interface.
