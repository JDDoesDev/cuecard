/**
 * Standalone HTML export.
 *
 * Approach: every element is rendered with the app's real `ElementRenderer`
 * via `react-dom/server` (so Tiptap HTML, markdown, tables, syntax
 * highlighting, h1-h6, line-height/font-family/inline font sizes all match the
 * app), then sanitized and wrapped in the same absolutely-positioned box that
 * `UniversalSlide` produces. The app's live CSS (CSS modules with their hashed
 * class names, global.css, alias variables) is harvested from
 * `document.styleSheets` at export time; the selected theme is embedded from
 * its source file; used fonts are embedded as data URIs. A small inline script
 * handles navigation, fragments, deep links, fullscreen and speaker notes.
 *
 * `html` elements: rendered like the app, in a sandboxed srcdoc iframe
 * (no scripts, opaque origin, so their CSS cannot restyle the deck). Theme
 * variables are passed in and cqw sizes converted to iframe vw units so the
 * content still scales with the slide.
 */

import { createElement } from 'react';
import type { Presentation } from '@/types/presentation';
import type { Slide, SlideElement } from '@/types/slide';
import { ElementRenderer } from '@/components/layouts/ElementRenderer';
import universalStyles from '@/components/layouts/UniversalSlide.module.css';
import slideStyles from '@/components/Slide/Slide.module.css';
import { CODE_FONT_FAMILY } from '@/lib/code/oneDarkTheme';
import { computeTotalFragments } from '@/lib/fragments';
import { embedImagesForExport } from '@/lib/media/imageRestore';
import { escapeHtml, sanitizeRenderedHtml } from '@/lib/security/sanitize';
import { getCustomThemeCss, isCustomThemeId } from '@/lib/theme/themeManager';
import { buildHtmlSrcdoc, frameFontFamilies, type HtmlFrameStyle } from '@/components/layouts/HtmlFrame';
import { buildInlineFontCss, htmlUsesItalic } from '@/lib/fonts/fontInline';
import { pruneCss } from './pruneCss';
import {
  buildEmbeddedFontCss,
  collectDocumentCss,
  googleFontsHref,
  resolveImageSrc,
  resolveVideoSrc,
  type CollectedCss,
} from './exportAssets';
import { SLIDE_SCALE_CQW, buildNoScriptCss, buildRuntimeCss, buildRuntimeScript } from './exportRuntime';
import {
  aspectRatioDims,
  parseYouTubeUrl,
  safeColor,
  safeFontName,
  sanitizeFilename,
  youTubeEmbedUrl,
  type ExportAspectRatio,
} from './exportUtils';

export { sanitizeFilename, parseYouTubeUrl, isSafeColor } from './exportUtils';

export interface ExportProgress {
  stage: 'images' | 'fonts' | 'slides' | 'done';
  done: number;
  total: number;
}

export interface ExportHTMLOptions {
  /** Theme id (built-in or `custom-<slug>`). Defaults to 'default'. */
  theme?: string;
  /** Overrides presentation.aspectRatio. */
  aspectRatio?: ExportAspectRatio;
  /** Fetch remote http(s) images and embed them as data URIs. Default false. */
  embedRemoteImages?: boolean;
  /** Pre-collected app CSS; omit to read document.styleSheets, null to skip. */
  collectedCss?: CollectedCss | null;
  onProgress?: (progress: ExportProgress) => void;
}

const themeSources = import.meta.glob('../../styles/themes/*.css', {
  query: '?raw',
  import: 'default',
}) as Record<string, () => Promise<string>>;

async function loadThemeSource(id: string): Promise<string | null> {
  const key = Object.keys(themeSources).find((k) => k.endsWith(`/${id}.css`));
  return key ? themeSources[key]() : null;
}

/**
 * CSS for the chosen theme. Built-in: its source file (fallback: block
 * harvested from live stylesheets). `custom-<slug>`: the installed custom
 * theme rule. Unknown themes fall back to 'default'.
 */
