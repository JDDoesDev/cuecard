/**
 * Asset helpers for the standalone HTML export: turning images/fonts into
 * data URIs and harvesting the app's own CSS at export time.
 */

import type { ImageElement } from '@/types/slide';
import { sanitizeUrl } from '@/lib/security/sanitize';

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read blob'));
    reader.readAsDataURL(blob);
  });
}

/** Fetch a URL and return it as a data URI, or null on any failure. */
export async function fetchAsDataUrl(url: string, init?: RequestInit): Promise<string | null> {
  try {
    const res = await fetch(url, init);
    if (!res.ok) return null;
    return await blobToDataUrl(await res.blob());
  } catch {
    return null;
  }
}

function isRemote(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

/**
 * Resolve a self-contained `src` for an image element's `url`. Uploaded
 * images are expected to have been inlined already (embedImagesForExport);
 * session-only blob: URLs are never used. Relative paths are embedded when
 * fetchable; remote images only when requested. Returns a sanitized URL.
 */
export async function resolveImageSrc(element: ImageElement, embedRemote: boolean): Promise<string> {
  const url = (element.url ?? '').trim();
  if (!url || /^blob:/i.test(url)) return '';
  if (/^data:image\//i.test(url)) return sanitizeUrl(url);
  if (isRemote(url)) {
    if (embedRemote) {
      const data = await fetchAsDataUrl(url, { mode: 'cors' });
      if (data) return data;
    }
    return sanitizeUrl(url);
  }
  const safe = sanitizeUrl(url);
  if (!safe) return '';
  return (await fetchAsDataUrl(safe)) ?? safe;
}

/** Videos are linked (session blob: URLs are dropped). */
export function resolveVideoSrc(url: string): string {
  const trimmed = url.trim();
  if (/^blob:/i.test(trimmed)) return '';
  if (/^data:video\//i.test(trimmed)) return trimmed;
  return sanitizeUrl(trimmed);
}
// ============================================================================
// CSS collection
// ============================================================================

export interface CollectedFontFace {
  family: string;
  /** Declarations other than font-family/src (weight, style, unicode-range…) */
  descriptors: Record<string, string>;
  /** Absolute URLs from src, woff2 first */
  urls: string[];
}

export interface CollectedCss {
  /** All same-origin style rules except @font-face and per-theme variable blocks */
  css: string;
  fontFaces: CollectedFontFace[];
  /** Cross-origin https stylesheets (e.g. Google Fonts) to link */
  links: string[];
  /** Per-theme variable blocks keyed by theme id (fallback theme source) */
  themeBlocks?: Record<string, string>;
}

const THEME_BLOCK = /^\[data-theme=['"]?([\w-]+)['"]?\]$/;

function unquote(s: string): string {
  return s.trim().replace(/^['"]|['"]$/g, '');
}

function parseFontFace(rule: CSSFontFaceRule, baseUrl: string): CollectedFontFace | null {
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

function walkRules(rules: CSSRuleList, baseUrl: string, out: CollectedCss): void {
  for (const rule of Array.from(rules)) {
    if (rule.type === 5 /* FONT_FACE_RULE */) {
      const face = parseFontFace(rule as CSSFontFaceRule, baseUrl);
      if (face) out.fontFaces.push(face);
      continue;
    }
    if (rule.type === 3 /* IMPORT_RULE */) {
      const imp = rule as CSSImportRule;
      try {
        if (imp.styleSheet) walkRules(imp.styleSheet.cssRules, imp.styleSheet.href ?? baseUrl, out);
      } catch {
        if (imp.href && /^https:\/\//i.test(imp.href)) out.links.push(imp.href);
      }
      continue;
    }
    const themeMatch = rule.type === 1 /* STYLE_RULE */ ? THEME_BLOCK.exec((rule as CSSStyleRule).selectorText.trim()) : null;
    if (themeMatch) {
      // only the selected theme is embedded (separately)
      out.themeBlocks![themeMatch[1]] = (out.themeBlocks![themeMatch[1]] ?? '') + rule.cssText + '\n';
      continue;
    }
    out.css += rule.cssText.replace(/url\(\s*(['"]?)(?!data:|#)(.*?)\1\s*\)/g, (whole, _q, u: string) => {
      try {
        return `url("${new URL(u, baseUrl).href}")`;
      } catch {
        return whole;
      }
    }) + '\n';
  }
}

/** Harvest the running app's stylesheets (includes hashed CSS-module rules). */
export function collectDocumentCss(doc: Document = document): CollectedCss {
  const out: CollectedCss = { css: '', fontFaces: [], links: [], themeBlocks: {} };
  for (const sheet of Array.from(doc.styleSheets)) {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      if (sheet.href && /^https:\/\//i.test(sheet.href)) out.links.push(sheet.href);
      continue;
    }
    walkRules(rules, sheet.href ?? doc.baseURI, out);
  }
  out.links = Array.from(new Set(out.links));
  return out;
}

// ============================================================================
// Fonts
// ============================================================================

function parseUnicodeRange(range: string): Array<[number, number]> {
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

function rangeNeeded(range: string | undefined, codepoints: Set<number>): boolean {
  if (!range) return true;
  const ranges = parseUnicodeRange(range);
  for (const cp of codepoints) {
    for (const [lo, hi] of ranges) if (cp >= lo && cp <= hi) return true;
  }
  return false;
}

/**
 * Build embedded @font-face CSS for every collected face whose family is in
 * `usedFamilies` (lower-case names) and whose unicode-range covers at least one
 * character of `sampleText`. Families whose files cannot be fetched are
 * returned in `failed` so the caller can link them from Google Fonts.
 */
export async function buildEmbeddedFontCss(
  faces: CollectedFontFace[],
  usedFamilies: ReadonlySet<string>,
  sampleText: string,
): Promise<{ css: string; failed: string[] }> {
  const codepoints = new Set<number>();
  for (const ch of sampleText) codepoints.add(ch.codePointAt(0)!);
  for (let cp = 0x20; cp < 0x7f; cp++) codepoints.add(cp); // always basic latin

  const failed = new Set<string>();
  const parts = await Promise.all(
    faces
      .filter((f) => usedFamilies.has(f.family.toLowerCase()))
      .filter((f) => rangeNeeded(f.descriptors['unicode-range'], codepoints))
      .map(async (face) => {
        let data: string | null = null;
        for (const url of face.urls) {
          data = await fetchAsDataUrl(url);
          if (data) break;
        }
        if (!data) {
          failed.add(face.family);
          return '';
        }
        const desc = Object.entries(face.descriptors).map(([k, v]) => `${k}:${v};`).join('');
        const family = face.family.replace(/["\\]/g, '');
        return `@font-face{font-family:"${family}";src:url("${data}");${desc}}`;
      }),
  );
  return { css: parts.filter(Boolean).join('\n'), failed: Array.from(failed) };
}

/** Google Fonts CSS2 URL for a family (400/700 + italic 400). */
export function googleFontsHref(family: string): string {
  const fam = encodeURIComponent(family.trim()).replace(/%20/g, '+');
  return `https://fonts.googleapis.com/css2?family=${fam}:ital,wght@0,400;0,700;1,400&display=swap`;
}
