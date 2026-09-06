/**
 * Ticket detail display helpers — hide empty / placeholder values.
 */

const ZERO_DATE_RE = /^0000-00-00/;

export function hasMeaningfulText(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  const text = String(value).trim();
  if (!text) return false;
  // Common placeholders accidentally stored as "values"
  if (text === '0' || text === '0000' || text === '-' || text === '—') return false;
  return true;
}

export function hasMeaningfulExternalTicketId(value: unknown): boolean {
  return hasMeaningfulText(value);
}

export function hasMeaningfulTicketDate(value: unknown): boolean {
  if (value === null || value === undefined || value === '') return false;
  if (value instanceof Date) {
    return !Number.isNaN(value.getTime()) && value.getFullYear() > 0;
  }
  const text = String(value).trim();
  if (!text || ZERO_DATE_RE.test(text)) return false;
  const parsed = new Date(text);
  return !Number.isNaN(parsed.getTime()) && parsed.getFullYear() > 0;
}

export function hasMeaningfulCustomFieldValue(value: unknown): boolean {
  if (typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  return hasMeaningfulText(value);
}
