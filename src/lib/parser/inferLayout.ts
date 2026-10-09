import type { Content } from 'mdast';
import type { LayoutPreset, SlideElement } from '@/types/slide';
import { LAYOUTS } from '@/types/slide';

/**
 * Layout inference result containing the detected layout type and elements array
 */
export interface LayoutInference {
  layout: LayoutPreset;
  elements: SlideElement[];
}

/**
 * Infers the slide layout from an array of mdast nodes using heuristics,
 * and creates positioned elements using preset defaults.
 *
 * Heuristic rules (in order):
 * 0. Column-break marker present -> 'two-column'
 * 1. H1 only or H1 + single paragraph -> 'title'
 * 2. H1/H2 + list -> 'title-list'
 * 3. Code block present -> 'code-block'
 * 4. Single image, no other content -> 'full-bleed-media'
 * 5. Image + text content -> 'media-anywhere'
 * 6. Default fallback -> 'freestyle'
 *
 * @param nodes - mdast nodes for the slide
 * @param positionData - extracted position data from HTML comments
 * @param explicitLayout - optional explicit layout from `<!-- layout: X -->` directive
 */
export function inferLayout(nodes: Content[], positionData: any[] = [], explicitLayout?: string): LayoutInference {
  // If an explicit layout is provided and valid, use it directly
  if (explicitLayout && (LAYOUTS as readonly string[]).includes(explicitLayout)) {
    return buildElementsForLayout(explicitLayout as LayoutPreset, nodes, positionData);
  }
  if (nodes.length === 0) {
    return { layout: 'freestyle', elements: [] };
  }

  // Check for two-column marker first
  const columnBreakIndex = nodes.findIndex(
    (n) => n.type === 'html' && (n as any).value?.includes('<!-- column-break -->')
  );

  if (columnBreakIndex !== -1) {
    return inferTwoColumn(nodes, columnBreakIndex, positionData);
  }

  // Count node types
  const headings = nodes.filter((n) => n.type === 'heading');
  const lists = nodes.filter((n) => n.type === 'list');
  const codeBlocks = nodes.filter((n) => n.type === 'code');
  const images = nodes.filter((n) => n.type === 'paragraph' && n.children?.some((c) => c.type === 'image'));
  const paragraphs = nodes.filter((n) => n.type === 'paragraph');

  // Rule 3: Code block present -> 'code-block'
  if (codeBlocks.length > 0) {
    return inferCodeBlock(nodes, headings, codeBlocks, paragraphs, positionData);
  }

  // Rule 4: Single image, no other content -> 'full-bleed-media'
  if (images.length === 1 && nodes.length === 1) {
    const imageNode = findFirstImage(nodes[0]);
    if (imageNode) {
      return inferFullBleedMedia(imageNode, positionData, nodes[0]);
    }
  }

  // Rule 5: Image + other content -> 'media-anywhere'
  if (images.length > 0) {
    const imageParagraph = nodes.find((n) => n.type === 'paragraph' && n.children?.some((c: any) => c.type === 'image'));
    const imageNode = findFirstImage(imageParagraph);
    const contentNodes = nodes.filter((n) => n.type !== 'paragraph' || !n.children?.some((c: any) => c.type === 'image'));

    if (imageNode) {
      return inferMediaAnywhere(contentNodes, imageNode, positionData, imageParagraph);
    }
  }

  // Rule 2: H1/H2 + list -> 'title-list'
  if (headings.length > 0 && lists.length > 0) {
    return inferTitleList(headings, lists, positionData);
  }

  // Rule 1: H1 only or H1 + single paragraph -> 'title'
  if (headings.length > 0 && headings[0].type === 'heading' && (headings[0] as any).depth === 1) {
    return inferTitle(headings, paragraphs, positionData);
  }

  // If we have H2 without list, treat as title too
  if (headings.length > 0) {
    return inferTitle(headings, paragraphs, positionData);
  }

  // Rule 6: Default fallback -> 'freestyle'
  return inferFreestyle(nodes, positionData);
}

// ============================================================================
// Explicit Layout Builder
// ============================================================================

/**
 * Build elements for an explicitly-specified layout, reusing the same
 * inference helpers that heuristic detection uses for positioning.
 */
