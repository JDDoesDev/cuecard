import type { Slide, SlideElement } from '@/types/slide';
import {
  getElementTextAlign,
  textAlignStyleAttr,
  hasBlockHtml,
  applyAlignToBlocks,
} from './textAlign';
import { inlineContentToHtml, splitListItem } from './listItems';
import { markdownToEditorHtml } from './markdownToHtml';
import { normalizeLineHeight } from './blockFormat';

/** ` style="text-align: …; line-height: …"` for a single-block element ('' when neither). */
function blockStyleAttr(align: string, lineHeight: number | undefined): string {
  const parts: string[] = [];
  const alignAttr = textAlignStyleAttr(align);
  if (alignAttr) parts.push(alignAttr.slice(' style="'.length, -1));
  const lh = normalizeLineHeight(lineHeight);
  if (lh != null) parts.push(`line-height: ${lh}`);
  return parts.length > 0 ? ` style="${parts.join('; ')}"` : '';
}

/**
 * Convert a single slide element to an HTML string for Tiptap to parse.
 *
 * Tiptap natively handles HTML input via its ProseMirror DOMParser,
 * so we just need to wrap the element's content in the appropriate
 * HTML structure (heading, paragraph, list).
 *
 * @param slide - slide containing the element
 * @param elementIndex - Which element to convert (default 0)
 * @returns HTML string that Tiptap can parse
 */
export function slideToTiptap(
  slide: Slide,
  elementIndex: number = 0
): string {
  const element = slide.elements[elementIndex];

  if (!element) {
    return '<p></p>';
  }

  return elementToHTML(element);
}

/**
 * Convert a single SlideElement to an HTML string.
 */
export function elementToHTML(element: SlideElement): string {
  // Element-level alignment is expanded onto every block so Tiptap shows it
  const align = getElementTextAlign(element);
  const alignAttr = textAlignStyleAttr(align);

  switch (element.type) {
    case 'heading':
      // Element-level line height is shown as the heading block's line height
      return `<h${element.level}${blockStyleAttr(align, element.lineHeight)}>${inlineContentToHtml(element.content)}</h${element.level}>`;

    case 'text': {
      // Editor HTML passes through; markdown source (from import) is converted
      // the way ElementRenderer renders it, so its formatting is kept
      const html = hasBlockHtml(element.content)
        ? element.content
        : markdownToEditorHtml(element.content) || '<p></p>';
      if (!alignAttr || typeof DOMParser === 'undefined') return html;
      const doc = new DOMParser().parseFromString(html, 'text/html');
      applyAlignToBlocks(doc.body, align);
      return doc.body.innerHTML;
    }

    case 'list': {
      const itemAttr = blockStyleAttr(align, element.lineHeight);
      const tag = element.ordered ? 'ol' : 'ul';
      const start = Number(element.start);
      const startAttr = element.ordered && Number.isInteger(start) && start >= 0 && start !== 1
        ? ` start="${start}"`
        : '';
      const items = element.items
        .map((item) => {
          // Separate the item's own text from its nested sub-lists
          const { text, nested } = splitListItem(item);
          return `<li><p${itemAttr}>${inlineContentToHtml(text)}</p>${nested}</li>`;
        })
        .join('');
      return `<${tag}${startAttr}>${items}</${tag}>`;
    }

    case 'code':
      return `<pre><code>${escapeHTML(element.code)}</code></pre>`;

    case 'image':
      return `<p>${escapeHTML(element.url)}</p>`;

    case 'video':
      return `<p>${escapeHTML(element.url)}</p>`;

    case 'html':
      return element.htmlContent;

    case 'rectangle':
    case 'circle':
    case 'line':
      return '<p></p>';
  }
}

function escapeHTML(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
