import type { Slide, SlideElement } from '@/types/slide';
import {
  normalizeTextAlign,
  withElementTextAlign,
  collapseBlockAlignment,
  serializeTextBody,
} from './textAlign';
import { normalizeListItem } from './listItems';
import { canonicalizeTables, dropTrailingParagraphAfterTable } from './tables';
import { normalizeLineHeight } from './blockFormat';

/**
 * Convert Tiptap HTML output back to an updated slide.
 *
 * Uses DOMParser to reliably extract content from Tiptap's HTML,
 * then updates only the specified element while preserving all
 * other fields (id, position, layout, notes, etc.).
 *
 * @param html - HTML string from editor.getHTML()
 * @param originalSlide - Original slide
 * @param elementIndex - Which element was edited
 * @returns Updated slide
 */
export function tiptapToSlide(
  html: string,
  originalSlide: Slide,
  elementIndex: number = 0
): Slide {
  const element = originalSlide.elements[elementIndex];

  if (!element) {
    return originalSlide;
  }

  const updatedElement = htmlToElement(html, element);

  const updatedElements = [...originalSlide.elements];
  updatedElements[elementIndex] = updatedElement;

  return {
    ...originalSlide,
    elements: updatedElements,
  };
}

/** rel that Tiptap's Link extension adds to every link by default. */
const TIPTAP_LINK_REL = 'noopener noreferrer nofollow';

/**
 * Parse Tiptap HTML and extract content for the given element type.
 */
function htmlToElement(html: string, original: SlideElement): SlideElement {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  // Link normalization: Tiptap's Link extension stamps its default
  // target="_blank" rel="noopener noreferrer nofollow" on every link. Only that
  // exact default pair is removed, so stored links are a plain <a href> that
  // exports as a markdown [text](url); ElementRenderer adds target/rel to
  // external links at render time. Any other target/rel value is kept.
  for (const a of Array.from(doc.querySelectorAll('a'))) {
    if (a.getAttribute('target') === '_blank' && a.getAttribute('rel') === TIPTAP_LINK_REL) {
      a.removeAttribute('target');
      a.removeAttribute('rel');
    }
  }

  switch (original.type) {
    case 'heading': {
      // A heading element is one block. Clear-formatting / Enter / paste can
      // leave several blocks (or a paragraph): never drop text, join with <br>.
      const blocks = (Array.from(doc.body.children) as HTMLElement[]).filter((b) => !isEmptyBlock(b));
      const first =
        blocks.find((b) => /^H[1-6]$/.test(b.tagName)) ?? blocks[0] ?? (doc.body.firstElementChild as HTMLElement | null);
      const content = blocks.length > 0 ? blocks.map(blockInlineHtml).join('<br>') : stripTrailingBreaks(first?.innerHTML ?? '');
      // A heading is a single block: its line height is the element's
      return withElementLineHeight(
        withElementTextAlign({ ...original, content }, normalizeTextAlign(first?.style.textAlign)),
        normalizeLineHeight(first?.style.lineHeight)
      );
    }

    case 'text': {
      // Keep every top-level block (paragraphs, lists, tables…), not just <p>.
      // Uniform alignment moves to the element; mixed alignment stays in HTML.
      // Per-block line height / indent stay in the HTML (block overrides element).
      canonicalizeTables(doc.body);
      dropTrailingParagraphAfterTable(doc.body);
      const blocks = Array.from(doc.body.children) as HTMLElement[];
      const { uniform, align } = collapseBlockAlignment(blocks);
      const content = serializeTextBody(doc.body);
      return withElementTextAlign({ ...original, content }, uniform ? align : undefined);
    }

    case 'list': {
      // Every top-level block becomes item(s) so nothing is ever dropped:
      // Backspace at the start of the first item lifts it out of the list,
      // paste can bring paragraphs, and deletes can split the list in two.
      // Lists are merged in order (nested structure kept); paragraphs and
      // headings around/between them become items with their inline HTML.
      let topList: HTMLElement | null = null;
      const entries: Array<{ html: string; block: HTMLElement }> = [];
      for (const block of Array.from(doc.body.children) as HTMLElement[]) {
        if (block.tagName === 'UL' || block.tagName === 'OL') {
          topList ??= block;
          for (const li of Array.from(block.children) as HTMLElement[]) {
            if (li.tagName === 'LI') entries.push({ html: '', block: li });
          }
        } else if (!isEmptyBlock(block)) {
          entries.push({ html: blockInlineHtml(block), block });
        }
      }
      const itemAligns: Array<string | undefined> = [];
      const itemLineHeights: Array<number | undefined> = [];
      const items = entries.map(({ html, block }) => {
        if (block.tagName !== 'LI') {
          itemAligns.push(normalizeTextAlign(block.style.textAlign));
          itemLineHeights.push(normalizeLineHeight(block.style.lineHeight) ?? undefined);
          return html;
        }
        const li = block;
        // Extract the text content (from <p> tags; several are joined with
        // <br>) and any nested lists separately
        const paragraphs: string[] = [];
        const lists: string[] = [];
        let itemAlign: string | undefined;
        let itemLineHeight: number | null | undefined;
        for (const child of Array.from(li.children) as HTMLElement[]) {
          if (child.tagName === 'UL' || child.tagName === 'OL') {
            lists.push(child.outerHTML);
          } else {
            itemAlign ??= normalizeTextAlign(child.style.textAlign) ?? '';
            if (itemLineHeight === undefined) itemLineHeight = normalizeLineHeight(child.style.lineHeight);
            paragraphs.push(stripTrailingBreaks(child.innerHTML));
          }
        }
        itemAligns.push(itemAlign || undefined);
        itemLineHeights.push(itemLineHeight ?? undefined);
        return normalizeListItem((paragraphs.join('<br>') + lists.join('')).trim());
      });
      if (!topList) {
        // No list left (e.g. clear formatting): keep the text, list type unchanged
        return withElementTextAlign({ ...original, items }, itemAligns[0]);
      }
      const ordered = topList.tagName === 'OL';
      const start = ordered ? parseInt(topList.getAttribute('start') ?? '', 10) : NaN;
      const { start: _previousStart, ...rest } = original;
      const updated = {
        ...rest,
        items,
        ordered,
        ...(Number.isInteger(start) && start >= 0 && start !== 1 && { start }),
      };
      // Lists have one alignment for the whole element: use the majority
      // alignment of the items (ties go to the most recently changed value,
      // i.e. not the element's previous alignment)
      const aligned = withElementTextAlign(updated, majorityAlign(itemAligns, original));
      // Line height is element-level for lists too (same majority rule)
      const lineHeights = itemLineHeights.map((v) => (v === undefined ? undefined : String(v)));
      const previousLineHeight = original.lineHeight === undefined ? 'none' : String(original.lineHeight);
      const lineHeight = majority(lineHeights.map((v) => v ?? 'none'), previousLineHeight);
      if (lineHeight === undefined) return aligned;
      return withElementLineHeight(aligned, lineHeight === 'none' ? null : Number(lineHeight));
    }

    case 'code': {
      const codeBlock = doc.querySelector('pre code, code');
      const code = codeBlock?.textContent ?? '';
      return { ...original, code };
    }

    case 'image': {
      const paragraph = doc.querySelector('p');
      const url = paragraph?.textContent ?? original.url;
      return { ...original, url };
    }

    case 'video': {
      const paragraph = doc.querySelector('p');
      const url = paragraph?.textContent ?? original.url;
      return { ...original, url };
    }

    case 'html':
      return { ...original, htmlContent: doc.body.innerHTML || '' };

    case 'rectangle':
    case 'circle':
    case 'line':
      return original;
  }
}

