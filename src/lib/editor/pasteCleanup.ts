import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { getAvailableFonts } from '@/lib/fonts/availableFonts';
import { fontFamilyCss, fontFamilyName } from './fontFamily';
import { isAllowedLinkHref } from './links';
import { filterInlineStyle, isSafeCssColor } from '@/lib/security/inlineStyle';

/**
 * Paste cleanup for HTML from Microsoft Word, Google Docs and web pages.
 *
 * Keeps document structure the slide editor can represent (paragraphs, links,
 * lists, tables, bold/italic/underline/strike/sub/sup, non-default text and
 * highlight colors, fonts available in the app) and drops everything else:
 * Office markup (mso-* styles, <o:p>, Mso classes, conditional comments,
 * <font>), font sizes, margins/padding/positioning, classes/ids, images and
 * other embedded media (text elements cannot hold images).
 *
 * Headings become bold paragraphs: slide headings are separate elements, and a
 * heading inside a text box would not match the theme's text styles.
 * Plain-text pastes never reach this code (ProseMirror only calls
 * transformPastedHTML for HTML clipboard data).
 */

export interface PasteCleanupOptions {
  /** Font families that may be kept from pasted inline styles (case-insensitive). */
  availableFonts?: string[];
}

const DROP_TAGS = new Set([
  'SCRIPT', 'STYLE', 'META', 'LINK', 'TITLE', 'HEAD', 'XML', 'IMG', 'PICTURE', 'SVG', 'VIDEO', 'AUDIO',
  'IFRAME', 'OBJECT', 'EMBED', 'CANVAS', 'FORM', 'INPUT', 'BUTTON', 'SELECT', 'TEXTAREA', 'NOSCRIPT',
  'TEMPLATE', 'MAP', 'AREA', 'SOURCE', 'TRACK', 'HR',
]);

/** Elements kept as-is (attributes are filtered). Anything else is unwrapped. */
const KEEP_TAGS = new Set([
  'P', 'BR', 'A', 'STRONG', 'B', 'EM', 'I', 'U', 'S', 'DEL', 'STRIKE', 'SUB', 'SUP', 'CODE', 'MARK', 'SPAN',
  'UL', 'OL', 'LI', 'TABLE', 'THEAD', 'TBODY', 'TFOOT', 'TR', 'TH', 'TD', 'BLOCKQUOTE', 'PRE',
]);

const BLOCK_TAGS = new Set([
  'P', 'DIV', 'UL', 'OL', 'LI', 'TABLE', 'BLOCKQUOTE', 'PRE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
  'SECTION', 'ARTICLE', 'HEADER', 'FOOTER', 'MAIN', 'ASIDE', 'NAV', 'FIGURE', 'DL', 'ADDRESS',
]);

const DEFAULT_COLORS = new Set([
  'black', 'white', 'windowtext', 'window', 'auto', 'transparent', 'inherit', 'initial', 'currentcolor',
  '#000', '#000000', '#fff', '#ffffff', 'rgb(0, 0, 0)', 'rgb(255, 255, 255)', 'rgba(0, 0, 0, 0)',
]);

function isDefaultColor(value: string): boolean {
  return DEFAULT_COLORS.has(value.trim().toLowerCase().replace(/\s*!important$/, '').replace(/,\s*/g, ', '));
}

/** Parse an inline style attribute into lowercase property -> value (no CSSOM: keeps mso-* props). */
function parseStyle(style: string | null): Map<string, string> {
  const map = new Map<string, string>();
  if (!style) return map;
  for (const decl of style.split(';')) {
    const i = decl.indexOf(':');
    if (i < 0) continue;
    const prop = decl.slice(0, i).trim().toLowerCase();
    const value = decl.slice(i + 1).trim();
    if (prop && value) map.set(prop, value);
  }
  return map;
}

function unwrap(el: Element): void {
  el.replaceWith(...Array.from(el.childNodes));
}

function rename(el: Element, tag: string): HTMLElement {
  const next = el.ownerDocument.createElement(tag);
  next.append(...Array.from(el.childNodes));
  el.replaceWith(next);
  return next;
}

function isWordHtml(html: string): boolean {
  return /urn:schemas-microsoft-com:office|class="?Mso|mso-[a-z-]+\s*:/i.test(html);
}

// ============================================================================
// Word lists: <p class=MsoListParagraph style="mso-list:l0 level2 lfo1"> runs
// ============================================================================

interface WordListItem {
  el: HTMLElement;
  level: number;
  ordered: boolean;
}

