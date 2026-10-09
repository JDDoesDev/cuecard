/**
 * Prune the harvested app stylesheet down to what the exported deck uses.
 *
 * The CSS is parsed with the CSSOM (a <style> in an inert document) and the
 * export markup is loaded into the same document. A style rule is kept when
 * any of its selectors — with pseudo-elements and user-action/state
 * pseudo-classes stripped — matches something in the markup, when the
 * selector cannot be evaluated (conservative), or when it is a variable rule
 * on :root/html/body/[data-theme]/[data-slide-container]. @media, @supports,
 * @container and @layer blocks are filtered recursively, @keyframes are kept
 * when a kept rule references them, @font-face only for used families
 * (when given), other at-rules are kept as-is. If the CSS cannot be parsed,
 * it is returned unchanged.
 */

export interface PruneCssOptions {
  /** Export theme id, set as data-theme on <html> while matching. */
  theme?: string;
  /** Lower-case font families to keep @font-face rules for (default: keep all). */
  usedFamilies?: ReadonlySet<string>;
}

const STYLE_RULE = 1;
const IMPORT_RULE = 3;
const FONT_FACE_RULE = 5;
const KEYFRAMES_RULE = 7;

const VARIABLE_SCOPE = /:root|\bhtml\b|\bbody\b|\[data-theme|\[data-slide-container/i;
const DECLARES_VARIABLE = /[{;]\s*--[\w-]+\s*:/;

// Pseudo-elements (::x, ::x(...)) and legacy single-colon ones
const PSEUDO_ELEMENT = /::[\w-]+(?:\([^()]*\))?|:(?:before|after|first-line|first-letter)(?![\w-])/gi;
// Pseudo-classes that depend on interaction or runtime state
const STATE_PSEUDO = new RegExp(
  ':(?:hover|focus|focus-visible|focus-within|active|visited|link|any-link|target|checked|indeterminate|' +
    'placeholder-shown|fullscreen|default|valid|invalid|user-valid|user-invalid|autofill|playing|paused|' +
    'popover-open|open|modal|enabled|disabled|read-only|read-write|-webkit-[\\w-]+|-moz-[\\w-]+)(?![\\w-])(?:\\([^()]*\\))?',
  'gi',
);

/** Split a selector list on top-level commas. */
export function splitSelectors(list: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quote = '';
  let cur = '';
  for (const ch of list) {
    if (quote) {
      if (ch === quote) quote = '';
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === '(' || ch === '[') {
      depth++;
    } else if (ch === ')' || ch === ']') {
      depth--;
    } else if (ch === ',' && depth === 0) {
      out.push(cur.trim());
      cur = '';
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** Selector with pseudo-elements / state pseudo-classes removed (empty compounds become `*`). */
export function staticSelector(selector: string): string {
  let s = selector.replace(PSEUDO_ELEMENT, '').replace(STATE_PSEUDO, '').trim();
  if (!s) return '*';
  s = s.replace(/([>+~])\s*(?=[>+~])/g, '$1 * ');
  if (/[>+~]$/.test(s)) s += ' *';
  return s;
}

interface Ctx {
  doc: Document;
  usedFamilies?: ReadonlySet<string>;
  keyframes: Array<{ name: string; css: string }>;
}

function selectorMatches(ctx: Ctx, selector: string): boolean {
  try {
    return ctx.doc.querySelector(staticSelector(selector)) !== null;
  } catch {
    return true; // unparseable here: keep
  }
}

function keepStyleRule(ctx: Ctx, rule: CSSStyleRule): boolean {
  const text = rule.selectorText ?? '';
  if (!text) return true;
  if (VARIABLE_SCOPE.test(text) && DECLARES_VARIABLE.test(rule.cssText)) return true;
  return splitSelectors(text).some((sel) => selectorMatches(ctx, sel));
}

function unquote(s: string): string {
  return s.trim().replace(/^['"]|['"]$/g, '');
}

function filterRules(ctx: Ctx, rules: CSSRuleList): string {
  let out = '';
  for (const rule of Array.from(rules)) {
    switch (rule.type) {
      case STYLE_RULE:
        if (keepStyleRule(ctx, rule as CSSStyleRule)) out += rule.cssText + '\n';
        break;
      case FONT_FACE_RULE: {
        const family = unquote((rule as CSSFontFaceRule).style.getPropertyValue('font-family')).toLowerCase();
        if (!ctx.usedFamilies || ctx.usedFamilies.has(family)) out += rule.cssText + '\n';
        break;
      }
      case KEYFRAMES_RULE:
        // placeholder, resolved once all kept rules are known
        out += `\u0000${ctx.keyframes.length}\u0000`;
        ctx.keyframes.push({ name: (rule as CSSKeyframesRule).name, css: rule.cssText + '\n' });
        break;
      case IMPORT_RULE:
        out += rule.cssText + '\n';
        break;
      default:
        if ('cssRules' in rule && (rule as CSSGroupingRule).cssRules) {
          const inner = filterRules(ctx, (rule as CSSGroupingRule).cssRules);
          const brace = rule.cssText.indexOf('{');
          if (brace < 0) out += rule.cssText + '\n';
          else if (inner.trim()) out += `${rule.cssText.slice(0, brace).trim()} {\n${inner}}\n`;
        } else {
          out += rule.cssText + '\n';
        }
    }
  }
  return out;
}

/** Animation names used by `css`; null when a var() makes them unknowable (keep all). */
function referencedAnimations(css: string): Set<string> | null {
  const names = new Set<string>();
  for (const m of css.matchAll(/animation(?:-name)?\s*:\s*([^;}]+)/gi)) {
    if (/var\(/i.test(m[1])) return null;
    for (const token of m[1].split(/[\s,]+/)) if (token) names.add(unquote(token));
  }
  return names;
}

function parseSheet(doc: Document, css: string): CSSStyleSheet | null {
  const style = doc.createElement('style');
  style.textContent = css;
  doc.head.appendChild(style);
  if (style.sheet) return style.sheet;
  try {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(css);
    return sheet;
  } catch {
    return null;
  }
}

/** Keep only the rules of `css` relevant to the exported slide `markup`. */
export function pruneCss(css: string, markup: string, options: PruneCssOptions = {}): string {
  if (!css.trim() || typeof document === 'undefined') return css;
  const doc = document.implementation.createHTMLDocument('');
  if (options.theme) doc.documentElement.setAttribute('data-theme', options.theme);
  doc.body.className = 'xdeck';
  // Inert document: no scripts run, nothing loads. Mirrors exportToHTML's body.
  doc.body.innerHTML = `<main class="xstage">${markup}</main><div class="xui"><span></span></div><div class="xnotes"></div>`;
  doc.querySelectorAll('section[data-slide-container]').forEach((s) => s.setAttribute('aria-hidden', 'false'));

  let sheet: CSSStyleSheet | null;
  try {
    sheet = parseSheet(doc, css);
  } catch {
    sheet = null;
  }
  if (!sheet || sheet.cssRules.length === 0) return css;

  const ctx: Ctx = { doc, usedFamilies: options.usedFamilies, keyframes: [] };
  const kept = filterRules(ctx, sheet.cssRules);
  const animations = referencedAnimations(kept.replace(/\u0000\d+\u0000/g, ''));
  return kept.replace(/\u0000(\d+)\u0000/g, (_m, i: string) => {
    const kf = ctx.keyframes[Number(i)];
    return kf && (!animations || animations.has(kf.name)) ? kf.css : '';
  });
}