/** Paragraph/heading with no content (Tiptap's empty or trailing block). */
function isEmptyBlock(block: HTMLElement): boolean {
  return /^(?:P|H[1-6])$/.test(block.tagName) && stripTrailingBreaks(block.innerHTML).trim() === '';
}

/** Remove hard breaks at the end of inline HTML (`Hi<br>` from Enter / Shift-Enter). */
function stripTrailingBreaks(html: string): string {
  return html.replace(/(?:\s*<br\s*\/?>)+\s*$/i, '');
}

/** Inline HTML of a block; nested blocks (blockquote, table…) are joined with <br>. */
function blockInlineHtml(block: HTMLElement): string {
  const blockChildren = (Array.from(block.children) as HTMLElement[]).filter((c) =>
    /^(?:P|H[1-6]|DIV|BLOCKQUOTE|UL|OL|LI|TABLE|TBODY|THEAD|TR|TD|TH|PRE)$/.test(c.tagName)
  );
  if (blockChildren.length === 0) return stripTrailingBreaks(block.innerHTML);
  return blockChildren.map(blockInlineHtml).filter((h) => h.trim() !== '').join('<br>');
}

/** Return a copy of `el` with the element-level line height set (null removes it). */
function withElementLineHeight<T extends SlideElement>(el: T, lineHeight: number | null): T {
  const copy = { ...el } as T & { lineHeight?: number };
  if (lineHeight != null) copy.lineHeight = lineHeight;
  else delete copy.lineHeight;
  return copy;
}

/** Most common item alignment; on a tie prefer a value different from the current one. */
function majorityAlign(aligns: Array<string | undefined>, original: SlideElement): string | undefined {
  const previous = (original as { textAlign?: string }).textAlign ?? 'left';
  return majority(aligns.map((a) => a ?? 'left'), previous);
}

/** Most common value; on a tie prefer a value different from `previous`. */
function majority(values: string[], previous: string): string | undefined {
  if (values.length === 0) return undefined;
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best = previous;
  let bestCount = counts.get(previous) ?? 0;
  for (const [align, count] of counts) {
    if (count > bestCount || (count === bestCount && align !== previous)) {
      best = align;
      bestCount = count;
    }
  }
  return best;
}
