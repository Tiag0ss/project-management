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
 * Prefer this setup when possible (avoids Worker forward entirely):
 *   tasks@domain → Worker
 *   info@ / support@ → native "Send to email" rules (not the Worker)
 *
 * Required Worker secrets / vars:
 *   TASK_QUEUE_EMAIL — e.g. tasks@yourdomain.com (only this address hits the webhook)
 *   API_TOKEN        — application API key (pt_...) from Profile → API Tokens
 *   APP_WEBHOOK_URL  — e.g. https://your-domain.com/api/webhooks/email-task-queue
 *
 * Optional (needed for catch-all → Worker):
 *   FORWARD_MAP        — JSON map: routing address → verified destination
 *                        {"info@yourdomain.com":"you@gmail.com"}
 *   DEFAULT_FORWARD_TO — verified mailbox used when FORWARD_MAP has no match
 *
 * IMPORTANT: Do NOT fall back to forwarding to the routing address itself.
 * That almost always fails with "destination address not verified".
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
    // Avoid String.fromCharCode(...bytes) — large emails blow the call stack.
    let out = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      out += String.fromCharCode(...bytes.slice(i, i + chunkSize));
    }
    return out;
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

  try {
    if (encoding === 'base64') {
      const compact = decoded.replace(/\s/g, '');
      if (!compact) return '';
      const binary = atob(compact);
      const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
      try {
        decoded = new TextDecoder(charset).decode(bytes);
      } catch {
        decoded = new TextDecoder('utf-8').decode(bytes);
      }
    } else if (encoding === 'quoted-printable') {
      decoded = decodeQuotedPrintable(decoded);
    }
  } catch (error) {
    console.error('Failed to decode MIME part', error);
    return '';
  }

  return decoded.trim();
}

function collectBodyParts(raw, depth = 0) {
  const result = { text: '', html: '' };
  if (depth > 12) return result;

  const { headers, body } = splitHeadersAndBody(raw);
  const contentType = String(headers['content-type'] || 'text/plain');
  const boundary = getBoundary(contentType);
  const loweredType = contentType.toLowerCase();

  // Skip non-text parts (attachments) — they often break base64 decode or blow memory.
  if (
    !boundary &&
    !loweredType.includes('text/plain') &&
    !loweredType.includes('text/html') &&
    !loweredType.includes('multipart/')
  ) {
    return result;
  }

  if (boundary) {
    const escapedBoundary = boundary.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const segments = body.split(new RegExp(`--${escapedBoundary}(?:--)?`, 'g'));

    for (const segment of segments) {
      const trimmed = segment.trim();
      if (!trimmed || trimmed === '--') continue;

      const nested = collectBodyParts(trimmed, depth + 1);
      if (nested.text && !result.text) result.text = nested.text;
      if (nested.html && !result.html) result.html = nested.html;
    }

    return result;
  }

  const decoded = decodePartBody(body, headers);

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
  try {
    const parts = collectBodyParts(raw);
    return {
      text: parts.text || '',
      html: parts.html || '',
    };
  } catch (error) {
    console.error('parseEmailBody failed', error);
    return { text: '', html: '' };
  }
}

function normalizeEmailAddress(value) {
  const text = String(value || '').trim().toLowerCase();
  if (!text || text === '[object object]') return '';

  const angleMatch = text.match(/<([^>]+)>/);
  if (angleMatch) {
    return angleMatch[1].trim().toLowerCase();
  }

  const emailMatch = text.match(/[^\s<>,"]+@[^\s<>,"]+/);
  return emailMatch ? emailMatch[0].trim().toLowerCase() : '';
}

function addAddressCandidates(addresses, value) {
  if (value == null) return;

  if (typeof value === 'object') {
    // Some runtimes expose envelope recipients as objects.
    const nested = value.address || value.email || value.value || value.to;
    if (nested && nested !== value) {
      addAddressCandidates(addresses, nested);
      return;
    }
  }

  String(value)
    .split(/[,;]/)
    .forEach((part) => {
      const normalized = normalizeEmailAddress(part);
      if (normalized) addresses.add(normalized);
    });
}

