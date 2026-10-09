// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Presentation } from '@/types/presentation';
import type { SlideElement, Slide } from '@/types/slide';

vi.mock('@/lib/media/imageCaching', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/media/imageCaching')>()),
  getCachedImageBlob: vi.fn(async (key: string) =>
    key === 'image:abc' ? new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' }) : undefined,
  ),
}));

import fs from 'node:fs';
import path from 'node:path';
import { exportToHTML, downloadHTML } from '../exportToHTML';
import { collectDocumentCss, buildEmbeddedFontCss, type CollectedFontFace } from '../exportAssets';
import { sanitizeFilename, parseYouTubeUrl, isSafeColor, aspectRatioDims } from '../exportUtils';

const pos = { x: 10, y: 10, width: 50, height: 20 };

function deck(elements: SlideElement[], extra: Partial<Presentation> = {}, slideExtra: Partial<Slide> = {}): Presentation {
  return {
    title: 'Deck',
    slides: [{ id: 's1', layout: 'freestyle', transition: 'none', elements, ...slideExtra }],
    ...extra,
  } as Presentation;
}

function parse(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}

function deckData(doc: Document) {
  return JSON.parse(doc.querySelector('script[type="application/json"]')!.textContent!);
}

const opts = { collectedCss: null } as const;

// Vitest stubs CSS imports (incl. ?raw), so feed the real theme files through
// the harvested-stylesheet fallback path the exporter also supports.
const themeDir = path.resolve(__dirname, '../../../styles/themes');
const themeBlocks = Object.fromEntries(
  fs.readdirSync(themeDir).map((f) => [f.replace(/\.css$/, ''), fs.readFileSync(path.join(themeDir, f), 'utf8')]),
);
const themeOpts = { collectedCss: { css: '', fontFaces: [], links: [], themeBlocks } };

const allElements: SlideElement[] = [
  { id: 'h', type: 'heading', position: pos, content: 'Title', level: 4 },
  { id: 't', type: 'text', position: pos, content: 'Hello **bold**' },
  { id: 'l', type: 'list', position: pos, items: ['one', 'two'], ordered: false },
  { id: 'c', type: 'code', position: pos, code: 'const a = 1;\nconst b = 2;', language: 'javascript', highlightLines: [2] },
  { id: 'i', type: 'image', position: pos, url: 'https://example.com/a.png' },
  { id: 'v', type: 'video', position: pos, url: 'https://youtu.be/dQw4w9WgXcQ?t=42' },
  { id: 'r', type: 'rectangle', position: pos, fill: '#ff0000' },
  { id: 'ci', type: 'circle', position: pos, fill: 'blue' },
  { id: 'li', type: 'line', position: pos, stroke: '#000' },
  { id: 'x', type: 'html', position: pos, htmlContent: '<div class="custom">Embedded <b>HTML</b></div>' },
];

