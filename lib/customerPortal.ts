/**
 * Customer portal helpers — shared between API shaping and dashboard UI.
 * StatusType `waiting` means the ticket is paused awaiting customer response.
 */

export function ticketNeedsCustomerAttention(
  statusType: string | null | undefined
): boolean {
  return String(statusType ?? '')
    .trim()
    .toLowerCase() === 'waiting';
}

export function formatTicketCreatorLabel(ticket: {
  CreatorName?: string | null;
  CreatorFirst?: string | null;
  CreatorLast?: string | null;
  CreatorUsername?: string | null;
}): string {
  const trimmedName = String(ticket.CreatorName ?? '').trim();
  if (trimmedName) return trimmedName;
  const fromParts = [ticket.CreatorFirst, ticket.CreatorLast]
    .map((p) => String(p ?? '').trim())
    .filter(Boolean)
    .join(' ');
  if (fromParts) return fromParts;
  const username = String(ticket.CreatorUsername ?? '').trim();
  return username || '—';
}

/** Prefer TicketNumber (e.g. TKT-ORG-12); fall back to #Id. */
export function formatTicketRef(ticket: {
  TicketNumber?: string | null;
  Id: number;
}): string {
  const number = String(ticket.TicketNumber ?? '').trim();
  return number || `#${ticket.Id}`;
}

export function splitPortalTicketsByAttention<T extends { StatusType?: string | null }>(
  tickets: T[],
  attentionLimit = 20
): { attentionTickets: T[]; otherRecent: T[] } {
  const attentionTickets: T[] = [];
  const otherRecent: T[] = [];
  for (const ticket of tickets) {
    if (ticketNeedsCustomerAttention(ticket.StatusType)) {
      if (attentionTickets.length < attentionLimit) {
        attentionTickets.push(ticket);
      }
    } else if (otherRecent.length < 5) {
      otherRecent.push(ticket);
    }
  }
  return { attentionTickets, otherRecent };
}
