import type { Slide, SlideElement } from '@/types/slide';

/**
 * Convert Tiptap HTML output back to an updated FLDC slide.
 *
 * Uses DOMParser to reliably extract content from Tiptap's HTML,
 * then updates only the specified element while preserving all
 * other fields (id, position, layout, notes, etc.).
 *
 * @param html - HTML string from editor.getHTML()
 * @param originalSlide - Original FLDC slide
 * @param elementIndex - Which element was edited
 * @returns Updated FLDC slide
 */
export function tiptapToFldc(
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

/**
 * Parse Tiptap HTML and extract content for the given element type.
 */
function htmlToElement(html: string, original: SlideElement): SlideElement {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  switch (original.type) {
    case 'heading': {
      const heading = doc.querySelector('h1, h2, h3, h4, h5, h6');
      return { ...original, content: heading?.innerHTML || '' };
    }

    case 'text': {
      const paragraphs = doc.querySelectorAll('body > p');
      if (paragraphs.length > 0) {
        const content = Array.from(paragraphs)
          .map((p) => p.innerHTML)
          .join('\n');
        return { ...original, content };
      }
      // Fallback: use body innerHTML (handles content with block elements)
      return { ...original, content: doc.body.innerHTML || '' };
    }

    case 'list': {
      const topList = doc.querySelector('ul, ol');
      if (!topList) return { ...original, items: [], ordered: false };
      // Only select direct child <li> elements (not nested ones)
      const topItems = Array.from(topList.children).filter(
        (child) => child.tagName === 'LI'
      );
      const items = topItems.map((li) => {
        // Extract the text content (from <p> tags) and any nested lists separately
        const parts: string[] = [];
        for (const child of Array.from(li.children)) {
          if (child.tagName === 'UL' || child.tagName === 'OL') {
            parts.push(child.outerHTML);
          } else {
            parts.push(child.innerHTML);
          }
        }
        return parts.join('').trim();
      });
      const ordered = topList.tagName === 'OL';
      return { ...original, items, ordered };
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
