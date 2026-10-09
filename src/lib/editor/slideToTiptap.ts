import type { Slide, SlideElement } from '@/types/slide';
import {
  getElementTextAlign,
  textAlignStyleAttr,
  hasBlockHtml,
  applyAlignToBlocks,
} from './textAlign';

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
      return `<h${element.level}${alignAttr}>${element.content}</h${element.level}>`;

    case 'text': {
      // If content already contains HTML block tags, pass through
      if (hasBlockHtml(element.content)) {
        if (!alignAttr || typeof DOMParser === 'undefined') return element.content;
        const doc = new DOMParser().parseFromString(element.content, 'text/html');
        applyAlignToBlocks(doc.body, align);
        return doc.body.innerHTML;
      }
      // Markdown source: blank lines separate paragraphs; a single newline is a
      // soft break (rendered as a space) unless the lines are markdown block
      // structure (lists, tables, quotes, headings), which keep one line each.
      const blockMarker = /^\s*(?:[-*+]\s|\d+[.)]\s|\||>|#)/;
      const paragraphs = element.content.split(/\n{2,}/).flatMap((chunk) => {
        const lines = chunk.split('\n');
        return lines.some((l) => blockMarker.test(l)) ? lines : [lines.join(' ')];
      });
      return paragraphs
        .map((line) => `<p${alignAttr}>${line || ''}</p>`)
        .join('');
    }

    case 'list': {
      const tag = element.ordered ? 'ol' : 'ul';
      const items = element.items
        .map((item) => {
          // If item contains nested list HTML, separate the text from the nested list
          const nestedListMatch = item.match(/^(.*?)(<[ou]l>[\s\S]*)$/i);
          if (nestedListMatch) {
            const text = nestedListMatch[1];
            const nestedHtml = nestedListMatch[2];
            return `<li><p${alignAttr}>${text}</p>${nestedHtml}</li>`;
          }
          return `<li><p${alignAttr}>${item}</p></li>`;
        })
        .join('');
      return `<${tag}>${items}</${tag}>`;
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
