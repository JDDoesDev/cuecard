import type {
  Slide,
  SlideElement,
  LayoutPreset,
  LegacySlide,
  LegacyTitleSlide,
  LegacyTwoColumnSlide,
  LegacyCodeBlockSlide,
  LegacyFullBleedMediaSlide,
  LegacyTitleListSlide,
  LegacyMediaAnywhereSlide,
  LegacyFreestyleSlide,
} from '@/types/slide';
import { LAYOUTS } from '@/types/slide';
import { CURRENT_SCHEMA_VERSION, type Presentation } from '@/types/presentation';
import { migrateLegacyTextContent } from '@/lib/editor/legacyTextContent';

/**
 * Migrate a legacy slide (discriminated union with layout-specific fields)
 * to the new universal element model (elements: SlideElement[]).
 *
 * Pure function - no side effects.
 */
export function migrateSlide(oldSlide: LegacySlide): Slide {
  switch (oldSlide.layout) {
    case 'title':
      return migrateTitleSlide(oldSlide);
    case 'two-column':
      return migrateTwoColumnSlide(oldSlide);
    case 'code-block':
      return migrateCodeBlockSlide(oldSlide);
    case 'full-bleed-media':
      return migrateFullBleedMediaSlide(oldSlide);
    case 'title-list':
      return migrateTitleListSlide(oldSlide);
    case 'media-anywhere':
      return migrateMediaAnywhereSlide(oldSlide);
    case 'freestyle':
      return migrateFreestyleSlide(oldSlide);
    default: {
      const _exhaustive: never = oldSlide;
      throw new Error(`Unknown legacy layout: ${(_exhaustive as any).layout}`);
    }
  }
}

function migrateTitleSlide(old: LegacyTitleSlide): Slide {
  const elements: SlideElement[] = [
    {
      id: crypto.randomUUID(),
      type: 'heading',
      position: { x: 10, y: 30, width: 80, height: 20 },
      content: old.title,
      level: 1,
    },
  ];

  if (old.subtitle) {
    elements.push({
      id: crypto.randomUUID(),
      type: 'text',
      position: { x: 15, y: 55, width: 70, height: 10 },
      content: old.subtitle,
    });
  }

  return {
    id: old.id,
    layout: 'title',
    transition: old.transition,
    elements,
    ...(old.notes ? { notes: old.notes } : {}),
  };
}

function migrateTwoColumnSlide(old: LegacyTwoColumnSlide): Slide {
  const elements: SlideElement[] = [];

  if (old.title) {
    elements.push({
      id: crypto.randomUUID(),
      type: 'heading',
      position: { x: 5, y: 5, width: 90, height: 12 },
      content: old.title,
      level: 1,
    });
  }

  elements.push(
    {
      id: crypto.randomUUID(),
      type: 'text',
      position: { x: 3, y: 20, width: 45, height: 75 },
      content: old.leftContent,
    },
    {
      id: crypto.randomUUID(),
      type: 'text',
      position: { x: 52, y: 20, width: 45, height: 75 },
      content: old.rightContent,
    }
  );

  return {
    id: old.id,
    layout: 'two-column',
    transition: old.transition,
    elements,
    ...(old.notes ? { notes: old.notes } : {}),
  };
}

function migrateCodeBlockSlide(old: LegacyCodeBlockSlide): Slide {
  const elements: SlideElement[] = [];

  if (old.title) {
    elements.push({
      id: crypto.randomUUID(),
      type: 'heading',
      position: { x: 5, y: 3, width: 90, height: 10 },
      content: old.title,
      level: 2,
    });
  }

  elements.push({
    id: crypto.randomUUID(),
    type: 'code',
    position: { x: 5, y: 15, width: 90, height: 70 },
    code: old.code,
    language: old.language,
  });

  if (old.caption) {
    elements.push({
      id: crypto.randomUUID(),
      type: 'text',
      position: { x: 5, y: 88, width: 90, height: 8 },
      content: old.caption,
    });
  }

  return {
    id: old.id,
    layout: 'code-block',
    transition: old.transition,
    elements,
    ...(old.notes ? { notes: old.notes } : {}),
  };
}

function migrateFullBleedMediaSlide(old: LegacyFullBleedMediaSlide): Slide {
  const elements: SlideElement[] = [];

  if (old.mediaType === 'video') {
    elements.push({
      id: crypto.randomUUID(),
      type: 'video',
      position: { x: 0, y: 0, width: 100, height: 100 },
      url: old.mediaUrl,
    });
  } else {
    elements.push({
      id: crypto.randomUUID(),
      type: 'image',
      position: { x: 0, y: 0, width: 100, height: 100 },
      url: old.mediaUrl,
      objectFit: 'cover',
    });
  }

  if (old.caption) {
    elements.push({
      id: crypto.randomUUID(),
      type: 'text',
      position: { x: 5, y: 85, width: 90, height: 10 },
      content: old.caption,
    });
  }

  return {
    id: old.id,
    layout: 'full-bleed-media',
    transition: old.transition,
    elements,
    ...(old.notes ? { notes: old.notes } : {}),
  };
}

function migrateTitleListSlide(old: LegacyTitleListSlide): Slide {
  const elements: SlideElement[] = [
    {
      id: crypto.randomUUID(),
      type: 'heading',
      position: { x: 5, y: 5, width: 90, height: 15 },
      content: old.title,
      level: 1,
    },
    {
      id: crypto.randomUUID(),
      type: 'list',
      position: { x: 10, y: 25, width: 80, height: 70 },
      items: old.items,
      ordered: false,
    },
  ];

  return {
    id: old.id,
    layout: 'title-list',
    transition: old.transition,
    elements,
    ...(old.notes ? { notes: old.notes } : {}),
  };
}

