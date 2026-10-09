import { useLayoutEffect, useRef, useState } from 'react';
import { THEME_STYLES_CHANGED_EVENT } from '@/lib/theme/themeManager';

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

const RESIZE_DEBOUNCE_MS = 150;

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

export function buildHtmlSrcdoc(html: string, style: HtmlFrameStyle): string {
  const vars = Object.entries(style.vars)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}: ${cssValue(v)};`)
    .join(' ');
  const fontLinks = extractWebFontFamilies([style.fontFamily, style.vars['--font-heading'] ?? '', style.vars['--font-body'] ?? ''])
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

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let lastKey = '';
    const update = () => {
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

  return (
    <div ref={containerRef} className={className}>
      {frameStyle && (
        <iframe
          sandbox=""
          srcDoc={buildHtmlSrcdoc(html, frameStyle)}
          title="Embedded HTML"
          loading="lazy"
          style={{ width: '100%', height: '100%', border: 0, display: 'block', pointerEvents: 'none', background: 'transparent' }}
        />
      )}
    </div>
  );
}
