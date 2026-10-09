// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const idb = new Map<string, Blob>();
vi.mock('idb-keyval', () => ({ get: vi.fn(async (k: string) => idb.get(k)) }));

import {
  buildInlineFontCss,
  clearInlineFontCache,
  collectFontFaceSources,
  fontStacksInHtml,
  htmlUsesItalic,
  peekInlineFontCss,
  safeFontDataUrl,
  type FontFaceSource,
} from '../fontInline';

const LATIN = 'U+0000-00FF';
const face = (family: string, weight: string, url: string, extra: Record<string, string> = {}): FontFaceSource => ({
  family,
  descriptors: { 'font-weight': weight, 'font-style': 'normal', 'unicode-range': LATIN, ...extra },
  urls: [url],
});

let fetchSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  clearInlineFontCache();
  idb.clear();
  fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
    const ok = !String(url).includes('broken');
    return { ok, blob: async () => new Blob(['woff2:' + String(url)], { type: 'font/woff2' }) } as unknown as Response;
  });
});
afterEach(() => fetchSpy.mockRestore());

describe('buildInlineFontCss', () => {
  const faces: FontFaceSource[] = [
    face('Inter', '400', 'https://app/inter-latin-400.woff2'),
    face('Inter', '700', 'https://app/inter-latin-700.woff2'),
    face('Inter', '300', 'https://app/inter-latin-300.woff2'),
    face('Inter', '400', 'https://app/inter-latin-400-italic.woff2', { 'font-style': 'italic' }),
    face('Inter', '400', 'https://app/inter-cyrillic-400.woff2', { 'unicode-range': 'U+0400-045F' }),
    face('Oswald', '400', 'https://app/broken.woff2'),
  ];

  it('embeds only latin 400/700 faces as data URIs by default', async () => {
    const out = await buildInlineFontCss(['Inter'], { faces });
    expect(out.inlined).toEqual(['Inter']);
    expect(out.css.match(/@font-face/g)).toHaveLength(2);
    expect(out.css).toContain('font-family:"Inter"');
    expect(out.css).toContain('data:font/woff2;base64,');
    expect(out.css).not.toContain('https://app');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('adds italic and non-latin subsets only when needed', async () => {
    const out = await buildInlineFontCss(['Inter'], { faces, italic: true, text: 'Привет' });
    expect(out.css.match(/@font-face/g)).toHaveLength(4);
    expect(out.css).toContain('font-style:italic');
    expect(out.css).toContain('U+0400-045F');
  });

  it('caches data URIs per face across calls', async () => {
    await buildInlineFontCss(['Inter'], { faces });
    await buildInlineFontCss(['Inter'], { faces, italic: true });
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it('falls back to IndexedDB-cached Google font blobs, then reports failure', async () => {
    idb.set('font:Lobster:regular', new Blob(['ttf'], { type: 'font/ttf' }));
    const out = await buildInlineFontCss(['Lobster', 'Oswald', 'Nope'], { faces });
    expect(out.inlined).toEqual(['Lobster']);
    expect(out.failed).toEqual(['Oswald', 'Nope']);
    expect(out.css).toContain('font-family:"Lobster"');
    expect(out.css).toContain('data:font/ttf;base64,');
    expect(out.css).toContain('font-weight:400');
  });

  it('enforces the size cap', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const out = await buildInlineFontCss(['Inter'], { faces, maxBytes: 10 });
    expect(out.inlined).toEqual([]);
    expect(out.failed).toEqual(['Inter']);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('reads document @font-face rules and memoizes successful results for peek', async () => {
    const style = document.createElement('style');
    style.textContent = `@font-face { font-family: 'Lato'; font-weight: 400; src: url(/assets/lato.woff2) format('woff2'); unicode-range: ${LATIN}; }`;
    document.head.appendChild(style);
    try {
      expect(collectFontFaceSources().some((f) => f.family === 'Lato')).toBe(true);
      expect(peekInlineFontCss(['Lato'])).toBeUndefined();
      const out = await buildInlineFontCss(['Lato']);
      expect(out.inlined).toEqual(['Lato']);
      expect(peekInlineFontCss(['Lato'])).toBe(out);
      expect(peekInlineFontCss([])).toEqual({ css: '', inlined: [], failed: [] });
    } finally {
      style.remove();
    }
  });
});

describe('html scanning', () => {
  it('finds font stacks in style attributes, <style>, <font face> and SVG', () => {
    const stacks = fontStacksInHtml(
      `<style>.a { font-family: "Lobster", cursive; }</style><p style="font-family: 'Pacifico'">x</p>` +
        '<font face="Caveat">y</font><svg><text font-family="Bebas Neue">z</text></svg>',
    );
    expect(stacks).toEqual(expect.arrayContaining(['"Lobster", cursive', "'Pacifico'", 'Caveat', 'Bebas Neue']));
  });

  it('detects italic usage', () => {
    expect(htmlUsesItalic('<em>x</em>')).toBe(true);
    expect(htmlUsesItalic('<p style="font-style: italic">x</p>')).toBe(true);
    expect(htmlUsesItalic('<img src="a"><p>x</p>')).toBe(false);
  });
});

describe('result cache', () => {
  it('keys on selected subsets (not raw text), caches partial results and is LRU-bounded', async () => {
    const style = document.createElement('style');
    style.textContent = `@font-face { font-family: 'Lato'; font-weight: 400; src: url(/assets/lato.woff2) format('woff2'); unicode-range: U+0000-00FF; }`;
    document.head.appendChild(style);
    try {
      const first = await buildInlineFontCss(['Lato', 'Missing'], { text: '日本' });
      expect(first.failed).toEqual(['Missing']);
      // different CJK text selects the same subsets -> same entry, partial result reused
      expect(peekInlineFontCss(['Lato', 'Missing'], { text: '中文😀' })).toBe(first);
      for (let i = 0; i < 25; i++) await buildInlineFontCss(['Lato', `F${i}`]);
      expect(peekInlineFontCss(['Lato', 'Missing'], { text: '日本' })).toBeUndefined();
    } finally {
      style.remove();
    }
  });
});

describe('safeFontDataUrl', () => {
  it('allows font MIME types, normalizes others and rejects non-base64 payloads', () => {
    expect(safeFontDataUrl('data:font/woff2;base64,AAAA')).toBe('data:font/woff2;base64,AAAA');
    expect(safeFontDataUrl('data:application/font-woff;base64,AA==')).toBe('data:application/font-woff;base64,AA==');
    expect(safeFontDataUrl('data:text/html;base64,AAAA')).toBe('data:font/sfnt;base64,AAAA');
    expect(safeFontDataUrl('data:font/woff2;base64,AA")}body{x')).toBeNull();
    expect(safeFontDataUrl('data:font/woff2,plain')).toBeNull();
  });
});
