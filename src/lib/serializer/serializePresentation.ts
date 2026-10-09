import type { Presentation } from '../../types/presentation';
import { slideToMarkdown } from './slideToMarkdown';
import { serializeFrontmatter } from '../parser/frontmatter';
import { RESERVED_FRONTMATTER_KEYS } from '../parser/parsePresentation';

/**
 * Serialize a Presentation object to markdown string.
 *
 * This is the main entry point for JSON-to-markdown conversion.
 *
 * Output format:
 * - YAML frontmatter for title/theme/fonts/aspectRatio/metadata (if any is non-default)
 * - Slides separated by --- (thematic breaks)
 * - Per-element `<!-- element: {...} -->` directives followed by readable markdown
 * - Speaker notes after a `???` separator
 *
 * `parsePresentation(serializePresentation(p))` reproduces every slide and
 * element (count, order, type, content, position and other properties).
 *
 * @param presentation - Validated Presentation object
 * @returns Markdown string
 */
export function serializePresentation(presentation: Presentation): string {
  const parts: string[] = [];

  const reserved = new Set<string>(RESERVED_FRONTMATTER_KEYS);
  const metadataEntries = Object.entries(presentation.metadata ?? {}).filter(
    ([key, value]) => !reserved.has(key) && value !== undefined,
  );

  const needsFrontmatter =
    presentation.title !== 'Untitled Presentation' ||
    presentation.theme !== 'default' ||
    !!presentation.fontHeading ||
    !!presentation.fontBody ||
    !!presentation.aspectRatio ||
    metadataEntries.length > 0;

  if (needsFrontmatter) {
    const entries: Array<[string, unknown]> = [
      ['title', presentation.title],
      ['theme', presentation.theme],
      ['schemaVersion', presentation.schemaVersion],
      ['fontHeading', presentation.fontHeading || undefined],
      ['fontBody', presentation.fontBody || undefined],
      ['aspectRatio', presentation.aspectRatio],
      ...metadataEntries,
    ];
    parts.push(`---\n${serializeFrontmatter(entries)}\n---`);
  }

  const slides = presentation.slides.map(slideToMarkdown);
  if (slides.length > 0) parts.push(slides.join('\n\n---\n\n'));

  return parts.length > 0 ? `${parts.join('\n\n')}\n` : '';
}
