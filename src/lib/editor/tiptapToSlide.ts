import type { Slide, SlideElement } from '@/types/slide';
import {
  normalizeTextAlign,
  withElementTextAlign,
  collapseBlockAlignment,
  serializeTextBody,
} from './textAlign';
import { normalizeListItem } from './listItems';

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
      // Clear-formatting can turn the heading into a paragraph — keep its text
      const heading =
        doc.querySelector<HTMLElement>('h1, h2, h3, h4, h5, h6') ??
        (doc.body.firstElementChild as HTMLElement | null);
      return withElementTextAlign(
        { ...original, content: heading?.innerHTML || '' },
        normalizeTextAlign(heading?.style.textAlign)
      );
    }

    case 'text': {
      // Keep every top-level block (paragraphs, lists, tables…), not just <p>.
      // Uniform alignment moves to the element; mixed alignment stays in HTML.
      const blocks = Array.from(doc.body.children) as HTMLElement[];
      const { uniform, align } = collapseBlockAlignment(blocks);
      const content = serializeTextBody(doc.body);
      return withElementTextAlign({ ...original, content }, uniform ? align : undefined);
    }

    case 'list': {
      const topList = doc.querySelector('ul, ol');
      if (!topList) {
        // List was converted to paragraphs (e.g. clear formatting): keep the text
        const paragraphs = Array.from(doc.body.querySelectorAll<HTMLElement>(':scope > p'));
        const firstAlign = normalizeTextAlign(paragraphs[0]?.style.textAlign);
        return withElementTextAlign(
          { ...original, items: paragraphs.map((p) => p.innerHTML) },
          firstAlign
        );
      }
      // Only select direct child <li> elements (not nested ones)
      const topItems = Array.from(topList.children).filter(
        (child) => child.tagName === 'LI'
      );
      const itemAligns: Array<string | undefined> = [];
      const items = topItems.map((li) => {
        // Extract the text content (from <p> tags; several are joined with
        // <br>) and any nested lists separately
        const paragraphs: string[] = [];
        const lists: string[] = [];
        let itemAlign: string | undefined;
        for (const child of Array.from(li.children) as HTMLElement[]) {
          if (child.tagName === 'UL' || child.tagName === 'OL') {
            lists.push(child.outerHTML);
          } else {
            itemAlign ??= normalizeTextAlign(child.style.textAlign) ?? '';
            paragraphs.push(child.innerHTML);
          }
        }
        itemAligns.push(itemAlign || undefined);
        return normalizeListItem((paragraphs.join('<br>') + lists.join('')).trim());
      });
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
      return withElementTextAlign(updated, majorityAlign(itemAligns, original));
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

/** Most common item alignment; on a tie prefer a value different from the current one. */
function majorityAlign(aligns: Array<string | undefined>, original: SlideElement): string | undefined {
  if (aligns.length === 0) return undefined;
  const counts = new Map<string, number>();
  for (const a of aligns) counts.set(a ?? 'left', (counts.get(a ?? 'left') ?? 0) + 1);
  const previous = (original as { textAlign?: string }).textAlign ?? 'left';
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