/** Text of the Word list marker ("1.", "a)", "·", "o", "§"), removed from the paragraph. */
function takeWordListMarker(p: HTMLElement): string {
  let marker = '';
  for (const span of Array.from(p.querySelectorAll('span'))) {
    if (/mso-list:\s*ignore/i.test(span.getAttribute('style') ?? '')) {
      marker ||= (span.textContent ?? '').replace(/\u00a0/g, ' ').trim();
      // Drop the marker and any now-empty wrappers around it
      let target: Element = span;
      while (target.parentElement && target.parentElement !== p && (target.parentElement.textContent ?? '') === (target.textContent ?? '')) {
        target = target.parentElement;
      }
      target.remove();
    }
  }
  return marker;
}

function wordListInfo(p: HTMLElement): { level: number } | null {
  const style = p.getAttribute('style') ?? '';
  const m = /mso-list:\s*l\d+\s+level(\d+)/i.exec(style);
  if (m) return { level: Math.max(1, Math.min(9, Number(m[1]))) };
  if (/^MsoListParagraph/i.test(p.className) && !/mso-list:\s*none/i.test(style)) return { level: 1 };
  return null;
}

function buildList(doc: Document, items: WordListItem[]): HTMLElement {
  const root = doc.createElement(items[0].ordered ? 'ol' : 'ul');
  // Stack of open lists; stack[i] is the list at nesting level i + 1
  const stack: HTMLElement[] = [root];
  for (const item of items) {
    const depth = Math.min(item.level, stack.length + 1);
    while (stack.length > depth) stack.pop();
    if (stack.length < depth) {
      const parentList = stack[stack.length - 1];
      let parentLi = parentList.lastElementChild as HTMLElement | null;
      if (!parentLi) {
        parentLi = doc.createElement('li');
        parentList.append(parentLi);
      }
      const sub = doc.createElement(item.ordered ? 'ol' : 'ul');
      parentLi.append(sub);
      stack.push(sub);
    }
    const li = doc.createElement('li');
    li.append(...Array.from(item.el.childNodes));
    stack[stack.length - 1].append(li);
  }
  return root;
}

function convertWordLists(body: HTMLElement): void {
  const doc = body.ownerDocument;
  const paragraphs = Array.from(body.querySelectorAll<HTMLElement>('p'));
  let run: WordListItem[] = [];
  const flush = () => {
    if (run.length > 0) {
      const list = buildList(doc, run);
      run[0].el.replaceWith(list);
      for (const item of run.slice(1)) item.el.remove();
    }
    run = [];
  };
  for (const p of paragraphs) {
    const info = wordListInfo(p);
    if (!info) {
      flush();
      continue;
    }
    // A run continues only across directly adjacent list paragraphs
    const prev = run[run.length - 1];
    if (prev && prev.el.nextElementSibling !== p) flush();
    const marker = takeWordListMarker(p);
    const ordered = /^(?:\(?[0-9]+|[a-z]|[ivxlcdm]+)[.)]$/i.test(marker);
    run.push({ el: p, level: info.level, ordered });
  }
  flush();
}

// ============================================================================
// Inline styles -> semantic marks
// ============================================================================

/** Wrap the element's children in the given tags (outermost first). */
function wrapChildren(el: HTMLElement, tags: string[]): void {
  if (tags.length === 0) return;
  const doc = el.ownerDocument;
  const outer = doc.createElement(tags[0]);
  let inner = outer;
  for (const tag of tags.slice(1)) {
    const next = doc.createElement(tag);
    inner.append(next);
    inner = next;
  }
  inner.append(...Array.from(el.childNodes));
  el.append(outer);
}

function isBoldWeight(value: string | undefined): boolean {
  if (!value) return false;
  const v = value.trim().toLowerCase();
  return v === 'bold' || v === 'bolder' || (/^\d+$/.test(v) && Number(v) >= 600);
}

function isNormalWeight(value: string | undefined): boolean {
  if (!value) return false;
  const v = value.trim().toLowerCase();
  return v === 'normal' || v === 'lighter' || (/^\d+$/.test(v) && Number(v) < 600);
}

