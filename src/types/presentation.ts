import { z } from 'zod';
import { Slide, SlideSchema } from './slide';

// Re-export Slide for convenience
export type { Slide };

/**
 * Current deck schema version. '1.0' decks stored text content under the old
 * rendering rule (every newline = paragraph); see migrateLegacyTextContent.
 */
export const CURRENT_SCHEMA_VERSION = '1.1';

export type AspectRatio = '16:9' | '4:3' | '16:10';

// ============================================================================
// Presentation Type
// ============================================================================

export interface Presentation {
  schemaVersion: string;
  id: string; // UUID
  title: string;
  theme: string;
  fontHeading?: string;
  fontBody?: string;
  aspectRatio?: AspectRatio;
  slides: Slide[];
  metadata?: Record<string, unknown>;
  createdAt: string; // ISO date
  updatedAt: string; // ISO date
}

export const PresentationSchema = z.object({
  schemaVersion: z.string().default('1.0'),
  id: z.string(),
  title: z.string(),
  theme: z.string().default('default'),
  fontHeading: z.string().optional(),
  fontBody: z.string().optional(),
  aspectRatio: z.enum(['16:9', '4:3', '16:10']).optional(),
  slides: z.array(SlideSchema),
  metadata: z.record(z.string(), z.unknown()).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

// ============================================================================
// Factory Function
// ============================================================================

export function createPresentation(): Presentation {
  const now = new Date().toISOString();
  const id = crypto.randomUUID();

  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id,
    title: 'Untitled Presentation',
    theme: 'default',
    slides: [],
    createdAt: now,
    updatedAt: now,
  };
}