async function resolveThemeCss(
  theme: string,
  collectedBlocks: Record<string, string> = {},
): Promise<{ id: string; css: string }> {
  const css = isCustomThemeId(theme)
    ? getCustomThemeCss(theme) || collectedBlocks[theme] || ''
    : (await loadThemeSource(theme))?.trim() || collectedBlocks[theme] || '';
  if (css) return { id: theme, css };
  return { id: 'default', css: (await loadThemeSource('default'))?.trim() || collectedBlocks.default || '' };
}

/** CSS custom properties declared in a CSS string (last one wins). */
function parseCssVars(css: string): Record<string, string> {
  const vars: Record<string, string> = {};
  const re = /(--[\w-]+)\s*:\s*([^;{}]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css))) vars[m[1]] = m[2].trim();
  return vars;
}

function fontStackNames(stack: string): string[] {
  return stack
    .split(',')
    .map((part) => part.replace(/["']/g, '').trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Font families actually referenced: theme --font-* values, presentation
 * fonts, per-element fontFamily and inline `font-family:` declarations.
 */
function collectUsedFamilies(themeCss: string, p: Presentation, slides: Slide[]): Set<string> {
  const used = new Set<string>();
  const add = (stack: string | undefined) => stack && fontStackNames(stack).forEach((f) => used.add(f));
  for (const [k, v] of Object.entries(parseCssVars(themeCss))) if (k.startsWith('--font-') && !k.startsWith('--font-size')) add(v);
  add(p.fontHeading);
  add(p.fontBody);
  const inline = (html: string) => {
    const decoded = html.replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'");
    const re = /font-family\s*:\s*([^;}>]+)/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(decoded))) add(m[1]);
  };
  for (const slide of slides) {
    for (const el of slide.elements ?? []) {
      if ('fontFamily' in el) add(el.fontFamily);
      if (el.type === 'code') add(CODE_FONT_FAMILY);
      if (el.type === 'heading' || el.type === 'text') inline(el.content);
      else if (el.type === 'list') el.items.forEach(inline);
      // html elements render in sandboxed iframes with their own pooled fonts
    }
  }
  return used;
}

/** Theme/font variables handed to sandboxed html-element iframes. */
interface FrameContext {
  vars: Record<string, string>;
  /** Lower-case family -> index into the shared iframe font pool */
  fontPool?: Map<string, number>;
}

/** Placeholder in html-element srcdocs replaced by pooled @font-face CSS at runtime. */
export const FRAME_FONTS_MARKER = '/*xfonts*/';
/** Cap for the shared iframe font pool (bytes of CSS). */
const FRAME_FONT_POOL_MAX_BYTES = 6 * 1024 * 1024;

function frameStyle(el: SlideElement & { type: 'html' }, ctx: FrameContext): HtmlFrameStyle {
  const share = Math.max(1, finite(el.position?.width, 100));
  const vars: Record<string, string> = { ...ctx.vars };
  for (const [k, cqw] of Object.entries(SLIDE_SCALE_CQW)) {
    vars[k] = `${Math.round((cqw * 100 / share) * 1000) / 1000}vw`;
  }
  return {
    vars,
    fontFamily: vars['--font-body'] ?? 'sans-serif',
    color: vars['--color-text-primary'] ?? 'inherit',
    fontSize: vars['--font-size-xl'],
    lineHeight: '1.6',
  };
}

/**
 * Sandboxed srcdoc iframe for an `html` element (matches the app's HtmlFrame).
 * Slide-relative cqw sizes are converted to the iframe's own vw units using
 * the element's width share of the slide, so content scales with the deck.
 * Fonts: the srcdoc carries a marker that the runtime replaces with the
 * element's families from the shared data-URI font pool, so each font file is
 * stored once per export. Only families missing from the pool link Google Fonts.
 */
function htmlFrameMarkup(el: SlideElement & { type: 'html' }, ctx: FrameContext): string {
  const style = frameStyle(el, ctx);
  const families = frameFontFamilies(el.htmlContent, style);
  // Pooled families are embedded by the runtime; only the rest link Google Fonts
  const pooled = ctx.fontPool ? families.filter((f) => ctx.fontPool!.has(f.toLowerCase())) : [];
  const poolIds = [...new Set(pooled.map((f) => ctx.fontPool!.get(f.toLowerCase())!))];
  const srcdoc = buildHtmlSrcdoc(el.htmlContent, style, poolIds.length ? { css: FRAME_FONTS_MARKER, inlined: pooled } : undefined);
  return `<iframe sandbox="" srcdoc="${escapeHtml(srcdoc)}" title="Embedded HTML" ` +
    (poolIds.length ? `data-xfonts="${poolIds.join(' ')}" ` : '') +
    'style="width:100%;height:100%;border:0;display:block;pointer-events:none;background:transparent"></iframe>';
}

/**
 * Data-URI @font-face CSS for every family used by html elements, one pool
 * entry per family (shared by all iframes). Families that cannot be inlined
 * or exceed the size cap keep only their Google Fonts link.
 */
async function buildFrameFontPool(
  slides: Slide[],
  ctx: FrameContext,
  faces: CollectedCss['fontFaces'],
): Promise<{ pool: string[]; index: Map<string, number> }> {
  const htmlEls = slides.flatMap((s) => (s.elements ?? []).filter((e): e is SlideElement & { type: 'html' } => e.type === 'html'));
  const families = new Map<string, string>();
  let italic = false;
  let text = '';
  for (const el of htmlEls) {
    for (const f of frameFontFamilies(el.htmlContent, frameStyle(el, ctx))) families.set(f.toLowerCase(), f);
    italic ||= htmlUsesItalic(el.htmlContent);
    text += el.htmlContent;
  }
  const pool: string[] = [];
  const index = new Map<string, number>();
  let bytes = 0;
  for (const family of families.values()) {
    const { css } = await buildInlineFontCss([family], { faces, italic, text, maxBytes: FRAME_FONT_POOL_MAX_BYTES });
    if (!css) continue;
    if (bytes + css.length > FRAME_FONT_POOL_MAX_BYTES) {
      console.warn(`HTML export: font "${family}" not embedded for html elements (size cap reached); it will load from Google Fonts when online`);
      continue;
    }
    bytes += css.length;
    index.set(family.toLowerCase(), pool.length);
    pool.push(css);
  }
  return { pool, index };
}

/**
 * Neutralize content attributes that could collide with the deck runtime:
 * ids get an `xc-` prefix (in-page links/labels rewritten to match) and
 * content-supplied data-fragment attributes are removed.
 */
function isolateContent(root: DocumentFragment): void {
  root.querySelectorAll('[data-fragment]').forEach((n) => n.removeAttribute('data-fragment'));
  root.querySelectorAll('[id]').forEach((n) => n.setAttribute('id', `xc-${n.getAttribute('id')}`));
  root.querySelectorAll('[for]').forEach((n) => n.setAttribute('for', `xc-${n.getAttribute('for')}`));
  root.querySelectorAll('a[href^="#"]').forEach((n) => {
    const target = n.getAttribute('href')!.slice(1);
    if (target) n.setAttribute('href', `#xc-${target}`);
  });
}

function cls(...names: Array<string | undefined>): string {
  return names.filter((n) => typeof n === 'string' && n).join(' ');
}

function styleAttr(decls: Record<string, string | number | undefined>): string {
  return Object.entries(decls)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${k}:${v}`)
    .join(';');
}

const finite = (n: unknown, fallback = 0): number =>
  typeof n === 'number' && Number.isFinite(n) ? n : fallback;

/** Clone an element with untrusted style-ish values normalized. */
function prepareElement(el: SlideElement, imageSrc: string | undefined): SlideElement {
  const copy = { ...el } as SlideElement;
  if ('fontFamily' in copy) copy.fontFamily = safeFontName(copy.fontFamily);
  switch (copy.type) {
    case 'image':
      return { ...copy, url: imageSrc || copy.url, cachedUrl: imageSrc || '' };
    case 'rectangle':
    case 'circle':
      return {
        ...copy,
        fill: safeColor(copy.fill, 'transparent'),
        stroke: safeColor(copy.stroke, '#333'),
        strokeWidth: finite(copy.strokeWidth, 2),
        ...(copy.type === 'rectangle' ? { cornerRadius: finite(copy.cornerRadius, 0) } : {}),
      } as SlideElement;
    case 'line':
      return { ...copy, stroke: safeColor(copy.stroke, '#333'), strokeWidth: finite(copy.strokeWidth, 2) };
    case 'html':
      return { ...copy, htmlContent: '' }; // replaced by a sandboxed iframe after rendering
    default:
      return copy;
  }
}

type RenderToStaticMarkup = (node: React.ReactNode) => string;

function videoMarkup(src: string, ytEmbed: string | null): string {
  if (ytEmbed) {
    return `<iframe data-video src="${escapeHtml(ytEmbed)}" style="width:100%;height:100%;border:0" ` +
      'allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" ' +
      'referrerpolicy="strict-origin-when-cross-origin" allowfullscreen title="Embedded video"></iframe>';
  }
  return src
    ? `<video src="${escapeHtml(src)}" controls playsinline preload="metadata" style="width:100%;height:100%;object-fit:contain"></video>`
    : '';
}

/** Render one element's inner markup (sanitized, fragment-annotated). */
function renderElementInner(
  render: RenderToStaticMarkup,
  el: SlideElement,
  media: { image?: string; video?: string },
  ctx: FrameContext,
): string {
  const tpl = document.createElement('template');

  if (el.type === 'video') {
    const yt = parseYouTubeUrl(el.url);
    tpl.innerHTML = videoMarkup(media.video ?? '', yt ? youTubeEmbedUrl(yt) : null);
    return tpl.innerHTML;
  }

  let markup: string;
  try {
    markup = render(createElement(ElementRenderer, { element: prepareElement(el, media.image), staticExport: true }));
  } catch {
    // Defensive fallback if the live renderer ever needs app context
    const text = 'content' in el ? el.content : el.type === 'list' ? el.items.join('\n') : el.type === 'code' ? el.code : '';
    markup = `<div style="white-space:pre-wrap">${escapeHtml(text)}</div>`;
  }

  switch (el.type) {
    case 'heading':
    case 'text':
    case 'list':
      // Renderer output: its own styles stay; user rich text inside was sanitized at render
      tpl.innerHTML = sanitizeRenderedHtml(markup);
      break;
    case 'html': {
      tpl.innerHTML = markup;
      const box = tpl.content.firstElementChild;
      if (box) box.innerHTML = htmlFrameMarkup(el, ctx);
      else tpl.innerHTML = htmlFrameMarkup(el, ctx);
      break;
    }
    case 'image': {
      tpl.innerHTML = markup;
      const img = tpl.content.querySelector('img');
      if (img) {
        if (media.image) img.setAttribute('src', media.image);
        else img.removeAttribute('src');
        img.setAttribute('alt', el.alt || '');
        img.setAttribute('decoding', 'async');
      }
      break;
    }
    default:
      tpl.innerHTML = markup;
  }

  isolateContent(tpl.content);

  if (el.type === 'list' && el.fragment != null && el.fragmentPerItem && el.items.length) {
    // Top-level items only, clamped to items.length (as computeTotalFragments)
    const listRoot = tpl.content.querySelector('ul,ol');
    const last = el.items.length - 1;
    if (listRoot) {
      Array.from(listRoot.children)
        .filter((li) => li.tagName === 'LI')
        .forEach((li, j) => li.setAttribute('data-fragment', String(el.fragment! + Math.min(j, last))));
    }
  }
  return tpl.innerHTML;
}

function renderElementBox(
  render: RenderToStaticMarkup,
  el: SlideElement,
  idx: number,
  media: { image?: string; video?: string },
  ctx: FrameContext,
): string {
  const pos = el.position ?? { x: 0, y: 0, width: 100, height: 100 };
  const isText = el.type === 'heading' || el.type === 'text' || el.type === 'list';
  const vAlign = isText ? el.verticalAlign : undefined;
  const style = styleAttr({
    left: `${finite(pos.x)}%`,
    top: `${finite(pos.y)}%`,
    width: `${finite(pos.width, 100)}%`,
    [isText ? 'min-height' : 'height']: `${finite(pos.height, 100)}%`,
    'z-index': idx,
    // Lines may have a zero-size box (horizontal/vertical) and draw outside it
    overflow: isText || el.type === 'line' ? 'visible' : 'hidden',
    ...(vAlign === 'middle' || vAlign === 'bottom'
      ? { display: 'flex', 'align-items': vAlign === 'middle' ? 'center' : 'flex-end' }
      : vAlign === 'top' ? { display: 'flex' } : {}),
  });
  const fragAttr = el.fragment != null && Number.isFinite(el.fragment) ? ` data-fragment="${Math.floor(el.fragment)}"` : '';
  return `<div class="${escapeHtml(cls('xel', universalStyles?.element, universalStyles?.fragmentReveal))}" ` +
    `data-element-type="${escapeHtml(el.type)}"${fragAttr} style="${escapeHtml(style)}">` +
    renderElementInner(render, el, media, ctx) +
    '</div>';
}

function slideFontStyle(p: Presentation): string {
  const heading = safeFontName(p.fontHeading);
  const body = safeFontName(p.fontBody);
  return styleAttr({
    '--font-heading': heading ? `'${heading}', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif` : undefined,
    '--font-body': body ? `'${body}', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif` : undefined,
  });
}

function safeStyleText(css: string): string {
  return css.replace(/<\/(style)/gi, '<\\/$1');
}

/**
 * Export a presentation to a single self-contained HTML document.
 * Accepts a theme id string for backwards compatibility.
 */
export async function exportToHTML(
  presentation: Presentation,
  optionsOrTheme: ExportHTMLOptions | string = {},
): Promise<string> {
  const options: ExportHTMLOptions =
    typeof optionsOrTheme === 'string' ? { theme: optionsOrTheme } : optionsOrTheme;
  const requestedTheme = options.theme && /^[\w-]+$/.test(options.theme) ? options.theme : 'default';
  const ratio = aspectRatioDims(options.aspectRatio ?? presentation.aspectRatio);
  const progress = options.onProgress ?? (() => {});
  // Inline uploaded (IndexedDB) images into `url`; drops session blob: cachedUrls
  const source = await embedImagesForExport(presentation);
  const slides: Slide[] = source.slides ?? [];

  // ---- media ----
  const images = slides.flatMap((s) => s.elements.filter((e) => e.type === 'image'));
  const videos = slides.flatMap((s) => s.elements.filter((e) => e.type === 'video'));
  const imageSrc = new Map<string, string>();
  const videoSrc = new Map<string, string>();
  let done = 0;
  const mediaTotal = images.length + videos.length;
  progress({ stage: 'images', done, total: mediaTotal });
  await Promise.all([
    ...images.map(async (el) => {
      imageSrc.set(el.id, await resolveImageSrc(el, !!options.embedRemoteImages));
      progress({ stage: 'images', done: ++done, total: mediaTotal });
    }),
    ...videos.map(async (el) => {
      videoSrc.set(el.id, parseYouTubeUrl(el.url) ? '' : resolveVideoSrc(el.url));
      progress({ stage: 'images', done: ++done, total: mediaTotal });
    }),
  ]);

  // ---- CSS & fonts ----
  progress({ stage: 'fonts', done: 0, total: 1 });
  const collected =
    options.collectedCss === undefined
      ? (typeof document !== 'undefined' ? collectDocumentCss(document) : null)
      : options.collectedCss;
  const { id: theme, css: themeCss } = await resolveThemeCss(requestedTheme, collected?.themeBlocks);
  const slidesJson = JSON.stringify(slides);
  const usedFamilies = collectUsedFamilies(themeCss, presentation, slides);
  const fonts = collected
    ? await buildEmbeddedFontCss(
        collected.fontFaces,
        usedFamilies,
        `${presentation.title ?? ''}${slidesJson}`,
      )
    : { css: '', failed: [] as string[] };
  const fontLinks = new Set<string>(collected?.links ?? []);
  for (const fam of fonts.failed) fontLinks.add(googleFontsHref(fam));
  progress({ stage: 'fonts', done: 1, total: 1 });

  // ---- slides ----
  const { renderToStaticMarkup } = await import('react-dom/server');
  const fontStyle = slideFontStyle(presentation);
  const frameCtx: FrameContext = { vars: { ...parseCssVars(themeCss), ...parseCssVars(fontStyle) } };
  const framePool = await buildFrameFontPool(slides, frameCtx, collected?.fontFaces ?? []);
  frameCtx.fontPool = framePool.index;
  const token = `xdeck-${Math.random().toString(36).slice(2, 10)}`;
  const slideHtml = slides.map((slide, i) => {
    const elements = slide.elements ?? [];
    const inner = elements.length
      ? elements.map((el, idx) =>
          renderElementBox(renderToStaticMarkup, el, idx, { image: imageSrc.get(el.id), video: videoSrc.get(el.id) }, frameCtx),
        ).join('')
      : `<div class="${escapeHtml(cls('xempty', universalStyles?.emptyState))}">Empty Slide</div>`;
    progress({ stage: 'slides', done: i + 1, total: slides.length });
    return `<section class="${escapeHtml(cls('xslide', slideStyles?.slide, i === 0 ? 'active' : undefined))}" ` +
      `data-theme="${escapeHtml(theme)}" data-slide-container data-index="${i}" ` +
      `aria-roledescription="slide" aria-label="Slide ${i + 1} of ${slides.length}"` +
      (fontStyle ? ` style="${escapeHtml(fontStyle)}"` : '') + '>' +
      `<div class="${escapeHtml(cls('xcontainer', universalStyles?.container))}">${inner}</div></section>`;
  });

  const deckData = JSON.stringify({
    fragments: slides.map((s) => computeTotalFragments(s)),
    notes: slides.map((s) => (typeof s.notes === 'string' ? s.notes : '')),
  }).replace(/</g, '\\u003c');

  const title = escapeHtml(presentation.title || 'Presentation');
  const framePoolJson = JSON.stringify(framePool.pool).replace(/</g, '\\u003c');
  const stageMarkup = slideHtml.join('\n');
  const appCss = collected?.css ? pruneCss(collected.css, stageMarkup, { theme, usedFamilies }) : '';
  const links = Array.from(fontLinks)
    .map((href) => `<link rel="stylesheet" href="${escapeHtml(href)}">`)
    .join('\n');

  progress({ stage: 'done', done: slides.length, total: slides.length });

  return `<!DOCTYPE html>
<html lang="en" data-theme="${escapeHtml(theme)}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="generator" content="slide-framework HTML export">
<title>${title}</title>
${links}
<style id="xdeck-app-css">
${safeStyleText(appCss)}
</style>
<style id="xdeck-theme">
${safeStyleText(themeCss)}
</style>
<style id="xdeck-fonts">
${safeStyleText(fonts.css)}
</style>
<style id="xdeck-runtime">
${buildRuntimeCss(ratio)}
</style>
<noscript><style>${buildNoScriptCss(ratio)}</style></noscript>
</head>
<body class="xdeck" data-aspect-ratio="${ratio.w}:${ratio.h}">
<main class="xstage" id="${token}-stage" aria-label="${title}">
${stageMarkup}
</main>
<div class="xui" aria-live="polite"><span id="${token}-counter">${slides.length ? 1 : 0} / ${slides.length}</span></div>
<div class="xnotes" id="${token}-notes" aria-label="Speaker notes"></div>
<script type="application/json" id="${token}-data">${deckData}</script>
${framePool.pool.length ? `<script type="application/json" id="${token}-fonts">${framePoolJson}</script>` : ''}
<script>${buildRuntimeScript(token)}</script>
</body>
</html>`;
}

/**
 * Export to HTML and trigger a browser download. The object URL is revoked
 * after a delay so the download has time to start.
 */
export async function downloadHTML(
  presentation: Presentation,
  optionsOrTheme: ExportHTMLOptions | string = {},
): Promise<void> {
  const html = await exportToHTML(presentation, optionsOrTheme);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${sanitizeFilename(presentation.title)}.html`;
  anchor.rel = 'noopener';
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
