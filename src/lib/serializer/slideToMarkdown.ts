import type { Slide } from '../../types/presentation';
import type { SlideElement } from '../../types/slide';
import { directive, encodeDirectiveJson } from '../parser/directives';
import { parsePresentationSync } from '../parser/parsePresentation';
import { inlineMarkdownToHtml, splitListItem, type NestedList } from '../editor/listItems';

/**
 * Markdown export format (lossless app -> md -> app):
 *
 *   <!-- transition: fade -->            (only when not 'none')
 *   <!-- layout: title -->
 *   <!-- element: {"type":"heading","position":{...},"level":1} -->
 *   # Heading text
 *   <!-- element: {"type":"text","position":{...},"fontFamily":"Inter"} -->
 *   Raw **markdown** content
 *   ???
 *   Speaker notes, verbatim
 *
 * Each element directive carries the element type and every property that
 * markdown cannot express; the element's content follows as readable
 * markdown. Before emitting a body, the serializer re-parses it and checks
 * that it reads back identically; if it would not (e.g. text containing
 * `---` or `???`, an unclosed code fence, ...), the content is stored in the
 * directive JSON instead, so export is always lossless.
 */
export function slideToMarkdown(slide: Slide): string {
  const header: string[] = [];
  if (slide.transition && slide.transition !== 'none') {
    header.push(directive('transition', slide.transition));
  }
  header.push(directive('layout', slide.layout));

  let notesBlocks: string[] = [];
  if (slide.notes) {
    if (notesRoundTrip(slide.notes)) {
      notesBlocks = ['???', slide.notes];
    } else {
      header.push(directive('notes-data', encodeDirectiveJson(slide.notes)));
    }
  }

  const render = (elementBlocks: string[][]) =>
    [...header, ...elementBlocks.flat(), ...notesBlocks].join('\n\n');

  const encoded = slide.elements.map(encodeElement);

  // 1. Plain markdown (no element directives) when the importer's heuristics
  //    reproduce every element exactly — hand-written decks export unchanged.
  if (encoded.every((e) => e.plain !== null)) {
    const plain = encoded.map((e) => e.plain!);
    const candidates: string[][][] = [];
    if (slide.layout === 'two-column') {
      // Prefer an explicit column break before the first right-hand element
      const k = slide.elements.findIndex((el) => el.position.x >= 50);
      if (k > 0) candidates.push([...plain.slice(0, k), [directive('column-break')], ...plain.slice(k)]);
    }
    candidates.push(plain);
    for (const candidate of candidates) {
      const md = render(candidate);
      if (slideRoundTrips(md, slide)) return md;
    }
  }

  const full = encoded.map((e) => e.blocks(false));
  if (slide.elements.length === 0) return render(full);

  // 2. Omit positions that auto-layout would reproduce anyway.
  const withoutPositions = parseSlide(render(encoded.map((e) => e.blocks(true))));
  if (withoutPositions && withoutPositions.elements.length === slide.elements.length) {
    const auto = new Set<number>();
    slide.elements.forEach((el, i) => {
      if (samePosition(withoutPositions.elements[i].position, el.position)) auto.add(i);
    });
    if (auto.size > 0) {
      const md = render(encoded.map((e, i) => e.blocks(auto.has(i))));
      if (slideRoundTrips(md, slide)) return md;
    }
  }

  // 3. Fully explicit (always lossless: each element block was verified).
  return render(full);
}

/** Fields carried by the markdown body (rather than the directive) per element type. */
const BODY_FIELDS: Record<SlideElement['type'], string[]> = {
  heading: ['content', 'level'],
  text: ['content'],
  list: ['items', 'ordered', 'start'],
  code: ['code', 'language'],
  image: ['url', 'alt'],
  video: ['url'],
  html: ['htmlContent'],
  rectangle: [],
  circle: [],
  line: [],
};

/** Runtime-only fields never written to markdown. */
const TRANSIENT_FIELDS = new Set(['id', 'cachedUrl']);

interface EncodedElement {
  /** Directive form; `omitPosition` drops the position from the directive JSON. */
  blocks: (omitPosition: boolean) => string[];
  /** Plain markdown form (fragment directives + body), or null if impossible. */
  plain: string[] | null;
}

