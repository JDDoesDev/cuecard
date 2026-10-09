import type { Slide, SlideElement } from '@/types/slide';

/**
 * Convert a single FLDC element to an HTML string for Tiptap to parse.
 *
 * Tiptap natively handles HTML input via its ProseMirror DOMParser,
 * so we just need to wrap the element's content in the appropriate
 * HTML structure (heading, paragraph, list).
 *
 * @param slide - FLDC slide containing the element
 * @param elementIndex - Which element to convert (default 0)
 * @returns HTML string that Tiptap can parse
 */
export function fldcToTiptap(
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
  switch (element.type) {
    case 'heading':
      return `<h${element.level}>${element.content}</h${element.level}>`;

    case 'text': {
      // If content already contains HTML block tags, pass through
      if (/<(?:p|div|table|ul|ol|h[1-6])\b/i.test(element.content)) {
        return element.content;
      }
      // Split by newlines into separate paragraphs
      const lines = element.content.split('\n');
      return lines
        .map((line) => `<p>${line || ''}</p>`)
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
            return `<li><p>${text}</p>${nestedHtml}</li>`;
          }
          return `<li><p>${item}</p></li>`;
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
