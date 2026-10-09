import { unified } from 'unified';
import remarkStringify from 'remark-stringify';
import remarkFrontmatter from 'remark-frontmatter';
import type { Root, BlockContent } from 'mdast';
import type { Presentation } from '../../types/presentation';
import { slideToMarkdown } from './slideToMarkdown';

/**
 * Serialize a Presentation object to markdown string.
 *
 * This is the main entry point for JSON-to-markdown conversion.
 * It converts the Presentation object into an mdast tree, then uses
 * remark-stringify to produce well-formatted markdown.
 *
 * Output format:
 * - Optional YAML frontmatter for title/theme (if non-default)
 * - Slides separated by --- (thematic breaks)
 * - Speaker notes as HTML comments
 *
 * @param presentation - Validated Presentation object
 * @returns Markdown string
 */
export function serializePresentation(presentation: Presentation): string {
  const children: any[] = [];

  // Add frontmatter if title or theme differ from defaults
  const hasCustomTitle = presentation.title !== 'Untitled Presentation';
  const hasCustomTheme = presentation.theme !== 'default';

  if (hasCustomTitle || hasCustomTheme) {
    const frontmatterLines: string[] = [];
    frontmatterLines.push(`title: ${presentation.title}`);
    frontmatterLines.push(`theme: ${presentation.theme}`);
    frontmatterLines.push(`schemaVersion: "${presentation.schemaVersion}"`);

    children.push({
      type: 'yaml',
      value: frontmatterLines.join('\n'),
    });
  }

  // Convert each slide to markdown nodes
  for (let i = 0; i < presentation.slides.length; i++) {
    const slide = presentation.slides[i];

    // Add separator before each slide except the first
    if (i > 0) {
      children.push({
        type: 'thematicBreak',
      });
    }

    // Add slide content
    const slideNodes = slideToMarkdown(slide);
    children.push(...slideNodes);
  }

  // Build mdast tree
  const tree: Root = {
    type: 'root',
    children,
  };

  // Stringify using unified pipeline
  const processor = unified()
    .use(remarkStringify, {
      rule: '-',
      bullet: '-',
      fences: true,
      incrementListMarker: false,
    })
    .use(remarkFrontmatter, ['yaml']);

  const markdown = processor.stringify(tree);

  return markdown;
}
