import {
  formatTicketCreatorLabel,
  formatTicketRef,
  splitPortalTicketsByAttention,
  ticketNeedsCustomerAttention,
} from '../../lib/customerPortal';

describe('customerPortal', () => {
  describe('ticketNeedsCustomerAttention', () => {
    it('treats StatusType waiting as needing customer attention', () => {
      expect(ticketNeedsCustomerAttention('waiting')).toBe(true);
      expect(ticketNeedsCustomerAttention(' Waiting ')).toBe(true);
      expect(ticketNeedsCustomerAttention('WAITING')).toBe(true);
    });

    it('ignores other status types', () => {
      expect(ticketNeedsCustomerAttention('open')).toBe(false);
      expect(ticketNeedsCustomerAttention('in_progress')).toBe(false);
      expect(ticketNeedsCustomerAttention(null)).toBe(false);
      expect(ticketNeedsCustomerAttention(undefined)).toBe(false);
    });
  });

  describe('formatTicketCreatorLabel', () => {
    it('prefers CreatorName then name parts then username', () => {
      expect(formatTicketCreatorLabel({ CreatorName: '  Ana Silva  ' })).toBe('Ana Silva');
      expect(
        formatTicketCreatorLabel({
          CreatorName: '',
          CreatorFirst: 'Ana',
          CreatorLast: 'Silva',
        })
      ).toBe('Ana Silva');
      expect(
        formatTicketCreatorLabel({
          CreatorUsername: 'ana',
        })
      ).toBe('ana');
      expect(formatTicketCreatorLabel({})).toBe('—');
    });
  });

  describe('formatTicketRef', () => {
    it('prefers TicketNumber and falls back to #Id', () => {
      expect(formatTicketRef({ Id: 12, TicketNumber: 'TKT-ACME-12' })).toBe('TKT-ACME-12');
      expect(formatTicketRef({ Id: 12, TicketNumber: '  ' })).toBe('#12');
      expect(formatTicketRef({ Id: 12 })).toBe('#12');
    });
  });

  describe('splitPortalTicketsByAttention', () => {
    it('splits waiting tickets from other recent activity without duplicating', () => {
      const tickets = [
        { Id: 1, StatusType: 'waiting' },
        { Id: 2, StatusType: 'in_progress' },
        { Id: 3, StatusType: 'waiting' },
        { Id: 4, StatusType: 'open' },
        { Id: 5, StatusType: 'resolved' },
        { Id: 6, StatusType: 'closed' },
        { Id: 7, StatusType: 'open' },
        { Id: 8, StatusType: 'open' },
      ];
      const { attentionTickets, otherRecent } = splitPortalTicketsByAttention(tickets, 20);
      expect(attentionTickets.map((t) => t.Id)).toEqual([1, 3]);
      expect(otherRecent.map((t) => t.Id)).toEqual([2, 4, 5, 6, 7]);
    });
  });
});
