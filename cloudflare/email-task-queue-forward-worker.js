/**
 * Cloudflare Email Worker — selective task queue + per-address forward.
 *
 * - Emails to TASK_QUEUE_EMAIL → POST to the app webhook (task queue).
 * - All other inbound emails → forward to a verified destination address.
 *
 * Cloudflare only allows message.forward() to addresses verified under
 * Email Routing → Destination addresses. Routing aliases (e.g. info@yourdomain.com)
 * are NOT valid forward targets unless explicitly verified there.
 *
 * Use FORWARD_MAP (JSON) to map each routing address to its verified mailbox:
 *   {"info@yourdomain.com":"info@yourdomain.com","sales@yourdomain.com":"sales@gmail.com"}
 *
 * Required Worker secrets / vars:
 *   TASK_QUEUE_EMAIL — e.g. tasks@yourdomain.com (only this address hits the webhook)
 *   API_TOKEN        — application API key (pt_...) from Profile → API Tokens
 *   APP_WEBHOOK_URL  — e.g. https://your-domain.com/api/webhooks/email-task-queue
 *
 * Optional:
 *   FORWARD_MAP      — JSON map: routing address → verified destination address
 */

function decodeQuotedPrintable(input) {
  const withoutSoftBreaks = String(input || '').replace(/=\r?\n/g, '');
  const bytes = [];

  for (let i = 0; i < withoutSoftBreaks.length; i += 1) {
    const char = withoutSoftBreaks[i];
    if (char === '=' && i + 2 < withoutSoftBreaks.length) {
      const hex = withoutSoftBreaks.slice(i + 1, i + 3);
      if (/^[A-Fa-f0-9]{2}$/.test(hex)) {
        bytes.push(parseInt(hex, 16));
        i += 2;
        continue;
      }
    }
    bytes.push(withoutSoftBreaks.charCodeAt(i));
  }

  try {
    return new TextDecoder('utf-8').decode(new Uint8Array(bytes));
  } catch {
    return String.fromCharCode(...bytes);
  }
}

function parseHeaderBlock(text) {
  const headers = {};
  const lines = String(text || '').split(/\r?\n/);
  let currentKey = '';

  for (const line of lines) {
    if (/^\s/.test(line) && currentKey) {
      headers[currentKey] += ` ${line.trim()}`;
      continue;
    }

    const separatorIndex = line.indexOf(':');
    if (separatorIndex > 0) {
      currentKey = line.slice(0, separatorIndex).trim().toLowerCase();
      headers[currentKey] = line.slice(separatorIndex + 1).trim();
    }
  }

  return headers;
}

function splitHeadersAndBody(raw) {
  const match = String(raw || '').match(/\r?\n\r?\n/);
  if (!match || match.index === undefined) {
    return { headers: {}, body: String(raw || '') };
  }

  const headerText = raw.slice(0, match.index);
  const body = raw.slice(match.index + match[0].length);
  return { headers: parseHeaderBlock(headerText), body };
}

function getBoundary(contentType) {
  const match = /boundary="?([^";\s]+)"?/i.exec(contentType || '');
  return match ? match[1] : null;
}

function getCharset(contentType) {
  const match = /charset="?([^";\s]+)"?/i.exec(contentType || '');
  return match ? match[1].toLowerCase() : 'utf-8';
}

function decodePartBody(body, headers) {
  const encoding = String(headers['content-transfer-encoding'] || '').toLowerCase().trim();
  const charset = getCharset(headers['content-type'] || '');
  let decoded = String(body || '').replace(/\r?\n$/, '');

  if (encoding === 'base64') {
    const binary = atob(decoded.replace(/\s/g, ''));
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    try {
      decoded = new TextDecoder(charset).decode(bytes);
    } catch {
      decoded = new TextDecoder('utf-8').decode(bytes);
    }
  } else if (encoding === 'quoted-printable') {
    decoded = decodeQuotedPrintable(decoded);
  }

  return decoded.trim();
}

function collectBodyParts(raw) {
  const result = { text: '', html: '' };
  const { headers, body } = splitHeadersAndBody(raw);
  const contentType = String(headers['content-type'] || 'text/plain');
  const boundary = getBoundary(contentType);

  if (boundary) {
    const escapedBoundary = boundary.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const segments = body.split(new RegExp(`--${escapedBoundary}(?:--)?`, 'g'));

    for (const segment of segments) {
      const trimmed = segment.trim();
      if (!trimmed || trimmed === '--') continue;

      const nested = collectBodyParts(trimmed);
      if (nested.text && !result.text) result.text = nested.text;
      if (nested.html && !result.html) result.html = nested.html;
    }

    return result;
  }

  const decoded = decodePartBody(body, headers);
  const loweredType = contentType.toLowerCase();

  if (loweredType.includes('text/html')) {
    result.html = decoded;
  } else if (loweredType.includes('text/plain')) {
    result.text = decoded;
  } else if (decoded) {
    result.text = decoded;
  }

  return result;
}