function buildElementsForLayout(layout: LayoutPreset, nodes: Content[], positionData: any[]): LayoutInference {
  if (nodes.length === 0) {
    return { layout, elements: [] };
  }

  const headings = nodes.filter((n) => n.type === 'heading');
  const lists = nodes.filter((n) => n.type === 'list');
  const codeBlocks = nodes.filter((n) => n.type === 'code');
  const paragraphs = nodes.filter((n) => n.type === 'paragraph');

  switch (layout) {
    case 'two-column': {
      const columnBreakIndex = nodes.findIndex(
        (n) => n.type === 'html' && (n as any).value?.includes('<!-- column-break -->')
      );
      if (columnBreakIndex !== -1) {
        return inferTwoColumn(nodes, columnBreakIndex, positionData);
      }
      // No column-break marker — fall through to freestyle-style elements with two-column layout
      return { layout: 'two-column', elements: inferFreestyle(nodes, positionData).elements };
    }
    case 'code-block':
      if (codeBlocks.length > 0) {
        return inferCodeBlock(nodes, headings, codeBlocks, paragraphs, positionData);
      }
      // No code blocks — build elements with the layout label but freestyle content
      return { layout: 'code-block', elements: inferFreestyle(nodes, positionData).elements };
    case 'full-bleed-media': {
      const imagePara = nodes.find((n) => n.type === 'paragraph' && (n as any).children?.some((c: any) => c.type === 'image'));
      const imageNode = findFirstImageInNodes(nodes);
      if (imageNode) {
        return inferFullBleedMedia(imageNode, positionData, imagePara);
      }
      return { layout, elements: inferFreestyle(nodes, positionData).elements };
    }
    case 'media-anywhere': {
      const imageParagraph = nodes.find((n) => n.type === 'paragraph' && n.children?.some((c: any) => c.type === 'image'));
      const imageNode = findFirstImage(imageParagraph);
      const contentNodes = nodes.filter((n) => n.type !== 'paragraph' || !n.children?.some((c: any) => c.type === 'image'));
      if (imageNode) {
        return inferMediaAnywhere(contentNodes, imageNode, positionData, imageParagraph);
      }
      return { layout, elements: inferFreestyle(nodes, positionData).elements };
    }
    case 'title-list':
      if (headings.length > 0 && lists.length > 0) {
        return inferTitleList(headings, lists, positionData);
      }
      return { layout: 'title-list', elements: inferFreestyle(nodes, positionData).elements };
    case 'title':
      return inferTitle(headings.length > 0 ? headings : [nodes[0]], paragraphs, positionData);
    case 'freestyle':
      return inferFreestyle(nodes, positionData);
    case 'blank':
      return { layout: 'blank', elements: [] };
    default:
      return inferFreestyle(nodes, positionData);
  }
}

/**
 * Find the first image node across all nodes (used by explicit layout builder).
 */
function findFirstImageInNodes(nodes: Content[]): { url: string; alt?: string } | null {
  for (const node of nodes) {
    const result = findFirstImage(node);
    if (result) return result;
  }
  return null;
}

// ============================================================================
// Layout-Specific Inference Helpers
// ============================================================================

function inferTwoColumn(nodes: Content[], columnBreakIndex: number, positionData: any[]): LayoutInference {
  const beforeBreak = nodes.slice(0, columnBreakIndex);
  const afterBreak = nodes.slice(columnBreakIndex + 1);

  const titleNode = beforeBreak.find((n) => n.type === 'heading');
  const title = titleNode ? extractText(titleNode) : undefined;
  const leftNodes = titleNode ? beforeBreak.filter((n) => n !== titleNode) : beforeBreak;
  const rightNodes = afterBreak;

  const elements: SlideElement[] = [];
  let posIdx = 0;

  if (title && titleNode) {
    const headingEl: SlideElement = {
      id: crypto.randomUUID(),
      type: 'heading',
      position: positionData[posIdx] || { x: 12, y: 10, width: 76, height: 12 },
      content: title,
      level: ((titleNode as any).depth || 1) as 1 | 2 | 3 | 4 | 5 | 6,
    };
    applyFragmentData(headingEl, titleNode);
    elements.push(headingEl);
    posIdx++;
  }

  const leftEl: SlideElement = {
    id: crypto.randomUUID(),
    type: 'text',
    position: positionData[posIdx] || { x: 12, y: 26, width: 36, height: 62 },
    content: leftNodes.map(extractText).join('\n\n'),
  };
  if (leftNodes.length > 0) applyFragmentData(leftEl, leftNodes[0]);
  elements.push(leftEl);
  posIdx++;

  const rightEl: SlideElement = {
    id: crypto.randomUUID(),
    type: 'text',
    position: positionData[posIdx] || { x: 52, y: 26, width: 36, height: 62 },
    content: rightNodes.map(extractText).join('\n\n'),
  };
  if (rightNodes.length > 0) applyFragmentData(rightEl, rightNodes[0]);
  elements.push(rightEl);

  return { layout: 'two-column', elements };
}

