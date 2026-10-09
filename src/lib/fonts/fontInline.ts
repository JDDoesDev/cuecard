/**
 * Inline font faces as data: URIs for documents that cannot reach the app's
 * origin: sandboxed `html`-element iframes (opaque origin, so same-origin
 * bundled @fontsource files and parent blob: URLs are unusable) and the
 * standalone HTML export.
 *
 * Sources, in order: @font-face rules of the document's same-origin
 * stylesheets (bundled @fontsource fonts and fonts injected by fontLoader,
 * whose blob: URLs the parent can still fetch), then Google font blobs cached
 * in IndexedDB by fontLoader. Only weights 400/700 (italic when used) and the
 * unicode-range subsets the text needs (basic latin always) are embedded.
 * Data URIs are cached in memory per face.
 */

import { get } from 'idb-keyval';

export interface FontFaceSource {
  family: string;
  /** Declarations other than font-family/src (weight, style, unicode-range…) */
  descriptors: Record<string, string>;
  /** Absolute URLs from src, woff2 first */
  urls: string[];
}

export interface InlineFontOptions {
  /** Face sources; defaults to the current document's @font-face rules. */
  faces?: FontFaceSource[];
  /** Also embed italic faces. */
  italic?: boolean;
  /** Text to render; adds unicode-range subsets beyond basic latin. */
  text?: string;
  /** Size cap for the generated CSS (bytes); families over it are reported failed. */
  maxBytes?: number;
}

export interface InlineFontResult {
  /** @font-face rules with data: URIs */
  css: string;
  /** Families embedded in `css` */
  inlined: string[];
  /** Families with no usable source (or over the size cap) */
  failed: string[];
}

const NEEDED_WEIGHTS = [400, 700];
const DEFAULT_MAX_BYTES = 3 * 1024 * 1024;

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read blob'));
    reader.readAsDataURL(blob);
  });
}