function migrateMediaAnywhereSlide(old: LegacyMediaAnywhereSlide): Slide {
  const elements: SlideElement[] = [
    {
      id: crypto.randomUUID(),
      type: 'text',
      position: { x: 5, y: 5, width: 50, height: 90 },
      content: old.content,
    },
  ];

  const media = old.media ?? { url: '', type: 'image', position: { x: 54, y: 12, width: 34, height: 56 } };
  if (media.type === 'video') {
    elements.push({
      id: crypto.randomUUID(),
      type: 'video',
      position: media.position,
      url: media.url,
    });
  } else {
    elements.push({
      id: crypto.randomUUID(),
      type: 'image',
      position: media.position,
      url: media.url,
    });
  }

  return {
    id: old.id,
    layout: 'media-anywhere',
    transition: old.transition,
    elements,
    ...(old.notes ? { notes: old.notes } : {}),
  };
}

function migrateFreestyleSlide(old: LegacyFreestyleSlide): Slide {
  const elements: SlideElement[] = old.elements.map((el) => ({
    id: el.id,
    type: 'text' as const,
    position: el.position,
    content: el.content,
  }));

  return {
    id: old.id,
    layout: 'freestyle',
    transition: old.transition,
    elements,
    ...(old.notes ? { notes: old.notes } : {}),
  };
}

// ============================================================================
// Presentation-level migration
// ============================================================================

const TRANSITIONS = ['fade', 'slide', 'zoom', 'none'] as const;
const ASPECT_RATIOS = ['16:9', '4:3', '16:10'] as const;

/** True for pre-universal-element slides (layout-specific fields, no `elements` array). */
export function isLegacySlide(slide: unknown): boolean {
  return !!slide && typeof slide === 'object' && !Array.isArray((slide as { elements?: unknown }).elements);
}

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function migrateAnySlide(raw: unknown, warnings: string[]): Slide {
  const input = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  let slide: Slide;
  if (isLegacySlide(input) && (LAYOUTS as readonly string[]).includes(input.layout as string) && input.layout !== 'blank') {
    slide = migrateSlide({ ...input, transition: input.transition ?? 'none' } as unknown as LegacySlide);
  } else {
    slide = {
      id: input.id as string,
      layout: input.layout as LayoutPreset,
      transition: input.transition as Slide['transition'],
      elements: Array.isArray(input.elements) ? (input.elements as SlideElement[]) : [],
      ...(typeof input.notes === 'string' && input.notes ? { notes: input.notes } : {}),
    };
  }

  if (!(LAYOUTS as readonly string[]).includes(slide.layout)) {
    warnings.push(`Unknown layout "${String(slide.layout)}" replaced with freestyle.`);
    slide.layout = 'freestyle';
  }
  if (!(TRANSITIONS as readonly string[]).includes(slide.transition)) slide.transition = 'none';
  if (typeof slide.id !== 'string' || !slide.id) slide.id = crypto.randomUUID();

  // Elements are NOT repaired here: invalid content must surface in the
  // caller's PresentationSchema validation. Only missing ids are filled.
  slide.elements = slide.elements.map((el) =>
    el && typeof el === 'object' && !(el as { id?: unknown }).id ? { ...el, id: crypto.randomUUID() } : el,
  );

  return slide;
}

/**
 * Migrate a raw presentation object (e.g. parsed `.fldc.json` or an older
 * autosave) to the current shape:
 * - legacy layout-specific slides -> universal element model (`migrateSlide`)
 * - missing presentation/slide fields get defaults (ids, title, theme,
 *   transition, timestamps); unknown layouts become 'freestyle'
 * - unknown aspectRatio / non-object metadata are dropped
 *
 * Elements are passed through untouched (apart from missing ids), so the
 * result is NOT guaranteed to be valid: callers should validate it with
 * `PresentationSchema.safeParse` and report errors. Never throws.
 */
export function migratePresentation(raw: unknown, warnings: string[] = []): Presentation {
  const input = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const now = new Date().toISOString();
  const slides = Array.isArray(input.slides) ? input.slides.map((s) => migrateAnySlide(s, warnings)) : [];

  // Decks before 1.1 rendered every newline in text content as a paragraph break
  const legacyText = typeof input.schemaVersion !== 'string' || input.schemaVersion === '1.0';
  if (legacyText) {
    for (const slide of slides) {
      slide.elements = slide.elements.map((el) =>
        el.type === 'text' && typeof el.content === 'string'
          ? { ...el, content: migrateLegacyTextContent(el.content) }
          : el
      );
    }
  }

  const presentation: Presentation = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id: typeof input.id === 'string' && input.id ? input.id : crypto.randomUUID(),
    title: typeof input.title === 'string' ? input.title : 'Untitled Presentation',
    theme: typeof input.theme === 'string' && input.theme ? input.theme : 'default',
    slides,
    createdAt: isIsoDate(input.createdAt) ? input.createdAt : now,
    updatedAt: isIsoDate(input.updatedAt) ? input.updatedAt : now,
  };
  if (typeof input.fontHeading === 'string' && input.fontHeading) presentation.fontHeading = input.fontHeading;
  if (typeof input.fontBody === 'string' && input.fontBody) presentation.fontBody = input.fontBody;
  if ((ASPECT_RATIOS as readonly unknown[]).includes(input.aspectRatio)) {
    presentation.aspectRatio = input.aspectRatio as Presentation['aspectRatio'];
  }
  if (input.metadata && typeof input.metadata === 'object' && !Array.isArray(input.metadata)) {
    presentation.metadata = input.metadata as Record<string, unknown>;
  }

  return presentation;
}
