import type {
  Slide,
  SlideElement,
  LegacySlide,
  LegacyTitleSlide,
  LegacyTwoColumnSlide,
  LegacyCodeBlockSlide,
  LegacyFullBleedMediaSlide,
  LegacyTitleListSlide,
  LegacyMediaAnywhereSlide,
  LegacyFreestyleSlide,
} from '@/types/slide';

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

  if (old.media.type === 'video') {
    elements.push({
      id: crypto.randomUUID(),
      type: 'video',
      position: old.media.position,
      url: old.media.url,
    });
  } else {
    elements.push({
      id: crypto.randomUUID(),
      type: 'image',
      position: old.media.position,
      url: old.media.url,
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
