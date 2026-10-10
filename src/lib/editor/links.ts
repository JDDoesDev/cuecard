/**
 * Link URL policy for rich text: only http(s) and mailto links are allowed.
 * Shared by the Tiptap Link configuration (parse/render/autolink/paste) and the
 * setLink command so `javascript:`, `data:` etc. can never become a link.
 */

const ALLOWED_PROTOCOL = /^(?:https?:\/\/|mailto:)/i;
// Control characters, whitespace and invisible separators browsers ignore in URLs
const CONTROL_OR_SPACE = new RegExp('[\\u0000-\\u0020\\u007f-\\u00a0\\u1680\\u180e\\u2000-\\u2029\\u205f\\u3000\\ufeff]', 'g');

/** True when `href` is an absolute http(s) or mailto URL. */
export function isAllowedLinkHref(href: string | null | undefined): boolean {
  if (!href) return false;
  const compact = href.replace(CONTROL_OR_SPACE, '');
  if (!ALLOWED_PROTOCOL.test(compact)) return false;
  if (/^mailto:/i.test(compact)) return compact.length > 'mailto:'.length;
  try {
    const url = new URL(href.trim());
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.hostname !== '';
  } catch {
    return false;
  }
}

/**
 * Normalize user input for a link: trims, adds `https://` to bare domains
 * (`example.com/x`), `mailto:` to bare e-mail addresses, and rejects anything
 * that is not an http(s)/mailto URL. Returns null when the input is not usable.
 */
export function normalizeLinkHref(input: string): string | null {
  const value = input.trim();
  if (!value || /\s/.test(value)) return null;
  let href = value;
  if (/^\/\//.test(href)) href = `https:${href}`;
  else if (/^[^\s@/:]+@[^\s@/:]+\.[^\s@/:]+$/.test(href)) href = `mailto:${href}`;
  else if (!/^[a-z][a-z0-9+.-]*:/i.test(href) || /^[^/:]+\.[a-z]{2,}:\d+(?:[/?#]|$)/i.test(href)) {
    // No scheme (or host:port): treat as a bare domain
    if (!/^(?:localhost|[^\s/?#:]+\.[^\s/?#:]+)(?::\d+)?(?:[/?#]|$)/i.test(href)) return null;
    href = `https://${href}`;
  }
  return isAllowedLinkHref(href) ? href : null;
}
