# Cloudflare Email Task Queue

This folder contains **Cloudflare Email Workers** that receive emails routed through Cloudflare Email Routing.

| Worker | Use when |
|--------|----------|
| [`email-task-queue-worker.js`](./email-task-queue-worker.js) | Every routed address should go to the task queue webhook |
| [`email-task-queue-forward-worker.js`](./email-task-queue-forward-worker.js) | Only **one** address goes to the webhook; **all others** are forwarded to a mailbox |

## Prerequisites

- Domain DNS managed in Cloudflare
- Application deployed and reachable over HTTPS
- An **API token** (`pt_...`) created in the app (Profile → API Tokens)

## 1. Create an API token

1. In the app, open **Profile → API Tokens**.
2. Create a token (e.g. name: `Cloudflare Email Worker`).
3. Copy the `pt_...` value — it is shown only once.
4. Store it as the Worker secret `API_TOKEN`.

The token only authenticates the Worker → app call. The **queue owner** is still determined by the email **From** address (must match an active `Users.Email`).

## 2. Configure Cloudflare Email Routing

1. In Cloudflare dashboard: **Email → Email Routing → Enable**.
2. Add a custom address, e.g. `tasks@yourdomain.com`.
3. Route that address to a **Worker** (not a mailbox).

## 3. Deploy the Worker

### Option A — Wrangler CLI

```bash
cd cloudflare
npm create cloudflare@latest email-task-queue-worker -- --type=worker
# Replace generated src/index.js with email-task-queue-worker.js content, or copy this file.

wrangler secret put API_TOKEN
wrangler secret put APP_WEBHOOK_URL
# APP_WEBHOOK_URL example: https://your-domain.com/api/webhooks/email-task-queue

wrangler deploy
```

### Option B — Cloudflare dashboard

1. **Workers & Pages → Create Worker**.
2. Paste the contents of [`email-task-queue-worker.js`](./email-task-queue-worker.js).
3. Add secrets:
   - `API_TOKEN` — your `pt_...` API key
   - `APP_WEBHOOK_URL`
4. In **Email Routing**, point `tasks@yourdomain.com` to this Worker.

## 3b. Deploy the selective worker (queue + forward)

Use [`email-task-queue-forward-worker.js`](./email-task-queue-forward-worker.js) when the same catch-all routing receives **multiple** addresses but only one should create tasks.

Example:

- `tasks@yourdomain.com` → webhook (Outlook task queue)
- `info@yourdomain.com` → forward to its real mailbox (via `FORWARD_MAP`)
- `support@yourdomain.com` → forward to its real mailbox

Catch-all → Worker works for the task queue address. For all other addresses, Cloudflare **`message.forward()` only accepts verified destination addresses** (Email Routing → **Destination addresses**). A routing alias like `info@yourdomain.com` is **not** automatically valid unless it appears there as verified.

### Secrets / vars

| Name | Example | Purpose |
|------|---------|---------|
| `TASK_QUEUE_EMAIL` | `tasks@yourdomain.com` | Only mail to this address hits the webhook |
| `FORWARD_MAP` | `{"info@yourdomain.com":"info@yourdomain.com","sales@yourdomain.com":"sales@gmail.com"}` | Maps each routing address to a **verified** destination |
| `API_TOKEN` | `pt_...` | Webhook auth (same as above) |
| `APP_WEBHOOK_URL` | `https://your-domain.com/api/webhooks/email-task-queue` | Task queue webhook |

```bash
wrangler secret put TASK_QUEUE_EMAIL
wrangler secret put FORWARD_MAP
wrangler secret put API_TOKEN
wrangler secret put APP_WEBHOOK_URL
wrangler deploy
```

`FORWARD_MAP` example (one line for wrangler secret):

```json
{"info@yourdomain.com":"info@yourdomain.com","support@yourdomain.com":"support@yourcompany.com"}
```

Each value must be verified under **Email Routing → Destination addresses**. If forward fails, the Worker log/rejection now shows the real Cloudflare error (often `destination address not verified`).

In **Email Routing**, route addresses (or catch-all) to this Worker. Non-queue mail is forwarded using `FORWARD_MAP`; it is **not** sent to the webhook.

### Catch-all troubleshooting

| Symptom | Cause | Fix |
|---------|--------|-----|
| `Email processing failed` / `destination address not verified` | Forward target is a routing alias, not a verified destination | Add the real mailbox in **Destination addresses**, map it in `FORWARD_MAP` |
| Task queue not receiving mail | Wrong `TASK_QUEUE_EMAIL` or missing `API_TOKEN` | Check env vars and Worker logs |
| Loop / duplicate mail | Forward target routes back to the same Worker | Map to an external verified mailbox, not back to the Worker |

## 4. Test

1. From Outlook, send an email **from the same address** as your application user account to `tasks@yourdomain.com`.
2. Check **Administration → Activity Logs** for `EMAIL_QUEUE_RECEIVED`.
3. Open a project → **Import Tasks → Import from Outlook Queue** and import the item.

## Webhook contract

`POST /api/webhooks/email-task-queue`

Headers:

- `Content-Type: application/json`
- `Authorization: Bearer pt_...`

Body:

```json
{
  "messageId": "<Message-ID header>",
  "from": "user@company.com",
  "to": "tasks@yourdomain.com",
  "subject": "Task subject",
  "text": "Plain body",
  "html": "<p>HTML body</p>",
  "receivedAt": "2026-06-28T12:00:00.000Z"
}
```

Responses:

| Status | Meaning |
|--------|---------|
| `201` | Queued successfully |
| `200` | Duplicate `messageId` (idempotent) |
| `202` | Accepted but sender is not a registered active user |
| `401` / `403` | Missing or invalid API token |
| `500` | Server error |

## Security notes

- Use a dedicated API token for the Worker; revoke it from Profile → API Tokens if compromised.
- Only registered active users (`Users.Email`) can enqueue items.
- The `ExternalMessageId` field deduplicates retries.
- v1 does not import attachments.

## Troubleshooting

| Symptom | Check |
|---------|--------|
| Email rejected by Worker | Worker logs; `APP_WEBHOOK_URL` and `API_TOKEN` |
| Webhook 401/403 | API token valid, active, not expired |
| Webhook 202 | Sender email does not match an active app user |
| Empty import modal | Send a test email first; check `EmailTaskQueue` table |
