# Validated route pattern

Use Zod schemas from `server/utils/validation.ts` with the `validateRequest` middleware on write routes.

```typescript
import { validateRequest, createTaskSchema } from '../utils/validation';

router.post('/', authenticateToken, validateRequest(createTaskSchema), async (req, res) => {
  // req.body already validated
});
```

For encrypted auth payloads, use `validatePayload(schema, decryptedBody)` after `getAuthRequestBody()`.

See live usage in `server/routes/tasks.ts`, `projects.ts`, `tickets.ts`, and `timeEntries.ts`.