function encodeElement(element: SlideElement): EncodedElement {
  const all = element as unknown as Record<string, unknown>;
  const bodyFields = new Set(BODY_FIELDS[element.type]);

  // Directive props: type first, then position, then everything else not in the body
  const props: Record<string, unknown> = { type: element.type, position: element.position };
  const full: Record<string, unknown> = { type: element.type, position: element.position };
  // Remaining keys in sorted order so output is canonical (idempotent)
  for (const [key, value] of Object.entries(all).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    if (value === undefined || TRANSIENT_FIELDS.has(key) || key === 'type' || key === 'position') continue;
    full[key] = value;
    if (!bodyFields.has(key)) props[key] = value;
  }

  // Fragments use the documented, human-editable directives when representable.
  const prefix: string[] = [];
  const { fragment } = element;
  if (fragment !== undefined && Number.isInteger(fragment) && fragment >= 0) {
    prefix.push(directive('fragment', String(fragment)));
    delete props.fragment;
    delete full.fragment;
    if (element.type === 'list' && element.fragmentPerItem === true) {
      prefix.push(directive('fragment-items'));
      delete props.fragmentPerItem;
      delete full.fragmentPerItem;
    }
  }

  const withoutPosition = (obj: Record<string, unknown>, omit: boolean) => {
    if (!omit) return obj;
    const { position: _position, ...rest } = obj;
    return rest;
  };

  const body = elementBody(element);
  if (body !== null && body !== '') {
    const candidate = [...prefix, directive('element', encodeDirectiveJson(props)), body];
    if (elementRoundTrips(candidate, element)) {
      return {
        blocks: (omit) => [...prefix, directive('element', encodeDirectiveJson(withoutPosition(props, omit))), body],
        plain: [...prefix, body],
      };
    }
  }
  if (body === '') {
    // Empty content: the directive alone reads back as empty content.
    const candidate = [...prefix, directive('element', encodeDirectiveJson(props))];
    if (elementRoundTrips(candidate, element)) {
      return {
        blocks: (omit) => [...prefix, directive('element', encodeDirectiveJson(withoutPosition(props, omit)))],
        plain: null,
      };
    }
  }

  return {
    blocks: (omit) => [...prefix, directive('element', encodeDirectiveJson(withoutPosition(full, omit)))],
    plain: null,
  };
}

