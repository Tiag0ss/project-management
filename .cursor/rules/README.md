# Cursor rules index

Rules in this folder guide Cursor agents. They complement [.github/copilot-instructions.md](../.github/copilot-instructions.md).

## Always active

| Rule | Purpose |
|------|---------|
| [project-management.mdc](./project-management.mdc) | Master context: stack, file map, non-negotiables, skill index |

## Scoped (auto-attach by glob)

| Rule | Globs | Purpose |
|------|-------|---------|
| [backend-express.mdc](./backend-express.mdc) | `server/**/*` | Routes, SQL, validation, logging |
| [frontend-nextjs.mdc](./frontend-nextjs.mdc) | `app/**`, `components/**`, `lib/**` | UI, grids, modals, API calls |
| [database-json-schema.mdc](./database-json-schema.mdc) | `server/database/**` | JSON table definitions |
| [planning-gantt.mdc](./planning-gantt.mdc) | planning + allocation routes | Gantt, headers, drag |
| [redis-cache.mdc](./redis-cache.mdc) | cache services + routes | Invalidate-on-write |
| [permissions-auth.mdc](./permissions-auth.mdc) | auth, portal, permissions | JWT, roles, portal |
| [integrations.mdc](./integrations.mdc) | integration routes | Jira, Outlook, queue |
| [testing-quality.mdc](./testing-quality.mdc) | `__tests__/**`, CI | Jest, validation tests |

## Maintenance

When project conventions change (new pattern, Redis entity, validation rule):

1. Update the relevant scoped `.mdc` file.
2. If global, update `project-management.mdc` and [AGENTS.md](../AGENTS.md).
3. Keep [.github/copilot-instructions.md](../.github/copilot-instructions.md) in sync for Copilot/VS Code users.

Do not duplicate entire copilot-instructions into rules — rules should be **actionable checklists** with pointers to the full doc.
