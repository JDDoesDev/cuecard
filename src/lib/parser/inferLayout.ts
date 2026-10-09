import type { Content } from 'mdast';
import { inlineMarkdownToHtml } from '@/lib/editor/listItems';
import type { z } from 'zod';
import type { ElementPosition, LayoutPreset, SlideElement } from '@/types/slide';
import {
  LAYOUTS,
  ElementPositionSchema,
  HeadingElementSchema,
  TextElementSchema,
  ListElementSchema,
  CodeElementSchema,
  ImageElementSchema,
  VideoElementSchema,
  RectangleElementSchema,
  CircleElementSchema,
  LineElementSchema,
  HtmlElementSchema,
} from '@/types/slide';

/**
 * Layout inference result containing the detected layout type and elements array
 */
export interface LayoutInference {
  layout: LayoutPreset;
  elements: SlideElement[];
}

/**
 * A unit of slide content produced by the slide splitter (remarkSlidePlugin).
 *
 * - `node`: a plain markdown node (heuristic import); legacy `fragment` /
 *   `position` directives are attached to it.
 * - `segment`: content introduced by an `<!-- element: {...} -->` directive
 *   (lossless app export). `nodes` holds the single body node (if any) and
 *   `body` its verbatim markdown source; `extra` holds any further nodes
 *   before the next directive (imported as separate auto-positioned elements).
 * - `shape`: legacy `<!-- shape: {...} -->` directive.
 * - `column-break`: legacy `<!-- column-break -->` marker.
 */
export type SlideItem =
  | { kind: 'node'; node: Content; fragment?: number; fragmentPerItem?: boolean; position?: ElementPosition }
  | { kind: 'shape'; data: Record<string, unknown>; fragment?: number; position?: ElementPosition }
  | { kind: 'segment'; props: Record<string, unknown> | null; nodes: Content[]; body: string; extra: Content[] }
  | { kind: 'column-break' };

interface Draft {
  el: SlideElement;
  /** True when the element carries an explicit position (directive). */
  placed: boolean;
  column: 'left' | 'right';
}

type ElementType = SlideElement['type'];

const ELEMENT_SCHEMAS: Record<ElementType, z.ZodObject<any>> = {
  heading: HeadingElementSchema,
  text: TextElementSchema,
  list: ListElementSchema,
  code: CodeElementSchema,
  image: ImageElementSchema,
  video: VideoElementSchema,
  rectangle: RectangleElementSchema,
  circle: CircleElementSchema,
  line: LineElementSchema,
  html: HtmlElementSchema,
};

const REQUIRED_DEFAULTS: Record<ElementType, Record<string, unknown>> = {
  heading: { content: '', level: 1 },
  text: { content: '' },
  list: { items: [], ordered: false },
  code: { code: '', language: 'text' },
  image: { url: '' },
  video: { url: '' },
  rectangle: {},
  circle: {},
  line: {},
  html: { htmlContent: '' },
};

const PLACEHOLDER_POSITION: ElementPosition = { x: 0, y: 0, width: 0, height: 0 };

export function isElementType(type: unknown): type is ElementType {
  return typeof type === 'string' && Object.hasOwn(ELEMENT_SCHEMAS, type);
}

export function isValidLayout(layout: unknown): layout is LayoutPreset {
  return typeof layout === 'string' && (LAYOUTS as readonly string[]).includes(layout);
}

