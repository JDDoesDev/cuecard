// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { HtmlFrame, buildHtmlSrcdoc, frameFontFamilies, type HtmlFrameStyle } from '../HtmlFrame';
import { clearInlineFontCache } from '@/lib/fonts/fontInline';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const style: HtmlFrameStyle = {
  vars: { '--font-body': "'Inter', sans-serif", '--font-heading': "'Oswald', sans-serif", '--font-code': "'Fira Code', monospace" },
  fontFamily: "Inter, sans-serif",
  color: 'rgb(0, 0, 0)',
  fontSize: '16px',
  lineHeight: '1.6',
};

describe('frameFontFamilies', () => {
  it('uses the body font plus heading/code fonts only when referenced, plus fonts named in the HTML', () => {
    expect(frameFontFamilies('<p>x</p>', style)).toEqual(['Inter']);
    expect(frameFontFamilies('<h1 style="font-family: var(--font-heading)">x</h1>', style)).toEqual(['Inter', 'Oswald']);
    expect(frameFontFamilies('<style>p{font-family:"Lobster",cursive}</style><code style="font-family:var(--font-code)">x</code>', style))
      .toEqual(['Inter', 'Fira Code', 'Lobster']);
  });
});

describe('buildHtmlSrcdoc fonts', () => {
  it('links Google Fonts when nothing is inlined', () => {
    const doc = buildHtmlSrcdoc('<p>x</p>', style);
    expect(doc).toContain('fonts.googleapis.com/css2?family=Inter');
    expect(doc).not.toContain('@font-face');
  });

  it('embeds inlined faces and links only the remaining families', () => {
    const css = '@font-face{font-family:"Inter";src:url("data:font/woff2;base64,AAAA");font-weight:400;}';
    const doc = buildHtmlSrcdoc('<p style="font-family: Lobster">x</p>', style, { css, inlined: ['Inter'] });
    expect(doc).toContain(css);
    expect(doc).not.toContain('family=Inter');
    expect(doc).toContain('family=Lobster');
    // CSP still allows data: fonts
    expect(doc).toMatch(/font-src[^;"]*data:/);
  });
});

describe('<HtmlFrame>', () => {
  afterEach(() => {
    clearInlineFontCache();
    vi.restoreAllMocks();
  });

  it('inlines bundled (same-origin) font faces into the iframe srcdoc', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      ({ ok: true, blob: async () => new Blob(['woff2'], { type: 'font/woff2' }) }) as unknown as Response);
    const fontStyle = document.createElement('style');
    fontStyle.textContent = "@font-face { font-family: 'Lato'; font-weight: 400; src: url(/assets/lato-latin-400.woff2) format('woff2'); unicode-range: U+0000-00FF; }";
    document.head.appendChild(fontStyle);
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    try {
      await act(async () => {
        root.render(<HtmlFrame html={'<p style="font-family: Lato">Offline</p>'} />);
      });
      await act(async () => {
        await new Promise((r) => setTimeout(r, 20));
      });
      const srcdoc = host.querySelector('iframe')?.getAttribute('srcdoc') ?? '';
      expect(srcdoc).toContain('font-family:"Lato"');
      expect(srcdoc).toContain('data:font/woff2;base64,');
      expect(srcdoc).not.toContain('family=Lato');
      expect(srcdoc).toContain('<p style="font-family: Lato">Offline</p>');
    } finally {
      act(() => root.unmount());
      host.remove();
      fontStyle.remove();
    }
  });

  it('keeps the iframe mounted across html edits when fonts cannot be inlined', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    try {
      await act(async () => root.render(<HtmlFrame html={'<p style="font-family: Nowhere">a</p>'} />));
      await flush();
      const frame = host.querySelector('iframe');
      expect(frame?.getAttribute('srcdoc')).toContain('family=Nowhere');
      await act(async () => root.render(<HtmlFrame html={'<p style="font-family: Nowhere">ab</p>'} />));
      // same iframe element, already showing the new content
      expect(host.querySelector('iframe')).toBe(frame);
      expect(frame?.getAttribute('srcdoc')).toContain('>ab</p>');
      await flush();
      expect(host.querySelector('iframe')).toBe(frame);
    } finally {
      act(() => root.unmount());
      host.remove();
    }
  });
});
