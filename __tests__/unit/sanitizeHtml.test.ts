import { sanitizeRichTextHtml } from '../../lib/sanitizeHtml';

describe('sanitizeRichTextHtml', () => {
  it('strips script tags and keeps safe markup', () => {
    const html = '<p>Hello <script>alert(1)</script><strong>world</strong></p>';
    const out = sanitizeRichTextHtml(html);
    expect(out).toContain('<strong>world</strong>');
    expect(out).not.toContain('<script');
  });

  it('forces safe link targets', () => {
    const out = sanitizeRichTextHtml('<a href="https://example.com">x</a>');
    expect(out).toContain('rel="noopener noreferrer"');
    expect(out).toContain('target="_blank"');
  });
});