function collectRecipientAddresses(message) {
  const addresses = new Set();

  addAddressCandidates(addresses, message.to);
  addAddressCandidates(addresses, message.headers?.get?.('delivered-to'));
  addAddressCandidates(addresses, message.headers?.get?.('x-original-to'));
  addAddressCandidates(addresses, message.headers?.get?.('x-forwarded-to'));
  addAddressCandidates(addresses, message.headers?.get?.('to'));
  addAddressCandidates(addresses, message.headers?.get?.('cc'));

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
    message.setReject('Task queue worker is not configured (missing APP_WEBHOOK_URL or API_TOKEN)');
    return;
  }

  const messageId = message.headers.get('message-id') || `generated-${Date.now()}-${crypto.randomUUID()}`;
  const subject = message.headers.get('subject') || '';
  const from = message.from;
  const to = message.to;

  let text = '';
  let html = '';
  try {
    const rawEmail = await new Response(message.raw).text();
    ({ text, html } = parseEmailBody(rawEmail));
  } catch (error) {
    console.error('Failed to read/parse raw email; continuing with empty body', error);
  }

  let response;
  try {
    response = await fetch(webhookUrl, {
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
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error('Webhook fetch threw', { webhookUrl, reason });
    message.setReject(`Webhook unreachable: ${reason}`);
    return;
  }

  // 200 = duplicate, 201 = queued, 202 = unknown sender (accepted, do not bounce)
  if (response.ok || response.status === 202) {
    return;
  }

  const body = await response.text();
  console.error('Webhook failed', response.status, body);
  message.setReject(`Webhook HTTP ${response.status}`);
}

function getRoutingAddress(message) {
  const candidates = [
    message.to,
    message.headers?.get?.('delivered-to'),
    message.headers?.get?.('x-original-to'),
    message.headers?.get?.('x-forwarded-to'),
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
      console.error('FORWARD_MAP must be a JSON object');
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
  const forwardMap = parseForwardMap(env);
  const defaultForwardTo = normalizeEmailAddress(env.DEFAULT_FORWARD_TO);

  if (routingAddress && forwardMap[routingAddress]) {
    return {
      routingAddress,
      forwardTo: forwardMap[routingAddress],
      source: 'FORWARD_MAP',
    };
  }

  if (defaultForwardTo) {
    return {
      routingAddress,
      forwardTo: defaultForwardTo,
      source: 'DEFAULT_FORWARD_TO',
    };
  }

  // Intentionally do NOT forward to routingAddress itself — Cloudflare rejects
  // unverified routing aliases and the UI only shows a generic failure.
  return {
    routingAddress,
    forwardTo: '',
    source: 'none',
  };
}

async function forwardEmail(message, env) {
  const { routingAddress, forwardTo, source } = getForwardDestination(message, env);

  if (!forwardTo) {
    const hint =
      'Set FORWARD_MAP or DEFAULT_FORWARD_TO to a verified Destination address ' +
      '(Email Routing → Destination addresses). Do not forward to the routing alias itself.';
    console.error('No verified forward destination configured', {
      routingAddress,
      hasForwardMap: Object.keys(parseForwardMap(env)).length > 0,
      hasDefault: Boolean(normalizeEmailAddress(env.DEFAULT_FORWARD_TO)),
    });
    message.setReject(
      `No forward target for ${routingAddress || '(unknown)'}. ${hint}`
    );
    return;
  }

  try {
    await message.forward(forwardTo);
    console.log('Forwarded email', { routingAddress, forwardTo, source });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error('Forward failed', { routingAddress, forwardTo, source, reason });

    const isUnverified = /not verified|unverified/i.test(reason);
    message.setReject(
      isUnverified
        ? `Destination not verified: ${forwardTo}. Add it under Email Routing → Destination addresses, then retry.`
        : `Forward failed ${routingAddress || '?'} → ${forwardTo}: ${reason}`
    );
  }
}

export default {
  async email(message, env) {
    try {
      const taskQueueEmail = env.TASK_QUEUE_EMAIL;

      if (isTaskQueueRecipient(message, taskQueueEmail)) {
        await enqueueTaskFromEmail(message, env);
        return;
      }

      await forwardEmail(message, env);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      console.error('Email worker error', {
        reason,
        to: message.to,
        from: message.from,
      });
      // Put the actionable part first — Cloudflare UI often truncates long reasons.
      message.setReject(`Email processing failed: ${reason}`);
    }
  },
};