/** Convert a styled inline element (span/font/...) to marks; returns the kept style. */
function cleanInlineStyle(el: HTMLElement, fonts: Set<string>): string {
  const style = parseStyle(el.getAttribute('style'));
  const tags: string[] = [];
  if (isBoldWeight(style.get('font-weight'))) tags.push('strong');
  if (/italic|oblique/i.test(style.get('font-style') ?? '')) tags.push('em');
  const decoration = `${style.get('text-decoration') ?? ''} ${style.get('text-decoration-line') ?? ''}`;
  if (/underline/i.test(decoration)) tags.push('u');
  if (/line-through/i.test(decoration)) tags.push('s');
  const valign = (style.get('vertical-align') ?? '').toLowerCase();
  if (valign === 'super') tags.push('sup');
  else if (valign === 'sub') tags.push('sub');

  const kept: string[] = [];
  const color = style.get('color');
  if (color && isSafeCssColor(color) && !isDefaultColor(color) && !/^var\(/i.test(color)) kept.push(`color: ${color}`);
  const family = fontFamilyName(style.get('font-family'));
  if (family && fonts.has(family.toLowerCase())) kept.push(`font-family: ${fontFamilyCss(family)}`);

  // Highlight: background-color (Docs, web) or mso-highlight / background (Word)
  const background =
    style.get('background-color') ??
    style.get('mso-highlight') ??
    (/^(#[0-9a-f]{3,8}|[a-z]+|rgba?\([^)]*\))$/i.test(style.get('background') ?? '') ? style.get('background') : undefined);
  if (background && isSafeCssColor(background) && !isDefaultColor(background) && !/^var\(/i.test(background)) {
    const mark = el.ownerDocument.createElement('mark');
    mark.setAttribute('data-color', background);
    mark.setAttribute('style', `background-color: ${background}`);
    mark.append(...Array.from(el.childNodes));
    el.append(mark);
  }
  wrapChildren(el, tags);
  return kept.join('; ');
}

// ============================================================================
// Main entry
// ============================================================================

/** Clean pasted HTML (Word, Google Docs, web pages) for the slide text editor. */
export function cleanPastedHtml(html: string, options: PasteCleanupOptions = {}): string {
  if (typeof DOMParser === 'undefined') return html;
  // Copy/paste inside the editor (ProseMirror clipboard HTML: the first
  // top-level element carries data-pm-slice="openStart openEnd context") keeps
  // everything the schema supports (font sizes, indent, line height…); only
  // inline styles are still reduced to the safe text properties.
  if (/data-pm-slice=/.test(html)) {
    const pmDoc = new DOMParser().parseFromString(html, 'text/html');
    const first = pmDoc.body.firstElementChild;
    if (first && /^\d+ \d+(?: .*)?$/.test(first.getAttribute('data-pm-slice') ?? '')) {
      filterStyles(pmDoc.body);
      return pmDoc.body.innerHTML;
    }
  }
  const fonts = new Set((options.availableFonts ?? []).map((f) => f.toLowerCase()));
  const word = isWordHtml(html);

  // Conditional comments / downlevel-revealed blocks ([if !supportLists] etc.)
  let source = html
    // Revealed form <!--[if !supportLists]-->…<!--[endif]-->: keep the content
    .replace(/<!--\[if [^\]]*\]-->|<!--\[endif\]-->/gi, '')
    // Hidden form <!--[if gte mso 9]><xml>…</xml><![endif]-->: drop it
    .replace(/<!--\[if [^\]]*\]>[\s\S]*?<!\[endif\]-->/gi, '')
    // Downlevel-revealed <![if !supportLists]>…<![endif]>: keep the content
    .replace(/<!\[if [^\]]*\]>|<!\[endif\]>/gi, '')
    .replace(/<\/?o:p>/gi, '');
  // Only the fragment between the clipboard markers, when present
  const fragment = /<!--StartFragment-->([\s\S]*?)<!--EndFragment-->/i.exec(source);
  if (fragment) source = fragment[1];

  const doc = new DOMParser().parseFromString(source, 'text/html');
  const body = doc.body;

  // Comments
  const walker = doc.createTreeWalker(body, 128 /* NodeFilter.SHOW_COMMENT */);
  const comments: Node[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) comments.push(n);
  comments.forEach((c) => c.parentNode?.removeChild(c));

  // Google Docs wrapper: <b style="font-weight:normal;" id="docs-internal-guid-…">
  for (const b of Array.from(body.querySelectorAll('[id^="docs-internal-guid"]'))) unwrap(b);

  if (word) convertWordLists(body);

  // Process deepest-first so replacements never detach a node we still visit
  const elements = Array.from(body.querySelectorAll<HTMLElement>('*')).reverse();
  for (const el of elements) {
    const tag = el.tagName.toUpperCase();
    if (DROP_TAGS.has(tag) || tag.includes(':')) {
      // Namespaced Office tags (o:p, v:shape, w:sdt…): keep text of w:*, drop the rest
      if (tag.startsWith('W:')) unwrap(el);
      else el.remove();
      continue;
    }
    if (el.classList.contains('Apple-interchange-newline')) {
      el.remove();
      continue;
    }

    if (/^H[1-6]$/.test(tag)) {
      // Headings -> bold paragraphs
      const p = rename(el, 'p');
      wrapChildren(p, ['strong']);
      cleanBlockAttributes(p, el);
      continue;
    }
    if (tag === 'DIV' || tag === 'SECTION' || tag === 'ARTICLE' || tag === 'HEADER' || tag === 'FOOTER' || tag === 'MAIN' || tag === 'ASIDE' || tag === 'NAV' || tag === 'FIGURE' || tag === 'ADDRESS') {
      const hasBlocks = Array.from(el.children).some((c) => BLOCK_TAGS.has(c.tagName.toUpperCase()));
      if (hasBlocks || el.parentElement?.closest('p, li, td, th')) unwrap(el);
      else cleanBlockAttributes(rename(el, 'p'), el);
      continue;
    }

    if (tag === 'B' || tag === 'STRONG') {
      if (isNormalWeight(parseStyle(el.getAttribute('style')).get('font-weight'))) {
        unwrap(el);
        continue;
      }
    }

    if (tag === 'SPAN' || tag === 'FONT') {
      const kept = cleanInlineStyle(el, fonts);
      if (kept) {
        const span = tag === 'FONT' ? rename(el, 'span') : el;
        stripAttributes(span);
        span.setAttribute('style', kept);
      } else {
        unwrap(el);
      }
      continue;
    }

    if (!KEEP_TAGS.has(tag)) {
      unwrap(el);
      continue;
    }

    if (tag === 'A') {
      const href = el.getAttribute('href') ?? '';
      if (!isAllowedLinkHref(href)) {
        unwrap(el);
        continue;
      }
      stripAttributes(el);
      el.setAttribute('href', href.trim());
      continue;
    }
    if (tag === 'MARK') {
      const color = el.getAttribute('data-color') ?? el.style.backgroundColor;
      stripAttributes(el);
      if (color && isSafeCssColor(color) && !isDefaultColor(color)) {
        el.setAttribute('data-color', color);
        el.setAttribute('style', `background-color: ${color}`);
      }
      continue;
    }
    if (tag === 'TD' || tag === 'TH') {
      const colspan = el.getAttribute('colspan');
      const rowspan = el.getAttribute('rowspan');
      stripAttributes(el);
      if (colspan && Number(colspan) > 1) el.setAttribute('colspan', String(Number(colspan)));
      if (rowspan && Number(rowspan) > 1) el.setAttribute('rowspan', String(Number(rowspan)));
      continue;
    }
    if (tag === 'OL') {
      const start = Number(el.getAttribute('start'));
      stripAttributes(el);
      if (Number.isInteger(start) && start > 1) el.setAttribute('start', String(start));
      continue;
    }
    if (tag === 'P') {
      cleanBlockAttributes(el, el);
      continue;
    }
    stripAttributes(el);
  }

  // Word/Docs often wrap text in <span style="white-space:pre"> and use
  // non-breaking spaces for spacing: collapse runs of nbsp to plain spaces.
  const textWalker = doc.createTreeWalker(body, 4 /* NodeFilter.SHOW_TEXT */);
  for (let n = textWalker.nextNode(); n; n = textWalker.nextNode()) {
    if (n.nodeValue && /\u00a0/.test(n.nodeValue) && !n.parentElement?.closest('pre, code')) {
      n.nodeValue = n.nodeValue.replace(/\u00a0+/g, (m) => (m.length > 1 ? ' ' : '\u00a0'));
    }
  }

  // Unwrap <p> directly inside <li> when it is the only block (Docs wraps every item)
  for (const li of Array.from(body.querySelectorAll('li'))) {
    const blocks = Array.from(li.children).filter((c) => c.tagName === 'P');
    if (blocks.length === 1 && li.firstElementChild === blocks[0] && !blocks[0].getAttribute('style')) unwrap(blocks[0]);
  }

  filterStyles(body);
  return body.innerHTML.trim();
}

/** Apply the rich-text inline style policy to every element under `root`. */
function filterStyles(root: HTMLElement): void {
  for (const el of Array.from(root.querySelectorAll('[style]'))) {
    const style = filterInlineStyle(el.getAttribute('style'));
    if (style) el.setAttribute('style', style);
    else el.removeAttribute('style');
  }
}

function stripAttributes(el: Element): void {
  for (const attr of Array.from(el.attributes)) el.removeAttribute(attr.name);
}

/** Block elements keep only text-align (from style or the legacy align attribute). */
function cleanBlockAttributes(target: HTMLElement, source: HTMLElement): void {
  const style = parseStyle(source.getAttribute('style'));
  const align = (style.get('text-align') ?? source.getAttribute('align') ?? '').toLowerCase().trim();
  stripAttributes(target);
  if (align === 'center' || align === 'right' || align === 'justify') {
    target.setAttribute('style', `text-align: ${align}`);
  }
}

/** Tiptap extension applying cleanPastedHtml to every HTML paste. */
export const PasteCleanup = Extension.create<PasteCleanupOptions>({
  name: 'pasteCleanup',

  addProseMirrorPlugins() {
    const options = this.options;
    return [
      new Plugin({
        key: new PluginKey('pasteCleanup'),
        props: {
          transformPastedHTML: (html) =>
            cleanPastedHtml(html, { availableFonts: options.availableFonts ?? getAvailableFonts() }),
        },
      }),
    ];
  },
});
