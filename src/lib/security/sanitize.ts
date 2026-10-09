import DOMPurify from 'dompurify';

/**
 * Sanitize rich-text HTML (headings, text, lists) before injecting it with
 * dangerouslySetInnerHTML. Strips scripts, event handlers and javascript: URLs
 * while keeping inline formatting (Tiptap marks, links, inline styles).
 */
export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    ADD_ATTR: ['target', 'style'],
  });
}

/**
 * Only allow http(s), blob, data:image and relative URLs. Anything else
 * (e.g. javascript:) becomes an empty string.
 */
export function sanitizeUrl(url: string): string {
  const trimmed = url.trim();
  if (/^(https?:|blob:|data:image\/|\/|\.\/|\.\.\/|#)/i.test(trimmed)) return trimmed;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return trimmed; // relative path like "photo.jpg"
  return '';
}

/** Escape a string for safe use in HTML text or double/single-quoted attributes. */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