function inferCodeBlock(
  nodes: Content[],
  headings: Content[],
  codeBlocks: Content[],
  paragraphs: Content[],
  positionData: any[]
): LayoutInference {
  const codeNode = codeBlocks[0] as any;
  const title = headings.length > 0 ? extractText(headings[0]) : undefined;

  // Find paragraphs that are NOT before the code block (i.e. caption after code)
  const codeIdx = nodes.indexOf(codeBlocks[0]);
  const captionParagraphs = paragraphs.filter((p) => nodes.indexOf(p) > codeIdx);
  const caption = captionParagraphs.length > 0 ? extractText(captionParagraphs[0]) : undefined;

  const elements: SlideElement[] = [];
  let posIdx = 0;

  if (title) {
    const headingEl: SlideElement = {
      id: crypto.randomUUID(),
      type: 'heading',
      position: positionData[posIdx] || { x: 12, y: 8, width: 76, height: 10 },
      content: title,
      level: 2,
    };
    applyFragmentData(headingEl, headings[0]);
    elements.push(headingEl);
    posIdx++;
  }

  const codeEl: SlideElement = {
    id: crypto.randomUUID(),
    type: 'code',
    position: positionData[posIdx] || { x: 12, y: 22, width: 76, height: 60 },
    code: codeNode.value || '',
    language: codeNode.lang || 'text',
  };
  applyFragmentData(codeEl, codeBlocks[0]);
  elements.push(codeEl);
  posIdx++;

  if (caption) {
    const captionEl: SlideElement = {
      id: crypto.randomUUID(),
      type: 'text',
      position: positionData[posIdx] || { x: 12, y: 86, width: 76, height: 8 },
      content: caption,
    };
    applyFragmentData(captionEl, captionParagraphs[0]);
    elements.push(captionEl);
  }

  return { layout: 'code-block', elements };
}

function inferFullBleedMedia(imageNode: { url: string; alt?: string }, positionData: any[], sourceNode?: any): LayoutInference {
  const element: SlideElement = {
    id: crypto.randomUUID(),
    type: 'image',
    position: positionData[0] || { x: 0, y: 0, width: 100, height: 100 },
    url: imageNode.url,
    objectFit: 'cover',
  };

  // Only set alt if non-empty
  if (imageNode.alt) {
    element.alt = imageNode.alt;
  }

  if (sourceNode) applyFragmentData(element, sourceNode);

  return { layout: 'full-bleed-media', elements: [element] };
}

function inferMediaAnywhere(contentNodes: Content[], imageNode: { url: string; alt?: string }, positionData: any[], imageSourceNode?: any): LayoutInference {
  const imageElement: SlideElement = {
    id: crypto.randomUUID(),
    type: 'image',
    position: positionData[1] || { x: 54, y: 12, width: 34, height: 56 },
    url: imageNode.url,
  };

  // Only set alt if non-empty
  if (imageNode.alt) {
    imageElement.alt = imageNode.alt;
  }

  if (imageSourceNode) applyFragmentData(imageElement, imageSourceNode);

  const textEl: SlideElement = {
    id: crypto.randomUUID(),
    type: 'text',
    position: positionData[0] || { x: 12, y: 12, width: 38, height: 76 },
    content: contentNodes.map(extractText).join('\n\n'),
  };
  if (contentNodes.length > 0) applyFragmentData(textEl, contentNodes[0]);

  return { layout: 'media-anywhere', elements: [textEl, imageElement] };
}

