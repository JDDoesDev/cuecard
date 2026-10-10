import type { Root, Content } from 'mdast';
import type { Plugin } from 'unified';
import type { Slide } from '@/types/slide';
import type { ElementPosition } from '@/types/slide';
import { buildSlideElements, isValidLayout, parsePosition, type SlideItem } from './inferLayout';
import { isOnlyComments, parseDirectives } from './directives';

const TRANSITIONS = ['fade', 'slide', 'zoom', 'none'] as const;
type Transition = (typeof TRANSITIONS)[number];

/**
 * Custom remark plugin that splits markdown AST by thematicBreak (---) nodes
 * and converts each section into a slide object (attached as `file.data.slides`).
 *
 * The original markdown source must be available as `file.value` so that
 * text content and speaker notes can be taken verbatim from the source.
 * Non-fatal problems are collected in `file.data.warnings`.
 */
export const remarkSlidePlugin: Plugin<[], Root> = function () {
  return (tree, file) => {
    const source = typeof file.value === 'string' ? file.value : String(file.value ?? '');
    const warnings: string[] = Array.isArray(file.data.warnings) ? (file.data.warnings as string[]) : [];
    file.data.warnings = warnings;
    file.data.slides = splitSlides(tree, source, warnings);
  };
};

/**
 * Split a parsed markdown tree into slides.
 *
 * @param tree - mdast root parsed from `source`
 * @param source - the exact markdown string that was parsed
 * @param warnings - collector for non-fatal problems (bad directive values, ...)
 */
export function splitSlides(tree: Root, source: string, warnings: string[]): Slide[] {
  const slides: Slide[] = [];
  let current: Content[] = [];

  const flush = (endOffset: number) => {
    if (current.length > 0) {
      slides.push(createSlide(current, endOffset, source, warnings));
      current = [];
    }
  };

  for (const node of tree.children) {
    if (node.type === 'yaml') continue; // frontmatter handled separately
    if (node.type === 'thematicBreak') {
      flush(node.position?.start.offset ?? source.length);
    } else {
      current.push(node);
    }
  }
  flush(source.length);

  return slides;
}

function nodeStart(node: Content): number | undefined {
  return node.position?.start.offset;
}

function nodeEnd(node: Content): number | undefined {
  return node.position?.end.offset;
}

/** Strip leading blank lines and trailing whitespace from a block of source (linear time). */
function trimBlock(text: string): string {
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '\n') start = i + 1;
    else if (c !== ' ' && c !== '\t') break;
  }
  return text.slice(start).trimEnd();
}

/**
 * If `node` is a `???` notes separator paragraph, return the source offset where
 * the notes begin (the separator may be directly followed by notes text on
 * the next line, without a blank line). Otherwise null.
 */
function notesSeparatorEnd(node: Content, source: string): number | null {
  if (node.type !== 'paragraph') return null;
  const start = nodeStart(node);
  const end = nodeEnd(node);
  if (start === undefined || end === undefined || !source) {
    const children = (node as any).children ?? [];
    const isSep = children.length === 1 && children[0].type === 'text' && children[0].value.trim() === '???';
    return isSep ? (end ?? 0) : null;
  }
  const text = source.slice(start, end);
  const newline = text.indexOf('\n');
  const firstLine = newline === -1 ? text : text.slice(0, newline);
  if (firstLine.trim() !== '???') return null;
  return newline === -1 ? end : start + newline + 1;
}

/** Source slice of a node (or node range) including leading indentation on its first line. */
function verbatimSlice(node: Content, source: string, last: Content = node): string {
  const start = nodeStart(node);
  const end = nodeEnd(last);
  if (start === undefined || end === undefined) return '';
  let lineStart = start;
  while (lineStart > 0 && (source[lineStart - 1] === ' ' || source[lineStart - 1] === '\t')) lineStart--;
  return source.slice(lineStart === 0 || source[lineStart - 1] === '\n' ? lineStart : start, end);
}

type SegmentItem = Extract<SlideItem, { kind: 'segment' }>;

/**
 * Create a slide object from an array of AST nodes.
 */