describe('exportToHTML', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders every element type (no "Unknown element type")', async () => {
    const html = await exportToHTML(deck(allElements), opts);
    expect(html).not.toContain('Unknown element type');
    const doc = parse(html);
    const types = Array.from(doc.querySelectorAll('.xel')).map((e) => e.getAttribute('data-element-type'));
    expect(types).toEqual(allElements.map((e) => e.type));
    expect(doc.querySelector('h4')?.textContent).toBe('Title');
    expect(doc.querySelector('[data-element-type=text] strong')?.textContent).toBe('bold');
    expect(doc.querySelectorAll('[data-element-type=list] li')).toHaveLength(2);
    const frame = doc.querySelector('[data-element-type=html] iframe')!;
    expect(frame.getAttribute('sandbox')).toBe('');
    expect(frame.getAttribute('srcdoc')).toContain('<div class="custom">Embedded <b>HTML</b></div>');
    expect(doc.querySelector('[data-element-type=rectangle] rect')?.getAttribute('fill')).toBe('#ff0000');
    expect(doc.querySelector('[data-element-type=circle] ellipse')).not.toBeNull();
    expect(doc.querySelector('[data-element-type=line] line')).not.toBeNull();
    // syntax highlighting produces token spans with inline colors
    expect(doc.querySelectorAll('[data-element-type=code] span[style]').length).toBeGreaterThan(1);
    const iframe = doc.querySelector('[data-element-type=video] iframe');
    expect(iframe?.getAttribute('src')).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=42');
  });

  it('renders Tiptap HTML content as markup, not literal text', async () => {
    const html = await exportToHTML(
      deck([{ id: 't', type: 'text', position: pos, content: '<p><strong>Bold</strong> text</p>' }]),
      opts,
    );
    const doc = parse(html);
    expect(doc.querySelector('[data-element-type=text] p strong')?.textContent).toBe('Bold');
    expect(html).not.toContain('&lt;p&gt;');
  });

  it('text uses min-height (no clipping) while media uses height', async () => {
    const doc = parse(await exportToHTML(deck(allElements), opts));
    const text = doc.querySelector<HTMLElement>('[data-element-type=text]')!;
    expect(text.getAttribute('style')).toContain('min-height:20%');
    expect(text.getAttribute('style')).toContain('overflow:visible');
    const img = doc.querySelector<HTMLElement>('[data-element-type=image]')!;
    expect(img.getAttribute('style')).toMatch(/(^|;)height:20%/);
  });

  it('preserves per-element fontFamily, lineHeight and verticalAlign', async () => {
    const doc = parse(
      await exportToHTML(
        deck(
          [{ id: 't', type: 'text', position: pos, content: 'x', fontFamily: 'Lato', lineHeight: 2, verticalAlign: 'middle' }],
          { fontHeading: 'Oswald' },
        ),
        opts,
      ),
    );
    const box = doc.querySelector<HTMLElement>('[data-element-type=text]')!;
    expect(box.getAttribute('style')).toContain('align-items:center');
    const inner = box.firstElementChild as HTMLElement;
    expect(inner.getAttribute('style')).toContain('Lato');
    expect(inner.getAttribute('style')).toContain('line-height');
    expect(doc.querySelector('.xslide')?.getAttribute('style')).toContain("--font-heading:'Oswald'");
  });

  describe('XSS', () => {
    it('escapes quote breakout in image and video URLs', async () => {
      const evil = 'x" onerror="alert(1)';
      const html = await exportToHTML(
        deck([
          { id: 'i', type: 'image', position: pos, url: `https://e.com/${evil}`, alt: evil },
          { id: 'v', type: 'video', position: pos, url: `https://e.com/v.mp4${evil}` },
        ]),
        opts,
      );
      const doc = parse(html);
      expect(doc.querySelectorAll('[onerror]')).toHaveLength(0);
      expect(doc.querySelector('img')?.getAttribute('alt')).toBe(evil);
    });

    it('drops javascript: URLs', async () => {
      const doc = parse(
        await exportToHTML(deck([{ id: 'v', type: 'video', position: pos, url: 'javascript:alert(1)' }]), opts),
      );
      expect(doc.body.innerHTML).not.toContain('javascript:');
    });

    it('sanitizes text, list and html content', async () => {
      const html = await exportToHTML(
        deck([
          { id: 't', type: 'text', position: pos, content: '<img src=x onerror="alert(1)"><p>hi</p>' },
          { id: 'l', type: 'list', position: pos, items: ['<a href="javascript:alert(1)">x</a>'], ordered: true },
          { id: 'x', type: 'html', position: pos, htmlContent: '<script>alert(1)</script></div></div></section><b onclick="x()">ok</b>' },
          { id: 'h', type: 'heading', position: pos, level: 1, content: '<svg onload="alert(1)">' },
        ]),
        opts,
      );
      const doc = parse(html);
      const slides = doc.querySelectorAll('.xslide');
      expect(slides).toHaveLength(1);
      expect(slides[0].querySelectorAll('.xel')).toHaveLength(4);
      expect(doc.querySelectorAll('[onerror],[onclick],[onload]')).toHaveLength(0);
      expect(doc.body.innerHTML).not.toContain('javascript:alert');
      // only the deck's own two scripts remain
      expect(doc.querySelectorAll('script')).toHaveLength(2);
    });

    it('rejects unsafe shape colors', async () => {
      const html = await exportToHTML(
        deck([
          { id: 'r', type: 'rectangle', position: pos, fill: '" /><script>alert(1)</script>', stroke: 'url(javascript:x)' },
        ]),
        opts,
      );
      const doc = parse(html);
      const rect = doc.querySelector('rect')!;
      expect(rect.getAttribute('fill')).toBe('transparent');
      expect(rect.getAttribute('stroke')).toBe('#333');
      expect(doc.querySelectorAll('script')).toHaveLength(2);
    });

    it('escapes the title and notes', async () => {
      const html = await exportToHTML(
        deck([], { title: '</title><script>alert(1)</script>' }, { notes: '</script><script>alert(2)</script>' }),
        opts,
      );
      const doc = parse(html);
      expect(doc.title).toBe('</title><script>alert(1)</script>');
      expect(doc.querySelectorAll('script')).toHaveLength(2);
      const data = deckData(doc);
      expect(data.notes[0]).toBe('</script><script>alert(2)</script>');
    });
  });

  describe('themes', () => {
    it('has all 18 built-in themes available', () => {
      expect(Object.keys(themeBlocks)).toHaveLength(18);
    });

    it('embeds the selected built-in theme only', async () => {
      const html = await exportToHTML(deck([]), { ...themeOpts, theme: 'split-teal' });
      const doc = parse(html);
      expect(doc.documentElement.getAttribute('data-theme')).toBe('split-teal');
      expect(doc.querySelector('.xslide')?.getAttribute('data-theme')).toBe('split-teal');
      const themeCss = doc.getElementById('xdeck-theme')!.textContent!;
      expect(themeCss).toContain("[data-theme='split-teal']");
      expect(themeCss).toContain('--slide-bg: linear-gradient');
      expect(themeCss).not.toContain("[data-theme='aurora']");
      expect(doc.getElementById('xdeck-runtime')!.textContent).toContain('var(--slide-bg,var(--color-bg-primary))');
    });

    it.each(['default', 'dark', 'aurora', 'cyber-grid', 'synthwave', 'split-sage'])('supports %s', async (theme) => {
      const doc = parse(await exportToHTML(deck([]), { ...themeOpts, theme }));
      expect(doc.getElementById('xdeck-theme')!.textContent).toContain(`[data-theme='${theme}']`);
    });

    it('embeds installed custom-<slug> themes via getCustomThemeCss', async () => {
      const style = document.createElement('style');
      style.id = 'cuecard-custom-themes';
      style.textContent = "[data-theme='custom-brand'] {\n  --color-accent: #123456;\n  --slide-bg: linear-gradient(90deg, #000 50%, #fff 50%);\n}";
      document.head.appendChild(style);
      try {
        const doc = parse(await exportToHTML(deck([]), { ...opts, theme: 'custom-brand' }));
        expect(doc.documentElement.getAttribute('data-theme')).toBe('custom-brand');
        expect(doc.querySelector('.xslide')?.getAttribute('data-theme')).toBe('custom-brand');
        const css = doc.getElementById('xdeck-theme')!.textContent!;
        expect(css).toContain("[data-theme='custom-brand']");
        expect(css).toContain('--color-accent: #123456');
      } finally {
        style.remove();
      }
    });

    it('falls back to default when a custom theme is not installed', async () => {
      const doc = parse(await exportToHTML(deck([]), { ...themeOpts, theme: 'custom-missing' }));
      expect(doc.documentElement.getAttribute('data-theme')).toBe('default');
      expect(doc.getElementById('xdeck-theme')!.textContent).toContain("[data-theme='default']");
    });

    it('falls back to default for unknown/invalid themes', async () => {
      const doc = parse(await exportToHTML(deck([]), { ...themeOpts, theme: '"><script>' }));
      expect(doc.documentElement.getAttribute('data-theme')).toBe('default');
    });
  });

  describe('fragments', () => {
    it('annotates fragment elements and per-item list fragments', async () => {
      const html = await exportToHTML(
        deck([
          { id: 'h', type: 'heading', position: pos, content: 'T', level: 1 },
          { id: 't', type: 'text', position: pos, content: 'a', fragment: 1 },
          { id: 'l', type: 'list', position: pos, items: ['a', 'b', 'c'], ordered: false, fragment: 2, fragmentPerItem: true },
        ]),
        opts,
      );
      const doc = parse(html);
      const boxes = doc.querySelectorAll('.xel');
      expect(boxes[0].hasAttribute('data-fragment')).toBe(false);
      expect(boxes[1].getAttribute('data-fragment')).toBe('1');
      expect(boxes[2].getAttribute('data-fragment')).toBe('2');
      const items = Array.from(boxes[2].querySelectorAll('li')).map((li) => li.getAttribute('data-fragment'));
      expect(items).toEqual(['2', '3', '4']);
      const data = deckData(doc);
      expect(data.fragments).toEqual([4]);
    });
  });

  describe('aspect ratio', () => {
    it.each([
      [undefined, '16:9', 'calc(100vh * 16 / 9)'],
      ['4:3', '4:3', 'calc(100vh * 4 / 3)'],
      ['16:10', '16:10', 'calc(100vh * 16 / 10)'],
    ] as const)('uses presentation.aspectRatio %s', async (ratio, label, expr) => {
      const html = await exportToHTML(deck([], { aspectRatio: ratio }), opts);
      expect(html).toContain(`data-aspect-ratio="${label}"`);
      expect(html).toContain(expr);
    });

    it('maps ratios to dimensions', () => {
      expect(aspectRatioDims('4:3')).toEqual({ w: 4, h: 3 });
      expect(aspectRatioDims(undefined)).toEqual({ w: 16, h: 9 });
    });
  });

  describe('images', () => {
    it('embeds cached uploads as data URIs instead of the filename', async () => {
      const doc = parse(
        await exportToHTML(
          deck([{ id: 'i', type: 'image', position: pos, url: 'photo.png', cacheKey: 'image:abc', cachedUrl: 'blob:xyz' }]),
          opts,
        ),
      );
      expect(doc.querySelector('img')?.getAttribute('src')).toMatch(/^data:image\/png;base64,/);
    });

    it('never uses a session blob: cachedUrl', async () => {
      const html = await exportToHTML(
        deck([{ id: 'i', type: 'image', position: pos, url: 'https://example.com/a.png', cachedUrl: 'blob:http://x/1' }]),
        opts,
      );
      expect(html).not.toContain('blob:');
      expect(parse(html).querySelector('img')?.getAttribute('src')).toBe('https://example.com/a.png');
    });

    it('links remote images when embedding is off', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      const doc = parse(
        await exportToHTML(deck([{ id: 'i', type: 'image', position: pos, url: 'https://example.com/a.png' }]), opts),
      );
      expect(doc.querySelector('img')?.getAttribute('src')).toBe('https://example.com/a.png');
      expect(fetchSpy).not.toHaveBeenCalled();
      fetchSpy.mockRestore();
    });
  });

  it('includes runtime navigation (keys, hash, swipe, interactive-target guard)', async () => {
    const html = await exportToHTML(deck([]), opts);
    for (const token of ["'PageDown'", "'Home'", "'End'", "case 'f'", "case 'n'", 'hashchange', 'touchstart', 'closest(INTERACTIVE)']) {
      expect(html).toContain(token);
    }
  });

  it('still accepts a theme string (backwards compatible signature)', async () => {
    const style = document.createElement('style');
    style.textContent = "[data-theme='dark'] { --color-bg-primary: #1a1a2e; }";
    document.head.appendChild(style);
    try {
      const doc = parse(await exportToHTML(deck([]), 'dark'));
      expect(doc.documentElement.getAttribute('data-theme')).toBe('dark');
    } finally {
      style.remove();
    }
  });
});

