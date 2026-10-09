import type { Slide } from '../../types/presentation';
import type { SlideElement } from '../../types/slide';
import type { PhrasingContent, BlockContent } from 'mdast';

/**
 * Convert a Slide object to mdast nodes.
 * Iterates the elements array and serializes each element by type.
 * Position data is preserved via <!-- position: JSON --> comments for round-trip.
 */
export function slideToMarkdown(slide: Slide): BlockContent[] {
  const nodes: BlockContent[] = [];

  // Add transition metadata if not default
  if (slide.transition !== 'none') {
    nodes.push({
      type: 'html',
      value: `<!-- transition: ${slide.transition} -->`,
    });
  }

  // Always emit layout directive for round-trip fidelity
  nodes.push({
    type: 'html',
    value: `<!-- layout: ${slide.layout} -->`,
  });

  // Serialize based on layout for structural markers (like column-break)
  // But the actual content comes from elements
  if (slide.layout === 'two-column') {
    serializeTwoColumn(slide, nodes);
  } else {
    // For all other layouts, serialize elements in order
    for (const element of slide.elements) {
      serializeElement(element, nodes);
    }
  }

  // Add speaker notes after ??? separator
  if (slide.notes) {
    nodes.push({
      type: 'paragraph',
      children: [{ type: 'text', value: '???' }],
    });
    nodes.push({
      type: 'html',
      value: slide.notes,
    });
  }

  return nodes;
}

/**
 * Two-column layout needs special handling for the column-break marker.
 * Elements: [optional heading, left text, right text]
 */
function serializeTwoColumn(slide: Slide, nodes: BlockContent[]): void {
  const elements = slide.elements;
  let idx = 0;

  // First element might be a heading
  if (elements.length > 0 && elements[0].type === 'heading') {
    serializeElement(elements[0], nodes);
    idx = 1;
  }

  // Left content (element at idx)
  if (idx < elements.length) {
    const leftEl = elements[idx];
    if (leftEl.fragment != null) {
      nodes.push({ type: 'html', value: `<!-- fragment: ${leftEl.fragment} -->` });
    }
    if (leftEl.type === 'list' && leftEl.fragmentPerItem) {
      nodes.push({ type: 'html', value: '<!-- fragment-items -->' });
    }
    serializeElementContent(leftEl, nodes);
    nodes.push({
      type: 'html',
      value: `<!-- position: ${JSON.stringify(leftEl.position)} -->`,
    });
    idx++;
  }

  // Column separator
  nodes.push({
    type: 'html',
    value: '<!-- column-break -->',
  });

  // Right content (element at idx)
  if (idx < elements.length) {
    const rightEl = elements[idx];
    if (rightEl.fragment != null) {
      nodes.push({ type: 'html', value: `<!-- fragment: ${rightEl.fragment} -->` });
    }
    if (rightEl.type === 'list' && rightEl.fragmentPerItem) {
      nodes.push({ type: 'html', value: '<!-- fragment-items -->' });
    }
    serializeElementContent(rightEl, nodes);
    nodes.push({
      type: 'html',
      value: `<!-- position: ${JSON.stringify(rightEl.position)} -->`,
    });
  }
}

/**
 * Serialize a single element to mdast nodes, including position comment.
 */
function serializeElement(element: SlideElement, nodes: BlockContent[]): void {
  // Emit fragment directives before the element content
  if (element.fragment != null) {
    nodes.push({
      type: 'html',
      value: `<!-- fragment: ${element.fragment} -->`,
    });
  }
  if (element.type === 'list' && element.fragmentPerItem) {
    nodes.push({
      type: 'html',
      value: '<!-- fragment-items -->',
    });
  }

  serializeElementContent(element, nodes);

  // Position data as HTML comment for round-trip
  nodes.push({
    type: 'html',
    value: `<!-- position: ${JSON.stringify(element.position)} -->`,
  });
}

/**
 * Serialize element content (without position comment).
 */
function serializeElementContent(element: SlideElement, nodes: BlockContent[]): void {
  switch (element.type) {
    case 'heading':
      nodes.push({
        type: 'heading',
        depth: element.level as 1 | 2 | 3 | 4 | 5 | 6,
        children: [{ type: 'text', value: element.content }],
      });
      break;

    case 'text':
      nodes.push({
        type: 'paragraph',
        children: [{ type: 'text', value: element.content }],
      });
      break;

    case 'list':
      nodes.push({
        type: 'list',
        ordered: element.ordered,
        spread: false,
        children: element.items.map((item) => ({
          type: 'listItem' as const,
          spread: false,
          children: [
            {
              type: 'paragraph' as const,
              children: [{ type: 'text' as const, value: item }],
            },
          ],
        })),
      });
      break;

    case 'code':
      nodes.push({
        type: 'code',
        lang: element.language,
        value: element.code,
      });
      break;

    case 'image':
      nodes.push({
        type: 'paragraph',
        children: [
          {
            type: 'image',
            url: element.url,
            alt: element.alt || '',
          } as PhrasingContent,
        ],
      });
      break;

    case 'video':
      // Videos serialize as image markdown (same syntax, different URL extension)
      nodes.push({
        type: 'paragraph',
        children: [
          {
            type: 'image',
            url: element.url,
            alt: '',
          } as PhrasingContent,
        ],
      });
      break;

    case 'html':
      nodes.push({
        type: 'html',
        value: element.htmlContent,
      });
      break;

    case 'rectangle':
    case 'circle':
    case 'line': {
      // Shapes have no direct markdown representation, so serialize as HTML comment
      // This preserves the data for round-trip
      const shapeData: Record<string, any> = {
        type: element.type,
      };
      if ('fill' in element && element.fill) shapeData.fill = element.fill;
      if (element.stroke) shapeData.stroke = element.stroke;
      if (element.strokeWidth) shapeData.strokeWidth = element.strokeWidth;
      if ('cornerRadius' in element && element.cornerRadius) {
        shapeData.cornerRadius = element.cornerRadius;
      }
      nodes.push({
        type: 'html',
        value: `<!-- shape: ${JSON.stringify(shapeData)} -->`,
      });
      break;
    }
  }
}