function createSlide(nodes: Content[], endOffset: number, source: string, warnings: string[]): Slide {
  let transition: Transition = 'none';
  let explicitLayout: string | undefined;
  const notesParts: string[] = [];

  // Speaker notes after a `???` separator are taken verbatim from the source.
  let contentNodes = nodes;
  let separatorNotes: string | undefined;
  for (let i = 0; i < nodes.length; i++) {
    const notesStart = notesSeparatorEnd(nodes[i], source);
    if (notesStart !== null) {
      contentNodes = nodes.slice(0, i);
      if (source) separatorNotes = trimBlock(source.slice(notesStart, endOffset));
      break;
    }
  }

  const items: SlideItem[] = [];
  let segment: SegmentItem | null = null;
  let lastContent: Extract<SlideItem, { kind: 'node' | 'shape' }> | null = null;
  let pendingFragment: number | undefined;
  let pendingFragmentItems = false;
  let pendingPosition: ElementPosition | undefined;

  const applyPending = (item: Extract<SlideItem, { kind: 'node' | 'shape' }>) => {
    if (pendingFragment !== undefined) item.fragment = pendingFragment;
    if (pendingFragmentItems && item.kind === 'node') item.fragmentPerItem = true;
    if (pendingPosition) item.position = pendingPosition;
    pendingFragment = undefined;
    pendingFragmentItems = false;
    pendingPosition = undefined;
  };

  contentNodes.forEach((node) => {
    const htmlValue = node.type === 'html' ? ((node as any).value ?? '') : '';
    const directives = node.type === 'html' ? parseDirectives(htmlValue) : null;

    if (!directives) {
      // The first node after an element directive is that element's body.
      if (segment && segment.nodes.length === 0) {
        segment.nodes.push(node);
        segment.body = verbatimSlice(node, source);
        return;
      }
      // Plain HTML comments (author notes, other tools' directives such as
      // Marp's `<!-- _class: lead -->`) are not slide content.
      if (node.type === 'html' && isOnlyComments(htmlValue)) return;
      // Rich-text bodies (editor HTML exported as markdown, see
      // richTextMarkdown.ts) span every block up to the next directive.
      // Only paragraphs and tables (all the rich form produces) are absorbed;
      // anything else (hand-added headings, lists…) becomes its own element.
      if (
        segment &&
        segment.extra.length === 0 &&
        segment.props?.type === 'text' &&
        segment.props.richText === true &&
        !Object.hasOwn(segment.props, 'content') &&
        (node.type === 'paragraph' || node.type === 'table')
      ) {
        segment.body = verbatimSlice(segment.nodes[0], source, node);
        segment.nodes.push(node);
        return;
      }
      if (segment) {
        // Content added after an element body (e.g. hand edits) becomes its own element.
        segment.extra.push(node);
        return;
      }
      const item: Extract<SlideItem, { kind: 'node' }> = { kind: 'node', node };
      applyPending(item);
      items.push(item);
      lastContent = item;
      return;
    }

    for (const { name, arg } of directives) {
      switch (name) {
        case 'element': {
          let props: Record<string, unknown> | null = null;
          try {
            const parsed = JSON.parse(arg);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) props = parsed;
          } catch {
            // handled below
          }
          if (!props) warnings.push(`Invalid element directive ignored: ${arg.slice(0, 80)}`);
          // `<!-- fragment: N -->` / `<!-- fragment-items -->` may precede an element directive
          if (props && pendingFragment !== undefined && props.fragment === undefined) {
            props.fragment = pendingFragment;
          }
          if (props && pendingFragmentItems && props.fragmentPerItem === undefined) {
            props.fragmentPerItem = true;
          }
          pendingFragment = undefined;
          pendingFragmentItems = false;
          pendingPosition = undefined;
          segment = { kind: 'segment', props, nodes: [], body: '', extra: [] };
          items.push(segment);
          lastContent = null;
          break;
        }
        case 'layout':
          if (isValidLayout(arg)) explicitLayout = arg;
          else warnings.push(`Unknown layout "${arg}" ignored; layout will be inferred.`);
          break;
        case 'transition':
          if ((TRANSITIONS as readonly string[]).includes(arg)) transition = arg as Transition;
          else warnings.push(`Unknown transition "${arg}" ignored.`);
          break;
        case 'notes':
          if (arg) notesParts.push(arg);
          break;
        case 'notes-data':
          try {
            const value = JSON.parse(arg);
            if (typeof value === 'string') notesParts.push(value);
            else warnings.push('Invalid notes-data directive ignored.');
          } catch {
            warnings.push('Invalid notes-data directive ignored.');
          }
          break;
        case 'fragment':
          if (/^\d+$/.test(arg)) pendingFragment = parseInt(arg, 10);
          else warnings.push(`Invalid fragment "${arg}" ignored.`);
          break;
        case 'fragment-items':
          pendingFragmentItems = true;
          break;
        case 'position': {
          let pos: ElementPosition | undefined;
          try {
            pos = parsePosition(JSON.parse(arg));
          } catch {
            pos = undefined;
          }
          if (!pos) {
            warnings.push(`Invalid position directive ignored: ${arg.slice(0, 80)}`);
            break;
          }
          if (segment) {
            warnings.push('Position directive inside an element block ignored (use the element directive).');
            break;
          }
          // A position directive applies to the element it FOLLOWS (legacy
          // export format). Only before the first element of a slide (or
          // column) does it apply to the next element instead.
          if (lastContent) {
            if (lastContent.position) warnings.push('Element has more than one position directive; the last one wins.');
            lastContent.position = pos;
          } else {
            pendingPosition = pos;
          }
          break;
        }
        case 'column-break':
          segment = null;
          lastContent = null;
          items.push({ kind: 'column-break' });
          break;
        case 'shape': {
          let data: Record<string, unknown> | null = null;
          try {
            const parsed = JSON.parse(arg);
            if (parsed && typeof parsed === 'object' && ['rectangle', 'circle', 'line'].includes(parsed.type)) {
              data = parsed;
            }
          } catch {
            // handled below
          }
          if (!data) {
            warnings.push(`Invalid shape directive ignored: ${arg.slice(0, 80)}`);
            break;
          }
          segment = null;
          const item: Extract<SlideItem, { kind: 'shape' }> = { kind: 'shape', data };
          applyPending(item);
          items.push(item);
          lastContent = item;
          break;
        }
      }
    }
  });

  if (separatorNotes) notesParts.push(separatorNotes);

  const inference = buildSlideElements(items, explicitLayout, source, warnings);

  const slide: Slide = {
    id: crypto.randomUUID(),
    layout: inference.layout,
    transition,
    elements: inference.elements,
  };
  if (notesParts.length > 0) slide.notes = notesParts.join('\n\n');
  return slide;
}
