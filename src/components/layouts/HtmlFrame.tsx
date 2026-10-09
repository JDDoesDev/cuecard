import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { THEME_STYLES_CHANGED_EVENT } from '@/lib/theme/themeManager';
import {
  buildInlineFontCss,
  fontStacksInHtml,
  htmlUsesItalic,
  peekInlineFontCss,
  type InlineFontResult,
} from '@/lib/fonts/fontInline';

// ============================================================================
// Sandboxed HTML element renderer
// ============================================================================
// `html` slide elements contain arbitrary user HTML/CSS. They are rendered in
// an <iframe sandbox=""> (no allow-scripts, no allow-same-origin), so embedded
// markup can never run script or touch the app's origin/storage. The iframe
// fills the element box (width/height 100%), and the srcdoc carries the slide
// theme: computed font-family, color, font-size, line-height and the theme
// CSS variables (with container-relative cqw sizes resolved to px), so the
// content still "inherits" the slide theme. Pointer events are disabled so the
// element stays selectable in the editor and click-to-advance still works.
//
// Semantic note: inside the iframe there is no slide container, so `cqw`
// units in user HTML resolve against the iframe (element box) width, not the
// slide width. The theme's --font-size-* / --space-* vars are pre-resolved to
// px from the slide width, so use those for slide-proportional sizing.
// The srcdoc is rebuilt (iframe reload) only when content, theme or the
// rounded sizes change; resize-driven updates are debounced.
//
// Fonts: the opaque-origin iframe cannot load the app's bundled @fontsource
// files or blob: URLs, so the font faces it needs (slide body font, heading /
// code font when referenced, families named in the HTML) are inlined as
// data: URIs (src/lib/fonts/fontInline.ts). Until they are ready (at most
// FONT_WAIT_MS) and for families that cannot be inlined, Google Fonts links
// are used. Later updates keep the previous fonts until the new ones are
// built. Scaled-down views (thumbnails, previews) skip inlining entirely.

const RESIZE_DEBOUNCE_MS = 150;
const FONT_WAIT_MS = 1000;
/** Slides rendered narrower than this (px) or scaled below COMPACT_SCALE count as thumbnails. */
const COMPACT_WIDTH = 480;
const COMPACT_SCALE = 0.6;

/** True for thumbnail-like contexts (small or transform-scaled slide). */
function isCompactView(el: HTMLElement): boolean {
  const slide = el.closest<HTMLElement>('[data-slide-container]');
  if (!slide) return false;
  const shown = slide.getBoundingClientRect().width;
  if (!shown) return false; // not laid out (hidden / test env)
  return shown < COMPACT_WIDTH || (slide.offsetWidth > 0 && shown < slide.offsetWidth * COMPACT_SCALE);
}

const INHERITED_VARS = [
  '--color-bg-primary', '--color-bg-secondary', '--color-bg-tertiary',
  '--color-text-primary', '--color-text-secondary', '--color-text-tertiary',
  '--color-accent', '--color-accent-hover', '--color-accent-light',
  '--color-code-bg', '--color-code-text', '--color-border', '--color-border-light',
  '--font-heading', '--font-body', '--font-code',
  '--font-size-xs', '--font-size-sm', '--font-size-base', '--font-size-lg', '--font-size-xl',
  '--font-size-2xl', '--font-size-3xl', '--font-size-4xl', '--font-size-5xl',
  '--space-xs', '--space-sm', '--space-md', '--space-lg', '--space-xl', '--space-2xl', '--space-3xl',
  '--radius-sm', '--radius-md', '--radius-lg', '--radius-xl',
];

const GENERIC_FONTS = new Set([
  'serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'ui-sans-serif',
  'ui-serif', 'ui-monospace', '-apple-system', 'blinkmacsystemfont', 'segoe ui',
  'helvetica', 'helvetica neue', 'arial', 'courier new', 'times new roman', 'georgia',
]);

export interface HtmlFrameStyle {
  vars: Record<string, string>;
  fontFamily: string;
  color: string;
  fontSize: string;
  lineHeight: string;
}

/** Strip characters that could break out of a CSS declaration / <style> block. */
function cssValue(value: string): string {
  return value.replace(/[<>{};\\]/g, '').trim();
}

/** Google Fonts families referenced in font stacks (bundled fonts are Google fonts too). */
export function extractWebFontFamilies(stacks: string[]): string[] {
  const families = new Set<string>();
  for (const stack of stacks) {
    for (const part of stack.split(',')) {
      const name = part.trim().replace(/^['"]|['"]$/g, '').trim();
      if (!name || GENERIC_FONTS.has(name.toLowerCase())) continue;
      if (!/^[A-Za-z0-9 -]{1,64}$/.test(name)) continue;
      families.add(name);
    }
  }
  return [...families];
}

/** Web font families an html element renders with: inherited slide fonts + its own CSS. */
export function frameFontFamilies(html: string, style: HtmlFrameStyle): string[] {
  const stacks = [style.fontFamily, style.vars['--font-body'] ?? ''];
  if (html.includes('--font-heading')) stacks.push(style.vars['--font-heading'] ?? '');
  if (html.includes('--font-code')) stacks.push(style.vars['--font-code'] ?? '');
  return extractWebFontFamilies([...stacks, ...fontStacksInHtml(html)]);
}

export interface HtmlFrameFonts {
  /** @font-face CSS (data: URIs) placed before the frame styles */
  css: string;
  /** Families covered by `css`; these are not linked from Google Fonts */
  inlined: string[];
}

export function buildHtmlSrcdoc(html: string, style: HtmlFrameStyle, fonts?: HtmlFrameFonts): string {
  const vars = Object.entries(style.vars)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}: ${cssValue(v)};`)
    .join(' ');
  const inlined = new Set((fonts?.inlined ?? []).map((f) => f.toLowerCase()));
  const fontLinks = frameFontFamilies(html, style)
    .filter((f) => !inlined.has(f.toLowerCase()))
    // Bare family always exists (400 is returned for missing axes, so bold is
    // requested in a separate, optional link).
    .map((f) => {
      const fam = encodeURIComponent(f).replace(/%20/g, '+');
      return `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=${fam}&amp;display=swap">` +
        `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=${fam}:wght@700&amp;display=swap">`;
    })
    .join('');
  const csp = "default-src 'none'; img-src https: data:; media-src https: data:; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com data:";
  return `<!doctype html><html><head><meta charset="utf-8">` +
    `<meta http-equiv="Content-Security-Policy" content="${csp}">` +
    fontLinks +
    (fonts?.css ? `<style>${fonts.css.replace(/<\/style/gi, '')}</style>` : '') +
    `<style>:root { ${vars} } html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; background: transparent; } ` +
    `body { font-family: ${cssValue(style.fontFamily)}; color: ${cssValue(style.color)}; font-size: ${cssValue(style.fontSize)}; line-height: ${cssValue(style.lineHeight)}; }</style>` +
    `</head><body>${html}</body></html>`;
}

