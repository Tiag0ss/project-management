import sanitizeHtml from 'sanitize-html';

/**
 * Sanitize user-provided HTML content (rich text fields) to prevent XSS.
 * Allows common rich text HTML elements while stripping dangerous tags and attributes.
 */
export function sanitizeRichText(html: string | null | undefined): string | null {
  if (html === null || html === undefined) return null;
  if (!html.trim()) return '';

  return sanitizeHtml(html, {
    allowedTags: [
      // Headings
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      // Text formatting
      'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'del',
      // Lists
      'ul', 'ol', 'li',
      // Block elements
      'blockquote', 'pre', 'code',
      // Inline
      'span',
      // Links
      'a',
      // Tables
      'table', 'thead', 'tbody', 'tr', 'th', 'td',
      // Images
      'img',
      // Divs
      'div',
    ],
    allowedAttributes: {
      'a': ['href', 'target', 'rel'],
      'img': ['src', 'alt', 'width', 'height', 'style'],
      'span': ['style', 'class'],
      'p': ['style', 'class'],
      'div': ['style', 'class'],
      'h1': ['style'], 'h2': ['style'], 'h3': ['style'],
      'h4': ['style'], 'h5': ['style'], 'h6': ['style'],
      'table': ['style', 'class'],
      'th': ['style', 'colspan', 'rowspan'],
      'td': ['style', 'colspan', 'rowspan'],
      'blockquote': ['style'],
      'pre': ['style'],
      'code': ['class'],
      'ul': ['style'], 'ol': ['style'],
      'li': ['style'],
    },
    allowedStyles: {
      '*': {
        // Allow common inline styles
        'color': [/.*/],
        'background-color': [/.*/],
        'font-size': [/.*/],
        'font-weight': [/.*/],
        'text-align': [/.*/],
        'text-decoration': [/.*/],
        'padding': [/.*/],
        'margin': [/.*/],
        'border': [/.*/],
        'width': [/.*/],
        'height': [/.*/],
      },
    },
    // Force links to open in new tab safely
    transformTags: {
      'a': sanitizeHtml.simpleTransform('a', { 'target': '_blank', 'rel': 'noopener noreferrer' }),
    },
  });
}

/**
 * Sanitize plain text (strips all HTML tags).
 */
export function sanitizePlainText(text: string | null | undefined): string | null {
  if (text === null || text === undefined) return null;
  return sanitizeHtml(text, { allowedTags: [], allowedAttributes: {} });
}
