import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import type { Root } from 'mdast';
import { visit } from 'unist-util-visit';
import { remarkSlidePlugin } from './remarkSlidePlugin';
import { PresentationSchema, type Presentation } from '../../types/presentation';

/**
 * Parse a markdown string into a validated Presentation object.
 *
 * This is the main entry point for the markdown-to-JSON conversion pipeline.
 * It uses unified/remark to parse markdown, extract frontmatter, split slides
 * by --- separators, infer layout types, and validate the final structure.
 *
 * @param markdown - Raw markdown string with optional frontmatter and --- slide separators
 * @returns Promise resolving to a validated Presentation object
 */
export async function parsePresentation(markdown: string): Promise<Presentation> {
  // Handle empty input
  if (!markdown || markdown.trim() === '') {
    return createEmptyPresentation();
  }

  // Build unified pipeline
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkFrontmatter, ['yaml'])
    .use(remarkSlidePlugin);

  // Parse markdown to AST
  const tree = processor.parse(markdown) as Root;

  // Create a file object to hold data
  const file = { data: {} } as any;

  // Run transformers (plugins) on the tree
  await processor.run(tree, file);

  // Extract slides from file data (attached by remarkSlidePlugin)
  const slides = (file.data.slides as any[]) || [];

  // Extract frontmatter
  const frontmatter = extractFrontmatter(tree);

  // Build presentation object
  const now = new Date().toISOString();
  const presentation: Presentation = {
    schemaVersion: '1.0',
    id: crypto.randomUUID(),
    title: frontmatter.title || 'Untitled Presentation',
    theme: frontmatter.theme || 'default',
    slides,
    metadata: frontmatter.metadata,
    createdAt: now,
    updatedAt: now,
  };

  // Validate with Zod schema before returning
  return PresentationSchema.parse(presentation);
}

/**
 * Extract frontmatter YAML as key-value object
 */
function extractFrontmatter(tree: Root): {
  title?: string;
  theme?: string;
  metadata?: Record<string, unknown>;
} {
  let frontmatter: Record<string, unknown> = {};

  visit(tree, 'yaml', (node: any) => {
    if (node.value) {
      frontmatter = parseYaml(node.value);
    }
  });

  // Remove known presentation fields from metadata
  const { title, theme, schemaVersion, ...metadata } = frontmatter;

  return {
    title: title as string | undefined,
    theme: theme as string | undefined,
    metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
  };
}

/**
 * Simple YAML parser for frontmatter (key: value pairs)
 * This is intentionally simple - only handles basic key-value pairs
 */
function parseYaml(yamlString: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  const lines = yamlString.split('\n');
  for (const line of lines) {
    const match = line.match(/^(\w+):\s*(.+)$/);
    if (match) {
      const [, key, value] = match;
      result[key] = value.trim();
    }
  }

  return result;
}

/**
 * Create an empty but valid Presentation object
 */
function createEmptyPresentation(): Presentation {
  const now = new Date().toISOString();

  return {
    schemaVersion: '1.0',
    id: crypto.randomUUID(),
    title: 'Untitled Presentation',
    theme: 'default',
    slides: [],
    createdAt: now,
    updatedAt: now,
  };
}
