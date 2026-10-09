import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import type { Root } from 'mdast';
import { splitSlides } from './remarkSlidePlugin';
import { parseFrontmatter } from './frontmatter';
import { CURRENT_SCHEMA_VERSION, PresentationSchema, type AspectRatio, type Presentation } from '../../types/presentation';

export interface ParseResult {
  presentation: Presentation;
  /** Non-fatal problems found while parsing (invalid directive values, etc.). */
  warnings: string[];
}

const ASPECT_RATIOS: readonly AspectRatio[] = ['16:9', '4:3', '16:10'];

/** Frontmatter keys mapped to Presentation fields (everything else is metadata). */
export const RESERVED_FRONTMATTER_KEYS = [
  'title',
  'theme',
  'schemaVersion',
  'fontHeading',
  'fontBody',
  'aspectRatio',
] as const;

/**
 * Parse a markdown string into a validated Presentation object.
 *
 * Invalid directive values never fail the import; they are ignored and
 * reported via `console.warn`. Use `parsePresentationWithWarnings` to get
 * the warnings programmatically.
 *
 * @param markdown - Raw markdown string with optional frontmatter and --- slide separators
 * @returns Promise resolving to a validated Presentation object
 */
export async function parsePresentation(markdown: string): Promise<Presentation> {
  const { presentation, warnings } = parsePresentationSync(markdown);
  if (warnings.length > 0) {
    console.warn(`Markdown import: ${warnings.length} warning(s)\n- ${warnings.join('\n- ')}`);
  }
  return presentation;
}

/**
 * Like `parsePresentation`, but returns the collected warnings instead of logging them.
 */
export async function parsePresentationWithWarnings(markdown: string): Promise<ParseResult> {
  return parsePresentationSync(markdown);
}

/**
 * Synchronous parse core (the pipeline has no async steps).
 */
export function parsePresentationSync(markdown: string): ParseResult {
  const warnings: string[] = [];

  if (!markdown || markdown.trim() === '') {
    return { presentation: createEmptyPresentation(), warnings };
  }

  // Normalize BOM and line endings so offsets, regexes and frontmatter work uniformly.
  const source = markdown.replace(/^﻿/, '').replace(/\r\n?/g, '\n');

  const processor = unified().use(remarkParse).use(remarkGfm).use(remarkFrontmatter, ['yaml']);
  const tree = processor.parse(source) as Root;

  const slides = splitSlides(tree, source, warnings);
  const frontmatter = extractFrontmatter(tree, warnings);

  const now = new Date().toISOString();
  const presentation: Presentation = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id: crypto.randomUUID(),
    title: frontmatter.title || 'Untitled Presentation',
    theme: frontmatter.theme || 'default',
    slides,
    metadata: frontmatter.metadata,
    createdAt: now,
    updatedAt: now,
  };
  if (frontmatter.fontHeading) presentation.fontHeading = frontmatter.fontHeading;
  if (frontmatter.fontBody) presentation.fontBody = frontmatter.fontBody;
  if (frontmatter.aspectRatio) presentation.aspectRatio = frontmatter.aspectRatio;

  // Validate with Zod schema before returning
  return { presentation: PresentationSchema.parse(presentation), warnings };
}

interface FrontmatterFields {
  title?: string;
  theme?: string;
  fontHeading?: string;
  fontBody?: string;
  aspectRatio?: AspectRatio;
  metadata?: Record<string, unknown>;
}

function asString(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  return typeof value === 'string' ? value : String(value);
}

/**
 * Extract frontmatter YAML as presentation fields + metadata
 */
function extractFrontmatter(tree: Root, warnings: string[]): FrontmatterFields {
  const yamlNode = tree.children.find((n) => n.type === 'yaml') as { value?: string } | undefined;
  if (!yamlNode?.value) return {};

  const data = parseFrontmatter(yamlNode.value, warnings);
  const { title, theme, schemaVersion: _schemaVersion, fontHeading, fontBody, aspectRatio, ...metadata } = data;

  const fields: FrontmatterFields = {
    title: asString(title),
    theme: asString(theme),
    fontHeading: asString(fontHeading),
    fontBody: asString(fontBody),
    metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
  };

  if (aspectRatio !== undefined && aspectRatio !== null) {
    const ratio = asString(aspectRatio);
    if (ratio && (ASPECT_RATIOS as readonly string[]).includes(ratio)) {
      fields.aspectRatio = ratio as AspectRatio;
    } else {
      warnings.push(`Unknown aspectRatio "${ratio}" ignored.`);
    }
  }

  return fields;
}

/**
 * Create an empty but valid Presentation object
 */
function createEmptyPresentation(): Presentation {
  const now = new Date().toISOString();

  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id: crypto.randomUUID(),
    title: 'Untitled Presentation',
    theme: 'default',
    slides: [],
    createdAt: now,
    updatedAt: now,
  };
}