function inferTitleList(headings: Content[], lists: Content[], positionData: any[]): LayoutInference {
  const title = extractText(headings[0]);
  const items = extractListItems(lists[0]);
  const isOrdered = (lists[0] as any).ordered === true;

  const headingEl: SlideElement = {
    id: crypto.randomUUID(),
    type: 'heading',
    position: positionData[0] || { x: 12, y: 10, width: 76, height: 15 },
    content: title,
    level: 1,
  };
  applyFragmentData(headingEl, headings[0]);

  const listEl: SlideElement = {
    id: crypto.randomUUID(),
    type: 'list',
    position: positionData[1] || { x: 14, y: 30, width: 72, height: 58 },
    items,
    ordered: isOrdered,
  };
  applyFragmentData(listEl, lists[0]);

  return { layout: 'title-list', elements: [headingEl, listEl] };
}

function inferTitle(headings: Content[], paragraphs: Content[], positionData: any[]): LayoutInference {
  const elements: SlideElement[] = [];
  let posIdx = 0;

  // Primary heading
  const headingEl: SlideElement = {
    id: crypto.randomUUID(),
    type: 'heading',
    position: positionData[posIdx] || { x: 15, y: 30, width: 70, height: 20 },
    content: extractText(headings[0]),
    level: ((headings[0] as any).depth || 1) as 1 | 2 | 3 | 4 | 5 | 6,
  };
  applyFragmentData(headingEl, headings[0]);
  elements.push(headingEl);
  posIdx++;

  // Subtitle paragraph (first paragraph only)
  if (paragraphs.length > 0) {
    const subtitleEl: SlideElement = {
      id: crypto.randomUUID(),
      type: 'text',
      position: positionData[posIdx] || { x: 20, y: 55, width: 60, height: 10 },
      content: extractText(paragraphs[0]),
    };
    applyFragmentData(subtitleEl, paragraphs[0]);
    elements.push(subtitleEl);
    posIdx++;
  }

  // Additional headings
  for (let i = 1; i < headings.length; i++) {
    const el: SlideElement = {
      id: crypto.randomUUID(),
      type: 'heading',
      position: positionData[posIdx] || { x: 15, y: 55 + (i - 1) * 15, width: 70, height: 12 },
      content: extractText(headings[i]),
      level: ((headings[i] as any).depth || 2) as 1 | 2 | 3 | 4 | 5 | 6,
    };
    applyFragmentData(el, headings[i]);
    elements.push(el);
    posIdx++;
  }

  // Additional paragraphs
  for (let i = 1; i < paragraphs.length; i++) {
    const el: SlideElement = {
      id: crypto.randomUUID(),
      type: 'text',
      position: positionData[posIdx] || { x: 20, y: 70 + (i - 1) * 12, width: 60, height: 10 },
      content: extractText(paragraphs[i]),
    };
    applyFragmentData(el, paragraphs[i]);
    elements.push(el);
    posIdx++;
  }

  return { layout: 'title', elements };
}

