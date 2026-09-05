---
name: validated-route
description: >-
  Wire Zod schemas with validateRequest (or validatePayload for encrypted auth)
  on Express write routes. Use when adding or updating request validation on
  server routes.
---

# Validated route pattern

Use Zod schemas from `server/utils/validation.ts` with the `validateRequest` middleware on write routes.

## Placement

- Prefer new validation + handlers under `server/modules/**`.
- Do not add features under `*/old/**`.
- New domain validation/helpers require unit tests under `__tests__/unit/`.

## Stack notes

- Keep schemas aligned with **MySQL + MSSQL** field types (dates, booleans).
- After validated writes that affect cached reads, invalidate **optional Redis** via `invalidateByEntity(...)`.
- Org-scoped bodies must respect **active org** on the server (do not trust client org alone).

```typescript
import { validateRequest, createTaskSchema } from '../utils/validation';

router.post('/', authenticateToken, validateRequest(createTaskSchema), async (req, res) => {
  // req.body already validated
});
```

For encrypted auth payloads, use `validatePayload(schema, decryptedBody)` after `getAuthRequestBody()`.

See live usage in `server/routes/tasks.ts`, `projects.ts`, `tickets.ts`, and `timeEntries.ts` (or equivalent modules under `server/modules/**`).

## Related skills

Prefer matching skills under `.cursor/skills/` (e.g. `backend-route`) when implementing the full route.
