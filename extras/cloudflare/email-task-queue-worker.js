/**
 * Cloudflare Email Worker — forwards inbound emails to the app webhook.
 *
 * Required Worker secrets / vars (wrangler.toml or dashboard):
 *   API_TOKEN       — application API key (pt_...) from Profile → API Tokens
 *   APP_WEBHOOK_URL — e.g. https://your-domain.com/api/webhooks/email-task-queue
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

export default {
  async email(message, env) {
    try {
      const webhookUrl = env.APP_WEBHOOK_URL;
      const apiToken = env.API_TOKEN;

      if (!webhookUrl || !apiToken) {
        console.error('Missing APP_WEBHOOK_URL or API_TOKEN');
        message.setReject('Worker is not configured (missing APP_WEBHOOK_URL or API_TOKEN)');
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
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      console.error('Email worker error', error);
      message.setReject(`Email processing failed: ${reason}`);
    }
  },
};
