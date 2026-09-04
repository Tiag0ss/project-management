# UI + server rebuild roadmap

Source of truth for phased rebuild progress. Design notes may live in Cursor plans; **this file tracks status**.

## Rules

- Live UI: `app/(app)/` + `components/` (Synapse dark AppShell + PageTabs).
- Live API: `server/modules/<domain>/` only — **no** runtime imports/mounts of archived routers.
- Legacy archive (dead): root [`old/`](../old/) (`old/frontend`, `old/backend`) — never import, never mount, never add features.
- Keep stable `/api/...` paths.
- **Unit tests** required for new domain logic (`__tests__/unit/`). Integration/e2e optional.
- Satellites live under `extras/` (`ide-extensions`, `cloudflare`, `desktop`, `release`).

## Status

| Phase | Area | Status |
|------:|------|--------|
| −1 | `extras/` + Cursor skills + this roadmap | done |
| −1t | Unit tests + CI baseline | done |
| 0a | Freeze legacy UI under archive | done |
| 0b | AppShell + modules layout | done |
| 1–14 | Domains under `app/(app)` + `server/modules` | done |
| — | Isolate archive at root `old/`; modules own route bodies | done |

## Waves

| Wave | Phases | Focus | Status |
|------|--------|--------|--------|
| A | −1, −1t, 0a, 0b | Foundation | done |
| B | 1–5 | Configuration | done |
| C | 6–8 | Day-to-day ops | done |
| D | 9–12 | Core product | done |
| E | 13–14 | Finish | done |
| F | Shell polish + archive isolation | Synapse chrome, zero old mounts | done |

## Notes

- Domain routers live under `server/modules/<domain>/` as real implementations (stable `/api` paths).
- New UI uses AppShell (Synapse): top-bar org switcher, centered timer, account-only user menu, left rail with stable icon positions, PageTabs (no second sidebar).
- Unit CI: `.github/workflows/ci.yml` (`pnpm run test:unit`).

## Unit tests

```bash
pnpm run test:unit
```

- Place tests under `__tests__/unit/`.
- Cover schemas, helpers, mappers, aggregation rules, cache invalidation helpers.
- Prefer pure functions in `server/shared` / `server/modules/<domain>/` / `lib/`.
- CI: `.github/workflows/ci.yml` runs lint + unit tests.
