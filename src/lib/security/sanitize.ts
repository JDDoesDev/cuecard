import DOMPurify from 'dompurify';
import { filterInlineStyle } from './inlineStyle';

export { filterInlineStyle, isSafeCssColor } from './inlineStyle';

/**
 * Style handling of the running sanitize call: 'rich' = user-authored rich
 * text (strict allowlist), 'rendered' = app-generated markup (any property,
 * but no url()/expression()/escapes), null = other DOMPurify users (untouched).
 */
let styleMode: 'rich' | 'rendered' | null = null;
let hookInstalled = false;

function installStyleHook(): void {
  if (hookInstalled) return;
  hookInstalled = true;
  DOMPurify.addHook('uponSanitizeAttribute', (_node, data) => {
    if (!styleMode || data.attrName !== 'style') return;
    if (styleMode === 'rendered') {
      if (/url\s*\(|expression\s*\(|\\|@import|javascript:/i.test(data.attrValue)) data.keepAttr = false;
      return;
    }
    const filtered = filterInlineStyle(data.attrValue);
    if (filtered) data.attrValue = filtered;
    else data.keepAttr = false;
  });
}

const RICH_TEXT_CONFIG = {
  USE_PROFILES: { html: true },
  ADD_TAGS: ['table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'colgroup', 'col'],
  ADD_ATTR: ['target', 'style', 'colspan', 'rowspan', 'colwidth', 'span'],
};

function sanitizeWith(mode: 'rich' | 'rendered', html: string): string {
  installStyleHook();
  styleMode = mode;
  try {
    return DOMPurify.sanitize(html, RICH_TEXT_CONFIG);
  } finally {
    styleMode = null;
  }
}

/**
 * Sanitize markup the app itself rendered (e.g. ElementRenderer output in the
 * HTML export): strips scripts, handlers and javascript: URLs but keeps the
 * renderer's own inline styles (layout, list-style-position…), rejecting only
 * url()/expression() in them. User rich text inside it was already reduced to
 * the strict allowlist by sanitizeHtml at render time.
 */
export function sanitizeRenderedHtml(html: string): string {
  return sanitizeWith('rendered', html);
}

/**
 * Sanitize rich-text HTML (headings, text, lists) before injecting it with
 * dangerouslySetInnerHTML. Strips scripts, event handlers and javascript: URLs
 * while keeping inline formatting (Tiptap marks, links, `data-indent`,
 * `data-color`) and tables (including merged cells and Tiptap column widths).
 * Inline styles are reduced to the allowed text properties with validated
 * values (see inlineStyle.ts): no positioning, z-index or url() requests.
 */
export function sanitizeHtml(html: string): string {
  return sanitizeWith('rich', html);
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