function stripHtmlTags(html) {
  return String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function parseEmailBody(raw) {
  const parts = collectBodyParts(raw);
  return {
    text: parts.text || '',
    html: parts.html || '',
  };
}

function normalizeEmailAddress(value) {
  const text = String(value || '').trim().toLowerCase();
  if (!text) return '';

  const angleMatch = text.match(/<([^>]+)>/);
  if (angleMatch) {
    return angleMatch[1].trim();
  }

  const emailMatch = text.match(/[^\s<>]+@[^\s<>]+/);
  return emailMatch ? emailMatch[0].trim() : text;
}

function collectRecipientAddresses(message) {
  const addresses = new Set();

  if (message.to) {
    String(message.to)
      .split(',')
      .forEach((part) => {
        const normalized = normalizeEmailAddress(part);
        if (normalized) addresses.add(normalized);
      });
  }

  const deliveredTo = message.headers.get('delivered-to');
  if (deliveredTo) {
    String(deliveredTo)
      .split(',')
      .forEach((part) => {
        const normalized = normalizeEmailAddress(part);
        if (normalized) addresses.add(normalized);
      });
  }

  const toHeader = message.headers.get('to');
  if (toHeader) {
    String(toHeader)
      .split(',')
      .forEach((part) => {
        const normalized = normalizeEmailAddress(part);
        if (normalized) addresses.add(normalized);
      });
  }

  return addresses;
}

function isTaskQueueRecipient(message, taskQueueEmail) {
  const target = normalizeEmailAddress(taskQueueEmail);
  if (!target) return false;

  const recipients = collectRecipientAddresses(message);
  return recipients.has(target);
}

async function enqueueTaskFromEmail(message, env) {
  const webhookUrl = env.APP_WEBHOOK_URL;
  const apiToken = env.API_TOKEN;

  if (!webhookUrl || !apiToken) {
    console.error('Missing APP_WEBHOOK_URL or API_TOKEN');
    message.setReject('Task queue worker is not configured');
    return;
  }

  const messageId = message.headers.get('message-id') || `generated-${Date.now()}-${crypto.randomUUID()}`;
  const subject = message.headers.get('subject') || '';
  const from = message.from;
  const to = message.to;
  const rawEmail = await new Response(message.raw).text();
  const { text, html } = parseEmailBody(rawEmail);

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiToken}`,
    },
    body: JSON.stringify({
      messageId,
      from,
      to,
      subject,
      text: text || stripHtmlTags(html),
      html,
      receivedAt: new Date().toISOString(),
    }),
  });

  if (!response.ok && response.status !== 202) {
    const body = await response.text();
    console.error('Webhook failed', response.status, body);
    message.setReject('Webhook delivery failed');
  }
}

function getRoutingAddress(message) {
  const candidates = [
    message.to,
    message.rcptTo,
    message.headers.get('delivered-to'),
  ];

  for (const candidate of candidates) {
    const normalized = normalizeEmailAddress(candidate);
    if (normalized) return normalized;
  }

  const recipients = collectRecipientAddresses(message);
  return recipients.values().next().value || '';
}

function parseForwardMap(env) {
  const raw = String(env.FORWARD_MAP || '').trim();
  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }

    const map = {};
    for (const [routingAddress, destinationAddress] of Object.entries(parsed)) {
      const from = normalizeEmailAddress(routingAddress);
      const to = normalizeEmailAddress(destinationAddress);
      if (from && to) {
        map[from] = to;
      }
    }
    return map;
  } catch (error) {
    console.error('Invalid FORWARD_MAP JSON', error);
    return {};
  }
}

function getForwardDestination(message, env) {
  const routingAddress = getRoutingAddress(message);
  if (!routingAddress) return '';

  const forwardMap = parseForwardMap(env);
  if (forwardMap[routingAddress]) {
    return forwardMap[routingAddress];
  }

  // Default: try the routing address itself (works only if verified as destination).
  return routingAddress;
}

async function forwardEmail(message, env) {
  const routingAddress = getRoutingAddress(message);
  const forwardTo = getForwardDestination(message, env);

  if (!forwardTo) {
    console.error('Could not determine forward destination', { routingAddress });
    message.setReject('Forward destination is missing');
    return;
  }

  try {
    await message.forward(forwardTo);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error('Forward failed', { routingAddress, forwardTo, reason });
    message.setReject(
      `Forward failed for ${routingAddress} → ${forwardTo}: ${reason}. ` +
      'Add a verified destination in Email Routing and/or set FORWARD_MAP.'
    );
  }
}

export default {
  async email(message, env, ctx) {
    try {
      const taskQueueEmail = env.TASK_QUEUE_EMAIL;

      if (isTaskQueueRecipient(message, taskQueueEmail)) {
        await enqueueTaskFromEmail(message, env);
        return;
      }

      await forwardEmail(message, env);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      console.error('Email worker error', { reason, to: message.to, from: message.from });
      message.setReject(`Email processing failed: ${reason}`);
    }
  },
};