/** Readable markdown for an element, or null if it has no markdown form. */
function elementBody(element: SlideElement): string | null {
  switch (element.type) {
    case 'heading':
      return `${'#'.repeat(element.level)} ${element.content}`.trimEnd();
    case 'text':
      return element.content;
    case 'list': {
      const first = element.start ?? 1;
      return element.items
        .map((item, i) => listItemMarkdown(item, element.ordered ? `${first + i}.` : '-'))
        .join('\n');
    }
    case 'code': {
      const longestRun = (element.code.match(/`+/g) ?? []).reduce((max, m) => Math.max(max, m.length), 0);
      const fence = '`'.repeat(Math.max(3, longestRun + 1));
      return `${fence}${element.language}\n${element.code}\n${fence}`;
    }
    case 'image':
      return `![${escapeAlt(element.alt ?? '')}](${formatUrl(element.url)})`;
    case 'video':
      return `![](${formatUrl(element.url)})`;
    case 'html':
      return element.htmlContent;
    case 'rectangle':
    case 'circle':
    case 'line':
      return null;
  }
}

// ============================================================================
// Lists (nested sub-lists become indented markdown lists)
// ============================================================================

/** One list item; nested-list HTML is written as indented markdown when possible. */
function listItemMarkdown(item: string, marker: string): string {
  const indent = ' '.repeat(marker.length + 1);
  const { text, lists } = splitListItem(item);
  if (!lists) return `${marker} ${item.replace(/\n/g, `\n${indent}`)}`.trimEnd();
  // The importer converts the content of an item that has sub-lists to HTML
  const head = `${marker} ${inlineHtmlToMarkdown(text).replace(/\n/g, `\n${indent}`)}`.trimEnd();
  return [head, ...subLists(lists, indent, head !== marker)].join('\n');
}

/**
 * Indented sub-lists of an item. An ordered list not starting at 1 cannot
 * interrupt a paragraph in CommonMark, so it is separated from the item text
 * by a blank line.
 */
function subLists(lists: NestedList[], indent: string, afterText: boolean): string[] {
  return lists.map((list, i) => {
    const md = indentLines(nestedListMarkdown(list), indent);
    return i === 0 && afterText && list.ordered && list.start !== 1 ? `\n${md}` : md;
  });
}

function nestedListMarkdown(list: NestedList): string {
  return list.items
    .map((li, i) => {
      const marker = list.ordered ? `${list.start + i}.` : '-';
      const indent = ' '.repeat(marker.length + 1);
      const head = `${marker} ${inlineHtmlToMarkdown(li.text)}`.trimEnd();
      return [head, ...subLists(li.lists, indent, head !== marker)].join('\n');
    })
    .join('\n');
}

function indentLines(text: string, indent: string): string {
  return text.replace(/^(?=.)/gm, indent);
}

/**
 * Inline HTML -> markdown (bold/italic/code/links), used only when the
 * importer's inline conversion reproduces the HTML exactly; otherwise the HTML
 * is kept verbatim (markdown allows inline HTML).
 */
function inlineHtmlToMarkdown(html: string): string {
  const md = html
    .replace(/<strong>([^<]*)<\/strong>/g, '**$1**')
    .replace(/<em>([^<]*)<\/em>/g, '*$1*')
    .replace(/<strong>\*([^<*]*)\*<\/strong>/g, '***$1***')
    .replace(/<del>([^<]*)<\/del>/g, '~~$1~~')
    .replace(/<code>([^<`]*)<\/code>/g, (_m, code: string) =>
      `\`${code.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')}\``)
    .replace(/<a href="([^"()\s]+)">([^<\][]*)<\/a>/g, '[$2]($1)');
  return inlineMarkdownToHtml(md) === html ? md : html;
}

function escapeAlt(alt: string): string {
  return alt.replace(/([\\[\]])/g, '\\$1');
}

function formatUrl(url: string): string {
  if (url === '' || /[\s()<>]/.test(url)) return `<${url.replace(/([<>\\])/g, '\\$1')}>`;
  return url;
}

// ============================================================================
// Round-trip verification
// ============================================================================

const SENTINEL = directive(
  'element',
  encodeDirectiveJson({ type: 'line', position: { x: 0, y: 0, width: 0, height: 0 } }),
);

function elementRoundTrips(blocks: string[], element: SlideElement): boolean {
  try {
    const doc = [directive('layout', 'freestyle'), ...blocks, SENTINEL].join('\n\n');
    const { presentation } = parsePresentationSync(doc);
    const slide = presentation.slides[0];
    return (
      presentation.slides.length === 1 &&
      slide.notes === undefined &&
      slide.elements.length === 2 &&
      slide.elements[1].type === 'line' &&
      sameElement(slide.elements[0], element)
    );
  } catch {
    return false;
  }
}

function notesRoundTrip(notes: string): boolean {
  try {
    const doc = [directive('layout', 'blank'), '???', notes, '---', directive('layout', 'blank')].join('\n\n');
    const { presentation } = parsePresentationSync(doc);
    return (
      presentation.slides.length === 2 &&
      presentation.slides[0].notes === notes &&
      presentation.slides[0].elements.length === 0 &&
      presentation.slides[1].notes === undefined
    );
  } catch {
    return false;
  }
}

function parseSlide(md: string): Slide | null {
  try {
    const { presentation, warnings } = parsePresentationSync(md);
    return presentation.slides.length === 1 && warnings.length === 0 ? presentation.slides[0] : null;
  } catch {
    return null;
  }
}

function slideRoundTrips(md: string, slide: Slide): boolean {
  const parsed = parseSlide(md);
  return (
    !!parsed &&
    parsed.layout === slide.layout &&
    parsed.transition === (slide.transition ?? 'none') &&
    (parsed.notes ?? undefined) === (slide.notes || undefined) &&
    parsed.elements.length === slide.elements.length &&
    parsed.elements.every((el, i) => sameElement(el, slide.elements[i]))
  );
}

function samePosition(a: SlideElement['position'], b: SlideElement['position']): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

/** Compare elements ignoring ids, runtime-only fields and undefined values. */
export function sameElement(a: SlideElement, b: SlideElement): boolean {
  return stableStringify(stripTransient(a)) === stableStringify(stripTransient(b));
}

function stripTransient(el: SlideElement): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(el)) {
    if (v !== undefined && !TRANSIENT_FIELDS.has(k)) out[k] = v;
  }
  return out;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}