function resolveVar(value: string, slideWidth: number): string {
  const m = value.trim().match(/^(-?\d*\.?\d+)cqw$/);
  if (!m || !slideWidth) return value.trim();
  return `${Math.round(parseFloat(m[1]) * slideWidth / 50) / 2}px`; // 0.5px steps
}

function readStyle(el: HTMLElement): HtmlFrameStyle {
  const computed = getComputedStyle(el);
  const slide = el.closest<HTMLElement>('[data-slide-container]');
  // offsetWidth = layout width, unaffected by transform: scale() thumbnails
  const slideWidth = slide?.offsetWidth ?? 0;
  const vars: Record<string, string> = {};
  for (const name of INHERITED_VARS) {
    const value = computed.getPropertyValue(name);
    if (value) vars[name] = resolveVar(value, slideWidth);
  }
  return {
    vars,
    fontFamily: computed.fontFamily,
    color: computed.color,
    fontSize: computed.fontSize,
    lineHeight: computed.lineHeight,
  };
}

interface HtmlFrameProps {
  html: string;
  className?: string;
}

export function HtmlFrame({ html, className }: HtmlFrameProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [frameStyle, setFrameStyle] = useState<HtmlFrameStyle | null>(null);
  const [compact, setCompact] = useState(false);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let lastKey = '';
    const update = () => {
      setCompact(isCompactView(el));
      const next = readStyle(el);
      const key = JSON.stringify(next);
      if (key !== lastKey) {
        lastKey = key;
        setFrameStyle(next);
      }
    };
    update();

    // Re-read when the slide is resized (cqw sizes) or its theme/fonts change
    const slide = el.closest<HTMLElement>('[data-slide-container]') ?? el;
    let timer: number | undefined;
    const schedule = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(update, RESIZE_DEBOUNCE_MS);
    };
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(schedule) : null;
    ro?.observe(slide);
    const mo = typeof MutationObserver !== 'undefined' ? new MutationObserver(schedule) : null;
    mo?.observe(slide, { attributes: true, attributeFilter: ['data-theme', 'style'] });
    // Custom theme stylesheet / customizer preview changes
    window.addEventListener(THEME_STYLES_CHANGED_EVENT, schedule);
    return () => {
      window.clearTimeout(timer);
      ro?.disconnect();
      mo?.disconnect();
      window.removeEventListener(THEME_STYLES_CHANGED_EVENT, schedule);
    };
  }, []);

  // Inline the frame's fonts; render with links if they take too long.
  const fontRequest = useMemo(() => {
    if (!frameStyle || compact) return null;
    const families = frameFontFamilies(html, frameStyle);
    const options = { italic: htmlUsesItalic(html), text: html };
    return { families, options, key: JSON.stringify([families, options]) };
  }, [html, frameStyle, compact]);
  const peeked = fontRequest ? peekInlineFontCss(fontRequest.families, fontRequest.options) : undefined;
  const [loaded, setLoaded] = useState<{ key: string; fonts: InlineFontResult | null } | null>(null);

  useEffect(() => {
    if (!fontRequest || peeked) return;
    const { key, families, options } = fontRequest;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (!cancelled) setLoaded((prev) => prev ?? { key, fonts: null });
    }, FONT_WAIT_MS);
    buildInlineFontCss(families, options)
      .catch(() => null)
      .then((fonts) => {
        if (!cancelled) setLoaded((prev) => ({ key, fonts: fonts ?? prev?.fonts ?? null }));
      })
      .finally(() => window.clearTimeout(timer));
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [fontRequest, peeked]);

  // Until fonts for the current request arrive, reuse the previous ones (no
  // blank frame while editing); only the very first render waits.
  const fontsReady = !fontRequest || !!peeked || loaded != null;
  const fonts = (fontRequest ? peeked ?? loaded?.fonts : null) ?? undefined;
  const srcdoc = useMemo(
    () => (frameStyle && fontsReady ? buildHtmlSrcdoc(html, frameStyle, fonts) : null),
    [html, frameStyle, fontsReady, fonts],
  );

  return (
    <div ref={containerRef} className={className}>
      {srcdoc != null && (
        <iframe
          sandbox=""
          srcDoc={srcdoc}
          title="Embedded HTML"
          loading="lazy"
          style={{ width: '100%', height: '100%', border: 0, display: 'block', pointerEvents: 'none', background: 'transparent' }}
        />
      )}
    </div>
  );
}
