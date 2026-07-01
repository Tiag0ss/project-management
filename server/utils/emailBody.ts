import { sanitizeRichText } from './sanitize';

function decodeQuotedPrintable(input: string): string {
  const withoutSoftBreaks = String(input || '').replace(/=\r?\n/g, '');
  const bytes: number[] = [];

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

  return Buffer.from(bytes).toString('utf-8');
}

function tryDecodeBase64Utf8(value: string): string {
  const compact = value.replace(/\s/g, '');
  if (!/^[A-Za-z0-9+/]+=*$/.test(compact) || compact.length < 16) {
    return value;
  }

  try {
    const decoded = Buffer.from(compact, 'base64').toString('utf-8');
    if (decoded && !decoded.includes('\u0000')) {
      return decoded;
    }
  } catch {
    // keep original
  }

  return value;
}

export function looksLikeMimeGarbage(value: string): boolean {
  const sample = value.slice(0, 4000);
  if (!sample.trim()) return true;
  if (/--[A-Za-z0-9_=.-]+/.test(sample) && /Content-Type:/i.test(sample)) return true;
  if (/Content-Transfer-Encoding:/i.test(sample)) return true;
  if (/MIME-Version:/i.test(sample)) return true;

  const compact = sample.replace(/\s/g, '');
  if (compact.length > 80 && /^[A-Za-z0-9+/=]+$/.test(compact)) return true;

  const qpMatches = sample.match(/=[A-Fa-f0-9]{2}/g) || [];
  if (qpMatches.length > 8) return true;

  return false;
}

function stripHtmlToPlain(html: string): string {
  return html
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

export function plainTextToHtml(text: string): string {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  if (!normalized) return '';

  const escaped = normalized
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  return escaped
    .split(/\n{2,}/)
    .map((block) => `<p>${block.replace(/\n/g, '<br>')}</p>`)
    .join('');
}

function cleanEncodings(value: string): string {
  let cleaned = value.trim();
  if (!cleaned) return '';

  if (looksLikeMimeGarbage(cleaned)) {
    const base64Decoded = tryDecodeBase64Utf8(cleaned);
    if (base64Decoded !== cleaned && !looksLikeMimeGarbage(base64Decoded)) {
      cleaned = base64Decoded;
    }
  }

  if (/=[A-Fa-f0-9]{2}/.test(cleaned)) {
    const qpDecoded = decodeQuotedPrintable(cleaned);
    if (qpDecoded && !looksLikeMimeGarbage(qpDecoded)) {
      cleaned = qpDecoded;
    }
  }

  return cleaned.trim();
}

/**
 * Normalize email body content for task Description (rich text HTML).
 */
export function normalizeEmailBodyForTaskDescription(
  bodyText: string | null | undefined,
  bodyHtml: string | null | undefined
): string | null {
  let text = cleanEncodings(String(bodyText ?? ''));
  let html = cleanEncodings(String(bodyHtml ?? ''));

  if (looksLikeMimeGarbage(text)) text = '';
  if (looksLikeMimeGarbage(html)) html = '';

  if (html) {
    const sanitized = sanitizeRichText(html);
    if (sanitized && sanitized.trim() && !looksLikeMimeGarbage(sanitized)) {
      return sanitized;
    }
    const plainFromHtml = stripHtmlToPlain(html);
    if (plainFromHtml && !looksLikeMimeGarbage(plainFromHtml)) {
      return plainTextToHtml(plainFromHtml);
    }
  }

  if (text) {
    return plainTextToHtml(text);
  }

  return null;
}
