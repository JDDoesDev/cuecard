/**
 * HTML-comment directive helpers shared by the markdown parser and serializer.
 *
 * Directive syntax: `<!-- name -->` or `<!-- name: argument -->`.
 *
 * Slide-level directives: `layout`, `transition`, `notes`, `notes-data`.
 * Element-level directives: `element` (lossless app export), and the legacy
 * `position`, `fragment`, `fragment-items`, `column-break`, `shape`.
 */

export const KNOWN_DIRECTIVES = new Set([
  'element',
  'layout',
  'transition',
  'notes',
  'notes-data',
  'position',
  'fragment',
  'fragment-items',
  'column-break',
  'shape',
]);

export interface Directive {
  name: string;
  arg: string;
}

const DIRECTIVE_BODY_RE = /^([a-zA-Z][\w-]*)[ \t\n]*(?::([\s\S]*))?$/;

/**
 * Parse an mdast `html` node value into directives.
 *
 * Returns null unless the value consists ONLY of comments (and whitespace)
 * and every comment is a known directive. Anything else is regular HTML
 * content and must be preserved as such. Linear time (indexOf scanning).
 */
export function parseDirectives(htmlValue: string): Directive[] | null {
  const directives: Directive[] = [];
  let pos = 0;
  while (pos < htmlValue.length) {
    const open = htmlValue.indexOf('<!--', pos);
    const gap = htmlValue.slice(pos, open === -1 ? htmlValue.length : open);
    if (gap.trim() !== '') return null;
    if (open === -1) break;
    const close = htmlValue.indexOf('-->', open + 4);
    if (close === -1) return null;
    const body = htmlValue.slice(open + 4, close).trim().match(DIRECTIVE_BODY_RE);
    if (!body) return null;
    const name = body[1].toLowerCase();
    if (!KNOWN_DIRECTIVES.has(name)) return null;
    directives.push({ name, arg: (body[2] ?? '').trim() });
    pos = close + 3;
  }
  return directives.length > 0 ? directives : null;
}

/** True if the html value consists only of HTML comments (and whitespace). */
export function isOnlyComments(htmlValue: string): boolean {
  let pos = 0;
  let found = false;
  while (pos < htmlValue.length) {
    const open = htmlValue.indexOf('<!--', pos);
    const gap = htmlValue.slice(pos, open === -1 ? htmlValue.length : open);
    if (gap.trim() !== '') return false;
    if (open === -1) break;
    const close = htmlValue.indexOf('-->', open + 4);
    if (close === -1) return false;
    found = true;
    pos = close + 3;
  }
  return found;
}

/**
 * JSON-encode a value so it can safely live inside an HTML comment:
 * no raw newlines (JSON never emits them) and no `--` sequence (which could
 * form a `-->` terminator). `-` is a valid JSON escape for `-`.
 */
export function encodeDirectiveJson(value: unknown): string {
  return JSON.stringify(value).replace(/--/g, '-\\u002d');
}

export function directive(name: string, arg?: string): string {
  return arg === undefined ? `<!-- ${name} -->` : `<!-- ${name}: ${arg} -->`;
}
