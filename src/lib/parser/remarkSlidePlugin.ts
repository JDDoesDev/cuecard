import type { Root, Content } from 'mdast';
import type { Plugin } from 'unified';
import { unified } from 'unified';
import remarkStringify from 'remark-stringify';
import { inferLayout } from './inferLayout';

/**
 * Custom remark plugin that splits markdown AST by thematicBreak (---) nodes
 * and converts each section into a slide object.
 *
 * The plugin walks the AST children and groups nodes between thematicBreak
 * markers into separate slides. Each slide gets layout inference, UUID, and
 * default transition.
 *
 * Speaker notes are extracted from HTML comment nodes matching:
 * <!-- notes: ... -->
 */
export const remarkSlidePlugin: Plugin<[], Root> = function () {
  return (tree, file) => {
    const slides: any[] = [];
    let currentSlideNodes: Content[] = [];

    // Process root children and split by thematicBreak
    for (const node of tree.children) {
      // Skip yaml frontmatter nodes (handled separately)
      if (node.type === 'yaml') {
        continue;
      }

      if (node.type === 'thematicBreak') {
        // Found separator - finalize current slide
        if (currentSlideNodes.length > 0) {
          slides.push(createSlide(currentSlideNodes));
          currentSlideNodes = [];
        }
      } else {
        currentSlideNodes.push(node);
      }
    }

    // Don't forget the last slide
    if (currentSlideNodes.length > 0) {
      slides.push(createSlide(currentSlideNodes));
    }

    // Attach slides to file data
    file.data.slides = slides;
  };
};

/**
 * Create a slide object from an array of AST nodes.
 * Now uses the universal element model.
 */
function createSlide(nodes: Content[]): any {
  // Extract speaker notes, position data, transition, explicit layout, and fragment data
  let notes: string | undefined;
  let transition: 'fade' | 'slide' | 'zoom' | 'none' = 'none';
  let explicitLayout: string | undefined;
  const positionData: any[] = [];
  const contentNodes: Content[] = [];

  // Fragment data pending application to the next content element
  let pendingFragment: number | undefined;
  let pendingFragmentItems = false;

  for (const node of nodes) {
    if (node.type === 'html' && (node as any).value) {
      const htmlValue = (node as any).value as string;

      // Extract speaker notes
      const notesMatch = htmlValue.match(/<!--\s*notes:\s*(.+?)\s*-->/s);
      if (notesMatch) {
        notes = notesMatch[1].trim();
        continue; // Don't include notes comment in content
      }

      // Extract transition
      const transitionMatch = htmlValue.match(/<!--\s*transition:\s*(\w+)\s*-->/);
      if (transitionMatch) {
        transition = transitionMatch[1] as any;
        continue; // Don't include transition comment in content
      }

      // Extract explicit layout directive
      const layoutMatch = htmlValue.match(/<!--\s*layout:\s*([\w-]+)\s*-->/);
      if (layoutMatch) {
        explicitLayout = layoutMatch[1];
        continue; // Don't include layout comment in content
      }

      // Extract position data
      const positionMatch = htmlValue.match(/<!--\s*position:\s*(.+?)\s*-->/s);
      if (positionMatch) {
        try {
          const position = JSON.parse(positionMatch[1]);
          positionData.push(position);
          continue; // Don't include position comment in content
        } catch (e) {
          // Invalid JSON, skip
        }
      }

      // Extract fragment directive
      const fragmentMatch = htmlValue.match(/<!--\s*fragment:\s*(\d+)\s*-->/);
      if (fragmentMatch) {
        pendingFragment = parseInt(fragmentMatch[1], 10);
        continue;
      }

      // Extract fragment-items directive
      if (/<!--\s*fragment-items\s*-->/.test(htmlValue)) {
        pendingFragmentItems = true;
        continue;
      }

      // Extract column-break marker
      if (htmlValue.includes('<!-- column-break -->')) {
        contentNodes.push(node);
        continue;
      }
    }

    // This is a content node - apply any pending fragment data as custom properties on the node
    if (pendingFragment !== undefined || pendingFragmentItems) {
      if (pendingFragment !== undefined) (node as any)._fragment = pendingFragment;
      if (pendingFragmentItems) (node as any)._fragmentPerItem = true;
      pendingFragment = undefined;
      pendingFragmentItems = false;
    }

    contentNodes.push(node);
  }

  // Check for ??? separator in contentNodes — everything after it is speaker notes
  const separatorIndex = contentNodes.findIndex(
    (n) =>
      n.type === 'paragraph' &&
      'children' in n &&
      (n as any).children.length === 1 &&
      (n as any).children[0].type === 'text' &&
      (n as any).children[0].value.trim() === '???',
  );

  let slideContentNodes = contentNodes;
  if (separatorIndex !== -1) {
    slideContentNodes = contentNodes.slice(0, separatorIndex);
    const notesNodes = contentNodes.slice(separatorIndex + 1);
    if (notesNodes.length > 0) {
      const notesTree: Root = { type: 'root', children: notesNodes as any };
      const notesMarkdown = unified()
        .use(remarkStringify)
        .stringify(notesTree)
        .trim();
      if (notesMarkdown) {
        notes = notesMarkdown;
      }
    }
  }

  // Infer layout and get elements from content nodes
  const inference = inferLayout(slideContentNodes, positionData, explicitLayout);

  // Build slide object with universal element model
  const slide: any = {
    id: crypto.randomUUID(),
    layout: inference.layout,
    transition,
    elements: inference.elements,
  };

  // Add notes if present
  if (notes) {
    slide.notes = notes;
  }

  return slide;
}