describe('downloadHTML', () => {
  it('sanitizes the filename and defers revokeObjectURL', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    const create = vi.fn(() => 'blob:mock');
    const revoke = vi.fn();
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke });
    let downloaded = '';
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      downloaded = this.download;
    });
    await downloadHTML(deck([], { title: 'a/b\\c:d*?"<>|e' }), { collectedCss: null });
    expect(downloaded).toBe('abcde.html');
    expect(revoke).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2000);
    expect(revoke).toHaveBeenCalledWith('blob:mock');
    clickSpy.mockRestore();
    vi.useRealTimers();
  });
});

describe('collectDocumentCss', () => {
  it('splits theme blocks and font faces from other rules', () => {
    const style = document.createElement('style');
    style.textContent = `
      [data-theme='aurora'] { --color-accent: #abcdef; }
      .foo_abc { color: red; }
      @font-face { font-family: 'Inter'; src: url(/assets/inter.woff2) format('woff2'); font-weight: 400; }
    `;
    document.head.appendChild(style);
    const out = collectDocumentCss(document);
    style.remove();
    expect(out.css).toContain('.foo_abc');
    expect(out.css).not.toContain('#abcdef');
    expect(out.themeBlocks?.aurora).toContain('#abcdef');
    expect(out.fontFaces).toHaveLength(1);
    expect(out.fontFaces[0].family).toBe('Inter');
    expect(out.fontFaces[0].urls[0]).toMatch(/\/assets\/inter\.woff2$/);
  });
});