export function parsePosition(value: unknown): ElementPosition | undefined {
  const result = ElementPositionSchema.safeParse(value);
  if (!result.success) return undefined;
  const p = result.data;
  if (![p.x, p.y, p.width, p.height].every(Number.isFinite)) return undefined;
  return { x: p.x, y: p.y, width: p.width, height: p.height };
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Convenience wrapper: infer layout + elements for plain mdast nodes.
 *
 * @param nodes - mdast nodes for the slide (directive comments already removed)
 * @param source - the markdown source the nodes were parsed from (for verbatim text)
 * @param explicitLayout - optional explicit layout from `<!-- layout: X -->`
 */
export function inferLayout(nodes: Content[], source = '', explicitLayout?: string): LayoutInference {
  const items: SlideItem[] = nodes.map((node) => ({ kind: 'node', node }));
  return buildSlideElements(items, explicitLayout, source, []);
}

/**
 * Turn slide items into positioned elements.
 *
 * Principles:
 * - Content is NEVER dropped and document order is preserved.
 * - The layout only decides default positions for elements that have no
 *   explicit position.
 */
export function buildSlideElements(
  items: SlideItem[],
  explicitLayout: string | undefined,
  source: string,
  warnings: string[],
): LayoutInference {
  const drafts: Draft[] = [];
  let column: 'left' | 'right' = 'left';
  let hasColumnBreak = false;

  for (const item of items) {
    let produced: Draft[] = [];
    switch (item.kind) {
      case 'column-break':
        hasColumnBreak = true;
        column = 'right';
        continue;
      case 'segment':
        produced = segmentToDrafts(item, source, warnings);
        break;
      case 'shape': {
        const el = finalizeElement({ ...item.data }, warnings);
        produced = [{ el, placed: false, column }];
        applyLegacyData(produced, item.fragment, undefined, item.position ?? parsePosition(item.data.position));
        break;
      }
      case 'node':
        produced = nodeToElements(item.node, source).map((el) => ({ el, placed: false, column }));
        applyLegacyData(produced, item.fragment, item.fragmentPerItem, item.position);
        break;
    }
    for (const d of produced) d.column = column;
    drafts.push(...produced);
  }

  let layout: LayoutPreset;
  if (explicitLayout !== undefined && isValidLayout(explicitLayout)) {
    layout = explicitLayout;
  } else {
    layout = inferLayoutType(drafts, hasColumnBreak);
  }

  assignPositions(layout, drafts, hasColumnBreak);

  return { layout, elements: drafts.map((d) => d.el) };
}

function applyLegacyData(
  drafts: Draft[],
  fragment: number | undefined,
  fragmentPerItem: boolean | undefined,
  position: ElementPosition | undefined,
): void {
  const first = drafts[0];
  if (!first) return;
  if (fragment !== undefined) first.el.fragment = fragment;
  if (fragmentPerItem && first.el.type === 'list') first.el.fragmentPerItem = true;
  if (position) {
    first.el.position = position;
    first.placed = true;
  }
}

// ============================================================================
// Layout heuristics
// ============================================================================

/**
 * Heuristic rules (in order):
 * 0. Column-break marker present -> 'two-column'
 * 1. Code block present -> 'code-block'
 * 2. Single image/video, no other content -> 'full-bleed-media'
 * 3. Image/video + other content -> 'media-anywhere'
 * 4. Heading + list -> 'title-list'
 * 5. Heading -> 'title'
 * 6. Default fallback -> 'freestyle'
 */
function inferLayoutType(drafts: Draft[], hasColumnBreak: boolean): LayoutPreset {
  if (hasColumnBreak) return 'two-column';
  const types = drafts.map((d) => d.el.type);
  if (types.includes('code')) return 'code-block';
  const mediaCount = types.filter((t) => t === 'image' || t === 'video').length;
  if (mediaCount === 1 && drafts.length === 1) return 'full-bleed-media';
  if (mediaCount > 0) return 'media-anywhere';
  if (types.includes('heading') && types.includes('list')) return 'title-list';
  if (types.includes('heading')) return 'title';
  return 'freestyle';
}

// ============================================================================
// Default positions
// ============================================================================

interface Region {
  x: number;
  y: number;
  w: number;
  h: number;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

function place(d: Draft, x: number, y: number, width: number, height: number): void {
  d.el.position = { x: round(x), y: round(y), width: round(width), height: round(height) };
  d.placed = true;
}

/** Stack drafts vertically inside a region, preserving order. */
function stack(
  drafts: Draft[],
  region: Region,
  opts: { maxHeight?: number; gap?: number; weight?: (d: Draft) => number } = {},
): void {
  const n = drafts.length;
  if (n === 0) return;
  const MIN_HEIGHT = 4;
  // Shrink the gap (down to 0) before shrinking elements, so everything fits in the region.
  let gap = opts.gap ?? 3;
  if (n > 1 && region.h - gap * (n - 1) < n * MIN_HEIGHT) {
    gap = Math.max(0, (region.h - n * MIN_HEIGHT) / (n - 1));
  }
  const available = region.h - gap * (n - 1);
  const weights = drafts.map((d) => (opts.weight ? opts.weight(d) : 1));
  const total = weights.reduce((a, b) => a + b, 0);
  let y = region.y;
  const bottom = region.y + region.h;
  drafts.forEach((d, i) => {
    let h = (available * weights[i]) / total;
    if (opts.maxHeight !== undefined) h = Math.min(h, opts.maxHeight);
    h = Math.max(0, Math.min(h, bottom - y));
    place(d, region.x, y, region.w, h);
    y = Math.min(bottom, y + h + gap);
  });
}

/** The first element, if it is a heading (a heading slot never reorders content). */
const leadingHeading = (drafts: Draft[]) => (drafts[0]?.el.type === 'heading' ? drafts[0] : undefined);

const isMedia = (d: Draft) => d.el.type === 'image' || d.el.type === 'video';

function assignPositions(layout: LayoutPreset, drafts: Draft[], hasColumnBreak: boolean): void {
  const unplaced = drafts.filter((d) => !d.placed);
  if (unplaced.length === 0) return;
  const take = (d: Draft | undefined) => {
    if (d) unplaced.splice(unplaced.indexOf(d), 1);
    return d;
  };

  switch (layout) {
    case 'title': {
      // Source order is kept top-to-bottom: first element -> title slot,
      // second -> subtitle slot, the rest stacked below.
      const title = take(unplaced[0]);
      if (title) place(title, 15, 30, 70, 20);
      const subtitle = take(unplaced[0]);
      if (subtitle) place(subtitle, 20, 55, 60, 10);
      stack(unplaced, { x: 15, y: 68, w: 70, h: 28 }, { maxHeight: 12 });
      return;
    }
    case 'title-list': {
      const heading = take(leadingHeading(unplaced));
      if (heading) place(heading, 12, 10, 76, 15);
      stack(unplaced, heading ? { x: 14, y: 30, w: 72, h: 58 } : { x: 14, y: 10, w: 72, h: 78 });
      return;
    }
    case 'code-block': {
      const heading = take(leadingHeading(unplaced));
      if (heading) place(heading, 12, 8, 76, 10);
      const region = heading ? { x: 12, y: 22, w: 76, h: 72 } : { x: 12, y: 8, w: 76, h: 86 };
      const hasCode = unplaced.some((d) => d.el.type === 'code');
      stack(unplaced, region, { weight: (d) => (d.el.type === 'code' || !hasCode ? 6 : 1) });
      return;
    }
    case 'full-bleed-media': {
      const media = take(unplaced.find(isMedia));
      if (media) {
        place(media, 0, 0, 100, 100);
        if (media.el.type === 'image' && media.el.objectFit === undefined) media.el.objectFit = 'cover';
      }
      stack(unplaced, { x: 5, y: 80, w: 90, h: 15 });
      return;
    }
    case 'media-anywhere': {
      const media = unplaced.filter(isMedia);
      const other = unplaced.filter((d) => !isMedia(d));
      if (media.length === 1) place(media[0], 54, 12, 34, 56);
      else stack(media, { x: 54, y: 12, w: 34, h: 76 });
      stack(other, { x: 12, y: 12, w: 38, h: 76 });
      return;
    }
    case 'two-column': {
      const heading = take(leadingHeading(unplaced));
      if (heading) place(heading, 12, 10, 76, 12);
      let left: Draft[];
      let right: Draft[];
      if (hasColumnBreak) {
        left = unplaced.filter((d) => d.column === 'left');
        right = unplaced.filter((d) => d.column === 'right');
      } else {
        const half = Math.ceil(unplaced.length / 2);
        left = unplaced.slice(0, half);
        right = unplaced.slice(half);
      }
      const top = heading ? 26 : 10;
      const height = heading ? 62 : 78;
      stack(left, { x: 12, y: top, w: 36, h: height });
      stack(right, { x: 52, y: top, w: 36, h: height });
      return;
    }
    case 'freestyle':
    case 'blank':
    default:
      stack(unplaced, { x: 15, y: 15, w: 70, h: 80 }, { maxHeight: 15 });
      return;
  }
}

// ============================================================================
// Element construction & validation
// ============================================================================

/**
 * Build a schema-valid element from an untrusted candidate object.
 * Invalid or unknown properties are dropped with a warning; required fields
 * get defaults. Never throws.
 */
export function finalizeElement(candidate: Record<string, unknown>, warnings: string[]): SlideElement {
  const type = isElementType(candidate.type) ? candidate.type : 'text';
  if (type !== candidate.type) {
    warnings.push(`Unknown element type "${String(candidate.type)}"; imported as text.`);
  }
  const schema = ELEMENT_SCHEMAS[type];
  const shape = schema.shape as Record<string, z.ZodType>;
  const out: Record<string, unknown> = { id: crypto.randomUUID(), type };

  for (const [key, value] of Object.entries(candidate)) {
    if (key === 'id' || key === 'type' || value === undefined) continue;
    if (key === 'position') {
      const pos = parsePosition(value);
      if (pos) out.position = pos;
      else warnings.push(`Invalid position on ${type} element ignored.`);
      continue;
    }
    const fieldSchema = Object.hasOwn(shape, key) ? shape[key] : undefined;
    if (!fieldSchema || typeof fieldSchema.safeParse !== 'function') {
      warnings.push(`Unknown property "${key}" on ${type} element ignored.`);
      continue;
    }
    const result = fieldSchema.safeParse(value);
    if (result.success) {
      if (result.data !== undefined) out[key] = result.data;
    } else {
      warnings.push(`Invalid value for "${key}" on ${type} element ignored.`);
    }
  }

  for (const [key, def] of Object.entries(REQUIRED_DEFAULTS[type])) {
    if (out[key] === undefined) out[key] = Array.isArray(def) ? [] : def;
  }
  if (!out.position) out.position = { ...PLACEHOLDER_POSITION };

  const result = schema.safeParse(out);
  if (result.success) return result.data as unknown as SlideElement;
  // Should be unreachable; keep content as text rather than failing the import.
  warnings.push(`Could not validate ${type} element; imported as text.`);
  return {
    id: out.id as string,
    type: 'text',
    position: out.position as ElementPosition,
    content: typeof out.content === 'string' ? out.content : '',
  };
}

/**
 * Decode an `<!-- element: {...} -->` segment into element draft(s).
 */
function segmentToDrafts(
  seg: Extract<SlideItem, { kind: 'segment' }>,
  source: string,
  warnings: string[],
): Draft[] {
  const props = seg.props;
  if (!props || !isElementType(props.type)) {
    if (props) warnings.push(`Unknown element type "${String(props.type)}"; content imported as plain markdown.`);
    return [...seg.nodes, ...seg.extra]
      .flatMap((node) => nodeToElements(node, source))
      .map((el) => ({ el, placed: false, column: 'left' as const }));
  }

  const nodes = seg.nodes;
  const single = nodes.length === 1 ? (nodes[0] as any) : undefined;
  const body = seg.body;
  const candidate: Record<string, unknown> = { ...props };
  const extras: SlideElement[] = [];
  const asTextFallback = () => {
    // Body doesn't match the declared type: keep the content verbatim as text.
    warnings.push(`Content of ${String(props.type)} element did not match its type; imported as text.`);
    candidate.type = 'text';
    candidate.content = body;
  };

  switch (props.type as ElementType) {
    case 'text':
      if (!Object.hasOwn(props, 'content')) candidate.content = body;
      break;
    case 'html':
      if (!Object.hasOwn(props, 'htmlContent')) candidate.htmlContent = body;
      break;
    case 'heading':
      if (!Object.hasOwn(props, 'content')) {
        if (single?.type === 'heading') {
          candidate.content = inlineSlice(single, source);
          if (!Object.hasOwn(props, 'level')) candidate.level = single.depth;
        } else {
          candidate.content = body.replace(/^#{1,6}[ \t]*/, '');
        }
      }
      break;
    case 'list':
      if (!Object.hasOwn(props, 'items')) {
        if (single?.type === 'list') {
          candidate.items = extractListItems(single, source);
          if (!Object.hasOwn(props, 'ordered')) candidate.ordered = single.ordered === true;
          const start = listStart(single);
          if (!Object.hasOwn(props, 'start') && start !== undefined) candidate.start = start;
        } else if (body !== '') {
          asTextFallback();
        }
      }
      break;
    case 'code':
      if (!Object.hasOwn(props, 'code')) {
        if (single?.type === 'code') {
          candidate.code = single.value ?? '';
          if (!Object.hasOwn(props, 'language')) candidate.language = single.lang || 'text';
        } else if (body !== '') {
          asTextFallback();
        }
      }
      break;
    case 'image':
    case 'video':
      if (!Object.hasOwn(props, 'url')) {
        const media = single ? imageOnlyParagraph(single) : null;
        if (media && media.length === 1) {
          candidate.url = media[0].url ?? '';
          if (props.type === 'image' && !Object.hasOwn(props, 'alt') && media[0].alt) candidate.alt = media[0].alt;
        } else if (body !== '') {
          asTextFallback();
        }
      }
      break;
    case 'rectangle':
    case 'circle':
    case 'line':
      // Shapes carry everything in the directive; keep any stray content.
      extras.push(...nodes.flatMap((node) => nodeToElements(node, source)));
      break;
  }

  if (seg.extra.length > 0) {
    warnings.push(`Content after a ${String(props.type)} element block imported as separate element(s).`);
    extras.push(...seg.extra.flatMap((node) => nodeToElements(node, source)));
  }

  const el = finalizeElement(candidate, warnings);
  const placed = parsePosition(props.position) !== undefined;
  return [
    { el, placed, column: 'left' },
    ...extras.map((e) => ({ el: e, placed: false, column: 'left' as const })),
  ];
}

/**
 * Convert one mdast node to element(s) without dropping anything.
 * Text content is the verbatim markdown source, so inline formatting
 * (links, emphasis, strikethrough, hard breaks, escapes) is preserved exactly.
 */
export function nodeToElements(node: Content, source: string): SlideElement[] {
  const base = () => ({ id: crypto.randomUUID(), position: { ...PLACEHOLDER_POSITION } });
  const n = node as any;

  switch (node.type) {
    case 'heading':
      return [{ ...base(), type: 'heading', content: inlineSlice(n, source), level: (n.depth || 1) as 1 | 2 | 3 | 4 | 5 | 6 }];
    case 'paragraph': {
      const media = imageOnlyParagraph(n);
      if (media) {
        return media.map((img): SlideElement => {
          if (isVideoUrl(img.url ?? '')) return { ...base(), type: 'video', url: img.url ?? '' };
          const el: SlideElement = { ...base(), type: 'image', url: img.url ?? '' };
          if (img.alt) el.alt = img.alt;
          return el;
        });
      }
      return [{ ...base(), type: 'text', content: sliceNode(n, source) }];
    }
    case 'list': {
      const start = listStart(n);
      return [{
        ...base(),
        type: 'list',
        items: extractListItems(n, source),
        ordered: n.ordered === true,
        ...(start !== undefined && { start }),
      }];
    }
    case 'code': {
      const el: SlideElement = { ...base(), type: 'code', code: n.value ?? '', language: n.lang || 'text' };
      const highlight = parseHighlightMeta(n.meta);
      if (highlight) el.highlightLines = highlight;
      return [el];
    }
    case 'html':
      return [{ ...base(), type: 'html', htmlContent: n.value ?? '' }];
    default:
      // Tables, blockquotes, definitions, etc. keep their markdown verbatim.
      return [{ ...base(), type: 'text', content: sliceNode(n, source) }];
  }
}

// ============================================================================
// Source helpers
// ============================================================================

function offsets(node: any): [number, number] | null {
  const start = node?.position?.start?.offset;
  const end = node?.position?.end?.offset;
  return typeof start === 'number' && typeof end === 'number' ? [start, end] : null;
}

/** Verbatim markdown source of a node (falls back to plain text). */
export function sliceNode(node: any, source: string): string {
  const range = offsets(node);
  if (!range || !source) return plainText(node);
  return dedentContinuation(source.slice(range[0], range[1]), (node.position.start.column ?? 1) - 1);
}

/** Verbatim inline source of a node's children (e.g. heading text). */
export function inlineSlice(node: any, source: string): string {
  const children = node?.children ?? [];
  if (children.length === 0) return '';
  const first = offsets(children[0]);
  const last = offsets(children[children.length - 1]);
  if (!first || !last || !source) return plainText(node);
  return dedentContinuation(source.slice(first[0], last[1]), (children[0].position.start.column ?? 1) - 1);
}

/** Remove up to `indent` leading spaces from continuation lines (nested containers). */
function dedentContinuation(text: string, indent: number): string {
  if (indent <= 0 || !text.includes('\n')) return text;
  const re = new RegExp(`\\n {1,${indent}}`, 'g');
  return text.replace(re, '\n');
}

function plainText(node: any): string {
  if (!node) return '';
  if (typeof node.value === 'string') return node.value;
  if (Array.isArray(node.children)) return node.children.map(plainText).join('');
  return '';
}

function isVideoUrl(url: string): boolean {
  const path = url.split(/[?#]/, 1)[0];
  return (
    /\.(?:mp4|webm|ogv|ogg|mov|m4v)$/i.test(path) ||
    /^(?:https?:)?\/\/(?:www\.)?(?:youtube\.com|youtu\.be|vimeo\.com)\//i.test(url)
  );
}

/** If the paragraph consists only of images (plus whitespace/breaks), return them. */
function imageOnlyParagraph(node: any): Array<{ url?: string; alt?: string }> | null {
  if (node?.type !== 'paragraph' || !Array.isArray(node.children)) return null;
  const images: Array<{ url?: string; alt?: string }> = [];
  for (const child of node.children) {
    if (child.type === 'image') images.push(child);
    else if (child.type === 'break') continue;
    else if (child.type === 'text' && child.value.trim() === '') continue;
    else return null;
  }
  return images.length > 0 ? images : null;
}

function parseHighlightMeta(meta: unknown): number[] | undefined {
  if (typeof meta !== 'string') return undefined;
  const match = meta.match(/^\{([\d,\s-]+)\}$/);
  if (!match) return undefined;
  const lines: number[] = [];
  for (const part of match[1].split(',')) {
    const range = part.trim().match(/^(\d+)(?:-(\d+))?$/);
    if (!range) continue;
    const start = parseInt(range[1], 10);
    const end = range[2] ? parseInt(range[2], 10) : start;
    for (let i = start; i <= end && i - start < 1000; i++) lines.push(i);
  }
  return lines.length > 0 ? lines : undefined;
}

/** Start number of an ordered mdast list, or undefined when it is 1 / unordered. */
function listStart(listNode: any): number | undefined {
  return listNode?.ordered === true && typeof listNode.start === 'number' && listNode.start !== 1
    ? listNode.start
    : undefined;
}

/**
 * Extract list items as inline markdown strings.
 * Multiple paragraphs within one item are joined with a newline (not glued);
 * nested lists are converted to canonical HTML (see src/lib/editor/listItems.ts).
 */
export function extractListItems(listNode: any, source: string): string[] {
  if (!listNode || !Array.isArray(listNode.children)) return [];
  return listNode.children.map((item: any) => listItemContent(item, source));
}

function listItemContent(item: any, source: string): string {
  if (item?.type !== 'listItem') return '';
  const children: any[] = item.children ?? [];
  const nested = children.some((c) => c.type === 'list');
  const textParts: string[] = [];
  let nestedHtml = '';
  for (const child of children) {
    if (child.type === 'list') {
      nestedHtml += listNodeToHtml(child, source);
    } else {
      textParts.push(sliceNode(child, source).trim());
    }
  }
  let text = textParts.join('\n');
  if (nested) text = inlineMarkdownToHtml(text);
  if (typeof item.checked === 'boolean') text = `[${item.checked ? 'x' : ' '}] ${text}`;
  return text + nestedHtml;
}

/**
 * Convert a mdast list node to HTML string for nested list support.
 */
function listNodeToHtml(listNode: any, source: string): string {
  const tag = listNode.ordered ? 'ol' : 'ul';
  const start = listStart(listNode);
  const open = start !== undefined ? `<ol start="${start}">` : `<${tag}>`;
  const items = (listNode.children || [])
    .map((item: any) => {
      if (item.type !== 'listItem') return '';
      const parts: string[] = [];
      for (const child of item.children || []) {
        if (child.type === 'list') parts.push(listNodeToHtml(child, source));
        else parts.push(inlineMarkdownToHtml(sliceNode(child, source).trim()));
      }
      // Several paragraphs in one nested item are joined with <br>
      const lists = parts.filter((p) => /^<(?:ul|ol)[\s>]/.test(p));
      const inline = parts.filter((p) => !/^<(?:ul|ol)[\s>]/.test(p));
      return `<li>${inline.join('<br>')}${lists.join('')}</li>`;
    })
    .join('');
  return `${open}${items}</${tag}>`;
}


