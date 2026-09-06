import {
  hasMeaningfulCustomFieldValue,
  hasMeaningfulExternalTicketId,
  hasMeaningfulText,
  hasMeaningfulTicketDate,
} from '../../lib/ticketDisplay';

describe('ticketDisplay', () => {
  it('rejects empty and placeholder text', () => {
    expect(hasMeaningfulText(null)).toBe(false);
    expect(hasMeaningfulText('')).toBe(false);
    expect(hasMeaningfulText('  ')).toBe(false);
    expect(hasMeaningfulText('0')).toBe(false);
    expect(hasMeaningfulText('0000')).toBe(false);
    expect(hasMeaningfulText('Support')).toBe(true);
  });

  it('treats 0000 as non-meaningful external ticket id', () => {
    expect(hasMeaningfulExternalTicketId('0000')).toBe(false);
    expect(hasMeaningfulExternalTicketId('PROJ-12')).toBe(true);
  });

  it('rejects MySQL zero dates', () => {
    expect(hasMeaningfulTicketDate(null)).toBe(false);
    expect(hasMeaningfulTicketDate('0000-00-00')).toBe(false);
    expect(hasMeaningfulTicketDate('0000-00-00 00:00:00')).toBe(false);
    expect(hasMeaningfulTicketDate('2026-09-06')).toBe(true);
  });

  it('keeps boolean and numeric custom field values', () => {
    expect(hasMeaningfulCustomFieldValue(false)).toBe(true);
    expect(hasMeaningfulCustomFieldValue(0)).toBe(true);
    expect(hasMeaningfulCustomFieldValue('0000')).toBe(false);
    expect(hasMeaningfulCustomFieldValue('')).toBe(false);
  });
});