describe('buildEmbeddedFontCss', () => {
  it('embeds only used families and needed unicode ranges; reports failures', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      const ok = !String(url).includes('broken');
      return { ok, blob: async () => new Blob(['woff2'], { type: 'font/woff2' }) } as unknown as Response;
    });
    const faces: CollectedFontFace[] = [
      { family: 'Inter', descriptors: { 'unicode-range': 'U+0000-00FF' }, urls: ['https://a/inter-latin.woff2'] },
      { family: 'Inter', descriptors: { 'unicode-range': 'U+0400-045F' }, urls: ['https://a/inter-cyrillic.woff2'] },
      { family: 'Lato', descriptors: {}, urls: ['https://a/lato.woff2'] },
      { family: 'Oswald', descriptors: {}, urls: ['https://a/broken.woff2'] },
    ];
    const out = await buildEmbeddedFontCss(faces, new Set(['inter', 'oswald']), 'hello');
    expect(out.css.match(/@font-face/g)).toHaveLength(1);
    expect(out.css).toContain('font-family:"Inter"');
    expect(out.css).toContain('data:font/woff2;base64,');
    expect(out.css).not.toContain('Lato');
    expect(out.failed).toEqual(['Oswald']);
    fetchSpy.mockRestore();
  });
});

describe('export utils', () => {
  it('sanitizeFilename', () => {
    expect(sanitizeFilename('My Talk: 2024/25?')).toBe('My Talk 202425');
    expect(sanitizeFilename('  ..  ')).toBe('presentation');
    expect(sanitizeFilename('a\u0000b\u001fc')).toBe('abc');
    expect(sanitizeFilename(undefined)).toBe('presentation');
    expect(sanitizeFilename('***')).toBe('presentation');
  });

  it('parseYouTubeUrl', () => {
    expect(parseYouTubeUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1m5s')).toEqual({ id: 'dQw4w9WgXcQ', start: 65 });
    expect(parseYouTubeUrl('https://youtu.be/dQw4w9WgXcQ')).toEqual({ id: 'dQw4w9WgXcQ' });
    expect(parseYouTubeUrl('https://youtube.com/shorts/dQw4w9WgXcQ')).toEqual({ id: 'dQw4w9WgXcQ' });
    expect(parseYouTubeUrl('https://www.youtube.com/live/dQw4w9WgXcQ?si=abc')).toEqual({ id: 'dQw4w9WgXcQ' });
    expect(parseYouTubeUrl('https://www.youtube.com/embed/dQw4w9WgXcQ?start=10')).toEqual({ id: 'dQw4w9WgXcQ', start: 10 });
    expect(parseYouTubeUrl('https://evil.com/youtube.com/watch?v=dQw4w9WgXcQ')).toBeNull();
    expect(parseYouTubeUrl('https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ')).toBeNull();
    expect(parseYouTubeUrl('https://www.youtube.com/watch?v="><script>')).toBeNull();
  });

  it('isSafeColor', () => {
    for (const ok of ['#fff', '#ff000080', 'red', 'transparent', 'rgb(0, 0, 0)', 'rgba(0,0,0,.5)', 'hsl(10 20% 30%)', 'var(--color-accent)']) {
      expect(isSafeColor(ok)).toBe(true);
    }
    for (const bad of ['url(javascript:x)', 'red;}', '"', 'expression(alert(1))', '', '#ggg']) {
      expect(isSafeColor(bad)).toBe(false);
    }
  });
});

describe('review fixes', () => {
  /** Mount the exported body in the test document and execute its runtime script. */
  function runDeck(html: string, hash = '') {
    const parsed = parse(html);
    history.replaceState(null, '', `/${hash}`);
    document.body.innerHTML = parsed.body.innerHTML;
    const runtime = Array.from(parsed.querySelectorAll('script')).find((sc) => !sc.type)!;
    new Function(runtime.textContent!)();
    return document;
  }

  const fragDeck = () =>
    deck(
      [
        { id: 'h', type: 'heading', position: pos, content: 'T', level: 1 },
        { id: 't', type: 'text', position: pos, content: 'later', fragment: 1 },
      ],
      {},
      { notes: 'Speaker note' },
    );

  it('renders on init even when loaded at #1 (fragments hidden, notes/aria set)', async () => {
    const doc = runDeck(await exportToHTML(fragDeck(), opts), '#1');
    const box = doc.querySelector('[data-element-type=text]')!;
    expect(box.classList.contains('xf-hidden')).toBe(true);
    expect(doc.querySelector('section.xslide')!.getAttribute('aria-hidden')).toBe('false');
    expect(doc.querySelector('.xnotes')!.textContent).toBe('Speaker note');
  });

  it('content ids cannot hijack runtime lookups', async () => {
    const html = await exportToHTML(
      deck([
        {
          id: 'x',
          type: 'text',
          position: pos,
          content: '<p id="xdeck-data">{"fragments":[9]}</p><span id="xcounter">c</span><a href="#xnotes">n</a>',
          fragment: 1,
        },
        { id: 'l', type: 'list', position: pos, items: ['<span data-fragment="0">x</span>'], ordered: false },
      ]),
      opts,
    );
    const parsed = parse(html);
    expect(parsed.getElementById('xdeck-data')).toBeNull();
    expect(parsed.getElementById('xc-xdeck-data')).not.toBeNull();
    expect(parsed.querySelector('a[href="#xc-xnotes"]')).not.toBeNull();
    expect(parsed.querySelectorAll('[data-element-type=list] [data-fragment]')).toHaveLength(0);
    const doc = runDeck(html);
    expect(doc.querySelector('.xui span')!.textContent).toBe('1 / 1');
    expect(doc.querySelector('[data-element-type=text]')!.classList.contains('xf-hidden')).toBe(true);
  });

  it('html elements are isolated in a sandboxed iframe (their CSS cannot restyle the deck)', async () => {
    const html = await exportToHTML(
      deck([{ id: 'x', type: 'html', position: { ...pos, width: 50 }, htmlContent: '<style>body{display:none}*{position:fixed}</style><p>hi</p>' }]),
      { ...themeOpts, theme: 'dark' },
    );
    const doc = parse(html);
    const styles = Array.from(doc.querySelectorAll('style')).map((st) => st.textContent).join('');
    expect(styles).not.toContain('display:none}*{position:fixed');
    const frame = doc.querySelector('[data-element-type=html] iframe')!;
    expect(frame.getAttribute('sandbox')).toBe('');
    const srcdoc = frame.getAttribute('srcdoc')!;
    expect(srcdoc).toContain('<style>body{display:none}');
    // slide cqw sizes converted for a 50%-wide element: 2.6cqw -> 5.2vw
    expect(srcdoc).toContain('--font-size-xl: 5.2vw');
    // theme variables passed in
    expect(srcdoc).toMatch(/--color-text-primary: #/);
  });

  it('per-item fragments are clamped to top-level items.length', async () => {
    const doc = parse(
      await exportToHTML(
        deck([{ id: 'l', type: 'list', position: pos, items: ['a</li><li>b', 'c'], ordered: false, fragment: 1, fragmentPerItem: true }]),
        opts,
      ),
    );
    const frags = Array.from(doc.querySelectorAll('[data-element-type=list] li[data-fragment]')).map((li) => Number(li.getAttribute('data-fragment')));
    expect(Math.max(...frags)).toBe(deckData(doc).fragments[0]);
  });

  it('detects fonts by family usage, not substrings of slide text', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(
      async () => ({ ok: true, blob: async () => new Blob(['f'], { type: 'font/woff2' }) }) as unknown as Response,
    );
    const faces: CollectedFontFace[] = ['Lato', 'Oswald', 'Merriweather', 'Poppins'].map((family) => ({
      family,
      descriptors: {},
      urls: [`https://a/${family}.woff2`],
    }));
    const html = await exportToHTML(
      deck(
        [
          { id: 't', type: 'text', position: pos, content: 'A translator from Oswald street', fontFamily: 'Merriweather' },
          { id: 'u', type: 'text', position: pos, content: '<p><span style="font-family: &quot;Poppins&quot;, sans-serif">x</span></p>' },
        ],
      ),
      { collectedCss: { css: '', fontFaces: faces, links: [], themeBlocks: {} } },
    );
    const fontCss = parse(html).getElementById('xdeck-fonts')!.textContent!;
    expect(fontCss).toContain('"Merriweather"');
    expect(fontCss).toContain('"Poppins"');
    expect(fontCss).not.toContain('"Lato"');
    expect(fontCss).not.toContain('"Oswald"');
    fetchSpy.mockRestore();
  });
});
