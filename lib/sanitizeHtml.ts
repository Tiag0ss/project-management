/**
 * Client-safe rich-text HTML sanitizer (shared config with server/utils/sanitize.ts).
 * Use before dangerouslySetInnerHTML for user-authored HTML.
 */
import sanitizeHtml from 'sanitize-html';

const RICH_TEXT_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'del',
    'ul', 'ol', 'li',
    'blockquote', 'pre', 'code',
    'span',
    'a',
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
    'img',
    'div',
  ],
  allowedAttributes: {
    a: ['href', 'target', 'rel'],
    img: ['src', 'alt', 'width', 'height', 'style'],
    span: ['style', 'class'],
    p: ['style', 'class'],
    div: ['style', 'class'],
    h1: ['style'], h2: ['style'], h3: ['style'],
    h4: ['style'], h5: ['style'], h6: ['style'],
    table: ['style', 'class'],
    th: ['style', 'colspan', 'rowspan'],
    td: ['style', 'colspan', 'rowspan'],
    blockquote: ['style'],
    pre: ['style'],
    code: ['class'],
    ul: ['style'], ol: ['style'],
    li: ['style'],
  },
  allowedSchemes: ['http', 'https', 'mailto', 'tel', 'data'],
  allowedSchemesByTag: {
    img: ['http', 'https', 'data'],
  },
  allowedStyles: {
    '*': {
      color: [/.*/],
      'background-color': [/.*/],
      'font-size': [/.*/],
      'font-weight': [/.*/],
      'text-align': [/.*/],
      'text-decoration': [/.*/],
      padding: [/.*/],
      margin: [/.*/],
      border: [/.*/],
      width: [/.*/],
      height: [/.*/],
    },
  },
  transformTags: {
    a: sanitizeHtml.simpleTransform('a', { target: '_blank', rel: 'noopener noreferrer' }),
  },
};

export function sanitizeRichTextHtml(html: string | null | undefined): string {
  if (html === null || html === undefined) return '';
  if (!html.trim()) return '';
  return sanitizeHtml(html, RICH_TEXT_OPTIONS);
}
