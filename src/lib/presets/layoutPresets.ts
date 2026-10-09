import type { LayoutPreset, SlideElement } from '@/types/slide';

/**
 * Create default elements for a given layout preset.
 * All positions are in percentages (0-100).
 */
export function createPresetElements(layout: LayoutPreset): SlideElement[] {
  switch (layout) {
    case 'title':
      return [
        {
          id: crypto.randomUUID(),
          type: 'heading',
          position: { x: 15, y: 30, width: 70, height: 20 },
          content: '',
          level: 1,
        },
        {
          id: crypto.randomUUID(),
          type: 'text',
          position: { x: 20, y: 55, width: 60, height: 10 },
          content: '',
        },
      ];

    case 'two-column':
      return [
        {
          id: crypto.randomUUID(),
          type: 'heading',
          position: { x: 12, y: 10, width: 76, height: 12 },
          content: '',
          level: 1,
        },
        {
          id: crypto.randomUUID(),
          type: 'text',
          position: { x: 12, y: 26, width: 36, height: 62 },
          content: '',
        },
        {
          id: crypto.randomUUID(),
          type: 'text',
          position: { x: 52, y: 26, width: 36, height: 62 },
          content: '',
        },
      ];

    case 'code-block':
      return [
        {
          id: crypto.randomUUID(),
          type: 'heading',
          position: { x: 12, y: 8, width: 76, height: 10 },
          content: '',
          level: 2,
        },
        {
          id: crypto.randomUUID(),
          type: 'code',
          position: { x: 12, y: 22, width: 76, height: 60 },
          code: '',
          language: 'typescript',
        },
        {
          id: crypto.randomUUID(),
          type: 'text',
          position: { x: 12, y: 86, width: 76, height: 8 },
          content: '',
        },
      ];

    case 'full-bleed-media':
      return [
        {
          id: crypto.randomUUID(),
          type: 'image',
          position: { x: 0, y: 0, width: 100, height: 100 },
          url: '',
          objectFit: 'cover',
        },
        {
          id: crypto.randomUUID(),
          type: 'text',
          position: { x: 12, y: 85, width: 76, height: 10 },
          content: '',
        },
      ];

    case 'title-list':
      return [
        {
          id: crypto.randomUUID(),
          type: 'heading',
          position: { x: 12, y: 10, width: 76, height: 15 },
          content: '',
          level: 1,
        },
        {
          id: crypto.randomUUID(),
          type: 'list',
          position: { x: 14, y: 30, width: 72, height: 58 },
          items: [],
          ordered: false,
        },
      ];

    case 'media-anywhere':
      return [
        {
          id: crypto.randomUUID(),
          type: 'text',
          position: { x: 12, y: 12, width: 38, height: 76 },
          content: '',
        },
        {
          id: crypto.randomUUID(),
          type: 'image',
          position: { x: 54, y: 12, width: 34, height: 56 },
          url: '',
        },
      ];

    case 'freestyle':
      return [];

    case 'blank':
      return [];

    default: {
      const _exhaustive: never = layout;
      return [];
    }
  }
}
