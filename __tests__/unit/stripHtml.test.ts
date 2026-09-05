import { stripHtml } from '@/lib/stripHtml';

describe('stripHtml', () => {
  it('returns empty for nullish input', () => {
    expect(stripHtml(null)).toBe('');
    expect(stripHtml(undefined)).toBe('');
    expect(stripHtml('')).toBe('');
  });

  it('strips tags and keeps text', () => {
    expect(stripHtml('<p>Hello <strong>world</strong></p>')).toBe('Hello world');
  });

  it('normalizes br and entities', () => {
    expect(stripHtml('Line1<br/>Line2&nbsp;&amp; more')).toBe('Line1 Line2 & more');
  });
});
