import { sanitizeUrl, filterInlineStyle } from '@/lib/security/sanitize';

// ============================================================================
// Minimal rehype sanitizer for raw HTML parsed by rehype-raw
// ============================================================================
// Runs after rehype-raw so raw HTML inside markdown text elements cannot
// execute script: drops dangerous elements, strips on* event handler
// properties, and neutralises javascript:/data: (non-image) URLs.

interface HastNode {
  type: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
}

const BLOCKED_TAGS = new Set([
  'script', 'style', 'iframe', 'frame', 'frameset', 'object', 'embed', 'applet',
  'link', 'meta', 'base', 'form', 'svg', 'math', 'template', 'noscript',
]);

const URL_PROPERTIES = new Set([
  'href', 'src', 'srcSet', 'action', 'formAction', 'poster', 'xLinkHref',
  'background', 'cite', 'data', 'ping', 'manifest', 'codeBase', 'dynsrc', 'lowsrc',
]);

function clean(node: HastNode): void {
  if (!node.children) return;
  node.children = node.children.filter((child) => {
    if (child.type === 'element') {
      if (child.tagName && BLOCKED_TAGS.has(child.tagName.toLowerCase())) return false;
      const props = child.properties;
      if (props) {
        for (const key of Object.keys(props)) {
          if (/^on/i.test(key)) {
            delete props[key];
          } else if (key === 'style') {
            // Same inline style policy as rich-text HTML (no positioning / url())
            const style = filterInlineStyle(String(props[key] ?? ''));
            if (style) props[key] = style;
            else delete props[key];
          } else if (URL_PROPERTIES.has(key)) {
            const value = props[key];
            const str = Array.isArray(value) ? value.join(' ') : String(value ?? '');
            const safe = sanitizeUrl(str);
            if (safe) props[key] = safe;
            else delete props[key];
          }
        }
      }
    } else if (child.type === 'raw') {
      // Unparsed raw HTML must never reach the output
      return false;
    }
    clean(child);
    return true;
  });
}

export function rehypeSanitizeRaw() {
  return (tree: HastNode) => {
    clean(tree);
  };
}
