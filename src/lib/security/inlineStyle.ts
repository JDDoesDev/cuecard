/**
 * Inline style policy for rich text (editor HTML, raw HTML in markdown text,
 * pasted HTML). Only properties the text features use are kept, each with a
 * validated value, so stored or imported content cannot position elements
 * over the app (position/inset/z-index), load remote resources (url()), or
 * smuggle declarations (`;`, `\`, comments).
 *
 * Kept properties: text-align, line-height, margin-left (indent, <= 6em),
 * font-family, font-size, font-weight, font-style, color, background-color,
 * text-decoration(-line), vertical-align, list-style-type/position, width/min-width
 * (legacy Tiptap table/col sizing). `!important` is dropped.
 */

const NAMED_COLOR = /^[a-z]{3,30}$/i;
const HEX_COLOR = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const FUNC_COLOR = /^(?:rgba?|hsla?)\(\s*[-+0-9.%\s,/a-z]*\)$/i;
const CSS_VAR = /^var\(\s*--[a-z0-9-]+\s*\)$/i;
const LENGTH = /^(?:0|[+]?\d*\.?\d+(?:px|em|rem|%|cqw|pt|vw|vh|ch|ex))$/i;
const NUMBER = /^[+]?\d*\.?\d+$/;

/** Is `value` a plain CSS color (hex, rgb/hsl function, named keyword, or var(--x))? */
export function isSafeCssColor(value: string | null | undefined): boolean {
  if (!value) return false;
  const v = value.trim();
  if (v.length > 64) return false;
  return HEX_COLOR.test(v) || FUNC_COLOR.test(v) || NAMED_COLOR.test(v) || CSS_VAR.test(v);
}

/** Is `value` a safe font-family stack (family names, quotes, commas only)? */
export function isSafeFontFamily(value: string): boolean {
  return value.length <= 200 && /^[\w\s"',.-]+$/.test(value);
}

const KEYWORDS: Record<string, RegExp> = {
  'text-align': /^(?:left|right|center|justify|start|end)$/i,
  'font-weight': /^(?:normal|bold|bolder|lighter|[1-9]00)$/i,
  'font-style': /^(?:normal|italic|oblique)$/i,
  'text-decoration': /^(?:none|(?:underline|line-through|overline)(?:\s+(?:underline|line-through|overline))*)$/i,
  'text-decoration-line': /^(?:none|(?:underline|line-through|overline)(?:\s+(?:underline|line-through|overline))*)$/i,
  'list-style-type': /^[a-z-]{1,30}$/i,
  'list-style-position': /^(?:inside|outside)$/i,
};

const MAX_INDENT_EM = 6;
const MAX_LINE_HEIGHT = 10;
/** Upper bounds for font sizes / line heights per unit (a 1000px slide ≈ 100cqw). */
const LENGTH_CAPS: Record<string, number> = { px: 1000, pt: 750, em: 20, rem: 20, '%': 2000, cqw: 100, vw: 100, vh: 100, ch: 40, ex: 40 };

function withinCap(value: string): boolean {
  const m = /^[+]?(\d*\.?\d+)([a-z%]*)$/i.exec(value);
  if (!m) return false;
  const cap = LENGTH_CAPS[m[2].toLowerCase()];
  return m[2] === '' || (cap !== undefined && parseFloat(m[1]) <= cap);
}

/** Validated (and possibly clamped) value for an allowed property, or null. */
function allowedValue(prop: string, value: string): string | null {
  if (KEYWORDS[prop]) return KEYWORDS[prop].test(value) ? value : null;
  switch (prop) {
    case 'color':
    case 'background-color':
      return isSafeCssColor(value) ? value : null;
    case 'line-height':
      if (value === 'normal') return value;
      if (NUMBER.test(value)) return parseFloat(value) <= MAX_LINE_HEIGHT ? value : null;
      return LENGTH.test(value) && withinCap(value) ? value : null;
    case 'font-size':
      if (/^(?:x?x-small|small|medium|large|x?x-large|smaller|larger)$/i.test(value)) return value;
      return LENGTH.test(value) && withinCap(value) ? value : null;
    case 'vertical-align':
      return /^(?:baseline|sub|super|top|middle|bottom|text-top|text-bottom)$/i.test(value) || LENGTH.test(value) ? value : null;
    case 'font-family':
      return isSafeFontFamily(value) ? value : null;
    case 'width':
    case 'min-width':
      return LENGTH.test(value) ? value : null;
    case 'margin-left': {
      // Paragraph indent: em only, clamped to the 6 indent levels
      const m = /^(\d*\.?\d+)em$/i.exec(value);
      if (value === '0') return '0';
      if (!m) return null;
      return `${Math.min(MAX_INDENT_EM, parseFloat(m[1]))}em`;
    }
    default:
      return null;
  }
}

/** Split a style attribute into declarations, honouring quotes and parentheses. */
function declarations(style: string): Array<[string, string]> | null {
  const out: Array<[string, string]> = [];
  let current = '';
  let quote = '';
  let depth = 0;
  const flush = () => {
    const decl = current.trim();
    current = '';
    if (!decl) return true;
    const i = decl.indexOf(':');
    if (i <= 0) return true;
    out.push([decl.slice(0, i).trim().toLowerCase(), decl.slice(i + 1).trim()]);
    return true;
  };
  for (const ch of style) {
    if (quote) {
      if (ch === quote) quote = '';
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === '(') {
      depth++;
    } else if (ch === ')') {
      depth = Math.max(0, depth - 1);
    } else if (ch === ';' && depth === 0) {
      flush();
      continue;
    }
    current += ch;
  }
  if (quote || depth) return null; // unbalanced: reject the whole attribute
  flush();
  return out;
}

/**
 * Filter an inline style attribute to the allowed properties with validated
 * values. Returns '' when nothing is left.
 */
export function filterInlineStyle(style: string | null | undefined): string {
  if (!style) return '';
  // Escapes and comments can hide anything from a simple validator
  if (/[\\<>{}]|\/\*|url\s*\(|expression\s*\(|@import|javascript:/i.test(style)) return '';
  const decls = declarations(style);
  if (!decls) return '';
  const kept = new Map<string, string>();
  for (const [prop, raw] of decls) {
    const value = raw.replace(/\s*!\s*important\s*$/i, '').trim();
    const ok = allowedValue(prop, value);
    if (ok !== null) kept.set(prop, ok);
  }
  return [...kept].map(([p, v]) => `${p}: ${v}`).join('; ') + (kept.size > 0 ? ';' : '');
}