function inferFreestyle(nodes: Content[], positionData: any[]): LayoutInference {
  const elements: SlideElement[] = nodes.map((node, idx) => {
    const defaultPos = positionData[idx] || {
      x: 15,
      y: 15 + idx * 18,
      width: 70,
      height: 15,
    };

    let el: SlideElement;

    if (node.type === 'heading') {
      el = {
        id: crypto.randomUUID(),
        type: 'heading',
        content: extractText(node),
        position: defaultPos,
        level: ((node as any).depth || 1) as 1 | 2 | 3 | 4 | 5 | 6,
      };
    } else if (node.type === 'list') {
      el = {
        id: crypto.randomUUID(),
        type: 'list',
        items: extractListItems(node),
        ordered: (node as any).ordered === true,
        position: defaultPos,
      };
    } else if (node.type === 'html' && !(node as any).value?.trim().startsWith('<!--')) {
      el = {
        id: crypto.randomUUID(),
        type: 'html',
        htmlContent: (node as any).value || '',
        position: defaultPos,
      };
    } else {
      el = {
        id: crypto.randomUUID(),
        type: 'text',
        content: extractText(node),
        position: defaultPos,
      };
    }

    applyFragmentData(el, node);
    return el;
  });

  return { layout: 'freestyle', elements };
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Copy fragment metadata (_fragment, _fragmentPerItem) from an mdast node to a SlideElement.
 */
function applyFragmentData(element: SlideElement, node: any): void {
  if (node._fragment != null) {
    element.fragment = node._fragment;
  }
  if (node._fragmentPerItem && element.type === 'list') {
    element.fragmentPerItem = true;
  }
}

function extractText(node: any): string {
  if (!node) return '';

  if (node.type === 'text') {
    return node.value || '';
  }

  if (node.type === 'heading' || node.type === 'paragraph') {
    if (node.children) {
      return node.children.map(extractText).join('');
    }
  }

  if (node.type === 'list') {
    return node.children?.map(extractText).join('\n') || '';
  }

  if (node.type === 'listItem') {
    return node.children?.map(extractText).join('') || '';
  }

  // GFM table: convert back to pipe-formatted markdown
  if (node.type === 'table') {
    return extractTableMarkdown(node);
  }

  if (node.type === 'strong') {
    return `**${node.children?.map(extractText).join('') || ''}**`;
  }

  if (node.type === 'emphasis') {
    return `*${node.children?.map(extractText).join('') || ''}*`;
  }

  if (node.type === 'inlineCode') {
    return `\`${node.value || ''}\``;
  }

  if (node.type === 'link') {
    const text = node.children?.map(extractText).join('') || '';
    return `[${text}](${node.url || ''})`;
  }

  if (node.type === 'html') {
    return node.value || '';
  }

  if (node.children) {
    return node.children.map(extractText).join('');
  }

  return '';
}

/**
 * Convert a mdast table node back to pipe-formatted markdown.
 */
function extractTableMarkdown(tableNode: any): string {
  if (!tableNode.children || tableNode.children.length === 0) return '';

  const rows: string[][] = [];
  for (const row of tableNode.children) {
    const cells: string[] = [];
    for (const cell of row.children || []) {
      cells.push(cell.children?.map(extractText).join('') || '');
    }
    rows.push(cells);
  }

  if (rows.length === 0) return '';

  // Build pipe-formatted lines
  const lines: string[] = [];
  // Header row
  lines.push('| ' + rows[0].join(' | ') + ' |');
  // Separator row
  lines.push('| ' + rows[0].map(() => '---').join(' | ') + ' |');
  // Data rows
  for (let i = 1; i < rows.length; i++) {
    lines.push('| ' + rows[i].join(' | ') + ' |');
  }

  return lines.join('\n');
}

function extractListItems(listNode: any): string[] {
  if (!listNode || !listNode.children) return [];

  return listNode.children.map((item: any) => {
    if (item.type === 'listItem') {
      const parts: string[] = [];
      for (const child of item.children || []) {
        if (child.type === 'list') {
          parts.push(listNodeToHtml(child));
        } else {
          parts.push(extractText(child).trim());
        }
      }
      return parts.join('');
    }
    return '';
  }).filter(Boolean);
}

/**
 * Convert a mdast list node to HTML string for nested list support.
 */
function listNodeToHtml(listNode: any): string {
  const tag = listNode.ordered ? 'ol' : 'ul';
  const items = (listNode.children || []).map((item: any) => {
    if (item.type !== 'listItem') return '';
    const parts: string[] = [];
    for (const child of item.children || []) {
      if (child.type === 'list') {
        parts.push(listNodeToHtml(child));
      } else {
        const text = extractText(child).trim();
        // Convert inline markdown to basic HTML
        let html = text;
        html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
        html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
        html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
        html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
        parts.push(html);
      }
    }
    return `<li>${parts.join('')}</li>`;
  }).join('');
  return `<${tag}>${items}</${tag}>`;
}

function findFirstImage(node: any): { url: string; alt?: string } | null {
  if (!node) return null;

  if (node.type === 'image') {
    return { url: node.url, alt: node.alt };
  }

  if (node.children) {
    for (const child of node.children) {
      const result = findFirstImage(child);
      if (result) return result;
    }
  }

  return null;
}