function unquote(s: string): string {
  return s.trim().replace(/^['"]|['"]$/g, '');
}

// ============================================================================
// @font-face collection
// ============================================================================

export function parseFontFaceRule(rule: CSSFontFaceRule, baseUrl: string): FontFaceSource | null {
  const style = rule.style;
  const family = unquote(style.getPropertyValue('font-family'));
  const src = style.getPropertyValue('src');
  if (!family || !src) return null;
  const entries: Array<{ url: string; woff2: boolean }> = [];
  const re = /url\(\s*(['"]?)(.*?)\1\s*\)\s*(?:format\(\s*['"]?([\w-]+)['"]?\s*\))?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    try {
      entries.push({ url: new URL(m[2], baseUrl).href, woff2: m[3] === 'woff2' });
    } catch {
      // ignore malformed url
    }
  }
  if (entries.length === 0) return null;
  entries.sort((a, b) => Number(b.woff2) - Number(a.woff2));
  const descriptors: Record<string, string> = {};
  for (const prop of ['font-weight', 'font-style', 'font-stretch', 'unicode-range', 'font-display']) {
    const v = style.getPropertyValue(prop).trim();
    if (v) descriptors[prop] = v;
  }
  return { family, descriptors, urls: entries.map((e) => e.url) };
}

function walkFontFaces(rules: CSSRuleList, baseUrl: string, out: FontFaceSource[]): void {
  for (const rule of Array.from(rules)) {
    if (rule.type === 5 /* FONT_FACE_RULE */) {
      const face = parseFontFaceRule(rule as CSSFontFaceRule, baseUrl);
      if (face) out.push(face);
    } else if (rule.type === 3 /* IMPORT_RULE */) {
      const imp = rule as CSSImportRule;
      try {
        if (imp.styleSheet) walkFontFaces(imp.styleSheet.cssRules, imp.styleSheet.href ?? baseUrl, out);
      } catch {
        // cross-origin import
      }
    } else if ('cssRules' in rule && rule.type !== 1) {
      walkFontFaces((rule as CSSGroupingRule).cssRules, baseUrl, out);
    }
  }
}

let faceCache: { sheets: StyleSheet[]; faces: FontFaceSource[] } | null = null;

/** @font-face rules from the document's readable stylesheets (cached until sheets change). */
export function collectFontFaceSources(doc: Document | undefined = typeof document !== 'undefined' ? document : undefined): FontFaceSource[] {
  if (!doc) return [];
  const sheets = Array.from(doc.styleSheets);
  if (
    doc === globalThis.document && faceCache &&
    faceCache.sheets.length === sheets.length && faceCache.sheets.every((sh, i) => sh === sheets[i])
  ) return faceCache.faces;
  const faces: FontFaceSource[] = [];
  for (const sheet of sheets) {
    try {
      walkFontFaces(sheet.cssRules, sheet.href ?? doc.baseURI, faces);
    } catch {
      // cross-origin stylesheet (e.g. Google Fonts CSS)
    }
  }
  if (doc === globalThis.document) faceCache = { sheets, faces };
  return faces;
}

// ============================================================================
// Unicode ranges / descriptors
// ============================================================================

export function parseUnicodeRange(range: string): Array<[number, number]> {
  return range.split(',').map((part) => {
    const p = part.trim().replace(/^u\+/i, '');
    if (p.includes('?')) {
      return [parseInt(p.replace(/\?/g, '0'), 16), parseInt(p.replace(/\?/g, 'F'), 16)] as [number, number];
    }
    const [a, b] = p.split('-');
    const lo = parseInt(a, 16);
    return [lo, b ? parseInt(b, 16) : lo] as [number, number];
  }).filter(([a, b]) => !Number.isNaN(a) && !Number.isNaN(b));
}

export function rangeNeeded(range: string | undefined, codepoints: Set<number>): boolean {
  if (!range) return true;
  const ranges = parseUnicodeRange(range);
  for (const cp of codepoints) {
    for (const [lo, hi] of ranges) if (cp >= lo && cp <= hi) return true;
  }
  return false;
}

/** Codepoints of `text` plus printable basic latin. */
export function textCodepoints(text: string): Set<number> {
  const codepoints = new Set<number>();
  for (let cp = 0x20; cp < 0x7f; cp++) codepoints.add(cp);
  for (const ch of text) codepoints.add(ch.codePointAt(0)!);
  return codepoints;
}

function weightRange(value: string | undefined): [number, number] {
  const v = (value ?? '').trim().toLowerCase();
  if (!v || v === 'normal') return [400, 400];
  if (v === 'bold') return [700, 700];
  const nums = v.split(/\s+/).map(Number).filter((n) => Number.isFinite(n));
  if (nums.length === 0) return [400, 400];
  return [nums[0], nums[1] ?? nums[0]];
}

function isItalicFace(face: FontFaceSource): boolean {
  return /italic|oblique/i.test(face.descriptors['font-style'] ?? '');
}

function faceWanted(face: FontFaceSource, italic: boolean, codepoints: Set<number>): boolean {
  if (isItalicFace(face) && !italic) return false;
  const [lo, hi] = weightRange(face.descriptors['font-weight']);
  if (!NEEDED_WEIGHTS.some((w) => w >= lo && w <= hi)) return false;
  return rangeNeeded(face.descriptors['unicode-range'], codepoints);
}

// ============================================================================
// HTML scanning
// ============================================================================

/** CSS font stacks declared in HTML (style attributes, <style>, <font face>, SVG font-family). */
export function fontStacksInHtml(html: string): string[] {
  const css: string[] = [];
  const stacks: string[] = [];
  if (typeof document !== 'undefined') {
    const tpl = document.createElement('template'); // inert: no script, no loads
    tpl.innerHTML = html;
    tpl.content.querySelectorAll('[style]').forEach((n) => css.push(n.getAttribute('style') ?? ''));
    tpl.content.querySelectorAll('style').forEach((n) => css.push(n.textContent ?? ''));
    tpl.content.querySelectorAll('font[face]').forEach((n) => stacks.push(n.getAttribute('face') ?? ''));
    tpl.content.querySelectorAll('[font-family]').forEach((n) => stacks.push(n.getAttribute('font-family') ?? ''));
  } else {
    css.push(html.replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'"));
  }
  for (const text of css) {
    for (const m of text.matchAll(/font-family\s*:\s*([^;}<>]+)/gi)) stacks.push(m[1]);
  }
  return stacks.map((s) => s.trim()).filter(Boolean);
}

/** True when the HTML probably renders italic text. */
export function htmlUsesItalic(html: string): boolean {
  return /<(i|em|cite|var|dfn|address)[\s>]|font-style\s*:\s*(italic|oblique)/i.test(html);
}

// ============================================================================
// Inlining
// ============================================================================

const dataCache = new Map<string, Promise<string | null>>();

/** Memoized data URI loader; failures are not cached so they can be retried. */
function cachedData(key: string, load: () => Promise<string | null>): Promise<string | null> {
  let p = dataCache.get(key);
  if (!p) {
    p = load()
      .catch(() => null)
      .then((data) => {
        if (!data) dataCache.delete(key);
        return data;
      });
    dataCache.set(key, p);
  }
  return p;
}

async function urlToData(url: string): Promise<string | null> {
  if (/^data:/i.test(url)) return url;
  const res = await fetch(url);
  if (!res.ok) return null;
  return blobToDataUrl(await res.blob());
}

function cssFamily(family: string): string {
  return family.replace(/["\\<>{};]/g, '');
}

const ALLOWED_FONT_MIME = /^(?:font\/[\w.+-]+|application\/(?:x-)?font-[\w.+-]+)$/i;

/** data:<font mime>;base64,<payload> with a safe MIME and quote-free payload, or null. */
export function safeFontDataUrl(data: string): string | null {
  const m = /^data:([^;,]*)(?:;[^,]*)?;base64,([A-Za-z0-9+/]+=*)$/.exec(data);
  if (!m) return null;
  // Blobs fetched without a font Content-Type (e.g. octet-stream): browsers sniff the format
  const mime = ALLOWED_FONT_MIME.test(m[1]) ? m[1].toLowerCase() : 'font/sfnt';
  return `data:${mime};base64,${m[2]}`;
}

function faceRule(family: string, rawData: string, descriptors: Record<string, string>): string {
  const data = safeFontDataUrl(rawData);
  if (!data) return '';
  const desc = Object.entries(descriptors)
    .filter(([k]) => k !== 'font-display')
    .map(([k, v]) => `${k}:${v.replace(/[<>{};\\]/g, '')};`)
    .join('');
  return `@font-face{font-family:"${cssFamily(family)}";src:url("${data}");${desc}}`;
}

async function fromDocumentFaces(family: string, faces: FontFaceSource[], italic: boolean, codepoints: Set<number>): Promise<string> {
  const lower = family.toLowerCase();
  const wanted = faces.filter((f) => f.family.toLowerCase() === lower && faceWanted(f, italic, codepoints));
  const rules = await Promise.all(wanted.map(async (face) => {
    for (const url of face.urls) {
      const data = await cachedData(url, () => urlToData(url));
      if (data) return faceRule(family, data, face.descriptors);
    }
    return '';
  }));
  return rules.filter(Boolean).join('');
}

const IDB_VARIANTS: Array<{ variant: string; weight: number; italic: boolean }> = [
  { variant: 'regular', weight: 400, italic: false },
  { variant: '700', weight: 700, italic: false },
  { variant: 'italic', weight: 400, italic: true },
  { variant: '700italic', weight: 700, italic: true },
];

async function fromIndexedDb(family: string, italic: boolean): Promise<string> {
  const rules = await Promise.all(IDB_VARIANTS.filter((v) => italic || !v.italic).map(async (v) => {
    const key = `font:${family}:${v.variant}`;
    const data = await cachedData(key, async () => {
      const blob: Blob | undefined = await get(key);
      return blob ? blobToDataUrl(blob) : null;
    });
    return data
      ? faceRule(family, data, { 'font-weight': String(v.weight), 'font-style': v.italic ? 'italic' : 'normal' })
      : '';
  }));
  return rules.filter(Boolean).join('');
}

async function familyCss(family: string, faces: FontFaceSource[], italic: boolean, codepoints: Set<number>): Promise<string> {
  const fromDoc = await fromDocumentFaces(family, faces, italic, codepoints);
  if (fromDoc) return fromDoc;
  try {
    return await fromIndexedDb(family, italic);
  } catch {
    return ''; // no IndexedDB (tests, private mode)
  }
}

const RESULT_CACHE_MAX = 20;
/** Partial results (some families failed) are reused briefly, then retried. */
const PARTIAL_TTL_MS = 30_000;
const resultCache = new Map<string, { result: InlineFontResult; at: number }>();

/**
 * Cache key: families, italic, cap and the unicode-range subsets the text
 * selects (not the text itself, so typing new characters within the same
 * subsets reuses the entry).
 */
function resultKey(families: string[], opts: InlineFontOptions): string | null {
  if (opts.faces) return null; // only memoize document-sourced requests
  const codepoints = textCodepoints(opts.text ?? '');
  const lower = new Set(families.map((f) => f.toLowerCase()));
  const ranges = new Set<string>();
  for (const face of collectFontFaceSources()) {
    if (lower.has(face.family.toLowerCase()) && faceWanted(face, !!opts.italic, codepoints)) {
      ranges.add(face.descriptors['unicode-range'] ?? '*');
    }
  }
  return `${families.join('|')}#${opts.italic ? 1 : 0}#${opts.maxBytes ?? ''}#${[...ranges].sort().join(';')}`;
}

function cacheGet(key: string): InlineFontResult | undefined {
  const hit = resultCache.get(key);
  if (!hit) return undefined;
  if (hit.result.failed.length && Date.now() - hit.at > PARTIAL_TTL_MS) {
    resultCache.delete(key);
    return undefined;
  }
  resultCache.delete(key); // LRU: move to most recent
  resultCache.set(key, hit);
  return hit.result;
}

function cacheSet(key: string, result: InlineFontResult): void {
  resultCache.delete(key);
  resultCache.set(key, { result, at: Date.now() });
  while (resultCache.size > RESULT_CACHE_MAX) resultCache.delete(resultCache.keys().next().value!);
}

const EMPTY: InlineFontResult = { css: '', inlined: [], failed: [] };

/** Synchronously return a previously built result, if cached (partial results only briefly). */
export function peekInlineFontCss(families: string[], opts: InlineFontOptions = {}): InlineFontResult | undefined {
  if (families.length === 0) return EMPTY;
  const key = resultKey(families, opts);
  return key ? cacheGet(key) : undefined;
}

/**
 * Build @font-face CSS with data: URIs for `families`. Families without a
 * source, or that would push the CSS past `maxBytes`, are returned in
 * `failed` so callers can fall back to linking Google Fonts.
 */
export async function buildInlineFontCss(families: string[], opts: InlineFontOptions = {}): Promise<InlineFontResult> {
  const cached = peekInlineFontCss(families, opts);
  if (cached) return cached;
  const faces = opts.faces ?? collectFontFaceSources();
  const codepoints = textCodepoints(opts.text ?? '');
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
  const parts = await Promise.all(families.map((f) => familyCss(f, faces, !!opts.italic, codepoints)));

  const result: InlineFontResult = { css: '', inlined: [], failed: [] };
  families.forEach((family, i) => {
    const css = parts[i];
    if (!css) {
      result.failed.push(family);
    } else if (result.css.length + css.length > maxBytes) {
      console.warn(`Font "${family}" not embedded: inline font size cap (${maxBytes} bytes) reached`);
      result.failed.push(family);
    } else {
      result.css += css;
      result.inlined.push(family);
    }
  });
  const key = resultKey(families, opts);
  if (key) cacheSet(key, result);
  return result;
}

/** Test helper: drop in-memory caches. */
export function clearInlineFontCache(): void {
  dataCache.clear();
  resultCache.clear();
  faceCache = null;
}
