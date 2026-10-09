import { describe, it, expect } from 'vitest';
import {
  SlideSchema,
  SlideElementSchema,
  Slide,
  SlideElement,
  isHeadingElement,
  isTextElement,
  isListElement,
  isCodeElement,
  isImageElement,
  isVideoElement,
  isRectangleElement,
  isCircleElement,
  isLineElement,
  LayoutPresetSchema,
} from '../slide';
import { PresentationSchema, createPresentation } from '../presentation';
import {
  validatePresentation,
  safeValidatePresentation,
} from '@/lib/validation/validatePresentation';

// ============================================================================
// SlideElement Schema Tests
// ============================================================================

describe('SlideElementSchema', () => {
  it('accepts valid HeadingElement', () => {
    const el = {
      id: 'h1',
      type: 'heading',
      position: { x: 10, y: 30, width: 80, height: 20 },
      content: 'Title',
      level: 1,
    };
    const result = SlideElementSchema.parse(el);
    expect(result.type).toBe('heading');
  });

  it('accepts valid TextElement', () => {
    const el = {
      id: 't1',
      type: 'text',
      position: { x: 5, y: 5, width: 50, height: 90 },
      content: 'Some text',
    };
    const result = SlideElementSchema.parse(el);
    expect(result.type).toBe('text');
  });

  it('accepts valid ListElement', () => {
    const el = {
      id: 'l1',
      type: 'list',
      position: { x: 10, y: 25, width: 80, height: 70 },
      items: ['A', 'B', 'C'],
      ordered: false,
    };
    const result = SlideElementSchema.parse(el);
    expect(result.type).toBe('list');
  });

  it('accepts valid CodeElement', () => {
    const el = {
      id: 'c1',
      type: 'code',
      position: { x: 5, y: 15, width: 90, height: 70 },
      code: 'const x = 1;',
      language: 'typescript',
    };
    const result = SlideElementSchema.parse(el);
    expect(result.type).toBe('code');
  });

  it('accepts valid ImageElement', () => {
    const el = {
      id: 'i1',
      type: 'image',
      position: { x: 0, y: 0, width: 100, height: 100 },
      url: 'https://example.com/image.jpg',
      alt: 'alt text',
      objectFit: 'cover',
    };
    const result = SlideElementSchema.parse(el);
    expect(result.type).toBe('image');
  });

  it('accepts valid VideoElement', () => {
    const el = {
      id: 'v1',
      type: 'video',
      position: { x: 58, y: 10, width: 38, height: 60 },
      url: 'https://example.com/video.mp4',
    };
    const result = SlideElementSchema.parse(el);
    expect(result.type).toBe('video');
  });

  it('accepts ImageElement without optional fields', () => {
    const el = {
      id: 'i2',
      type: 'image',
      position: { x: 0, y: 0, width: 50, height: 50 },
      url: 'photo.jpg',
    };
    const result = SlideElementSchema.parse(el);
    expect(result.type).toBe('image');
  });

  it('rejects element with invalid type', () => {
    const el = {
      id: 'bad',
      type: 'unknown',
      position: { x: 0, y: 0, width: 50, height: 50 },
    };
    expect(() => SlideElementSchema.parse(el)).toThrow();
  });

  it('rejects HeadingElement with invalid level', () => {
    const el = {
      id: 'h-bad',
      type: 'heading',
      position: { x: 10, y: 30, width: 80, height: 20 },
      content: 'Title',
      level: 7,
    };
    expect(() => SlideElementSchema.parse(el)).toThrow();
  });
});

// ============================================================================
// SlideSchema Tests
// ============================================================================

describe('SlideSchema', () => {
  it('accepts valid slide with elements', () => {
    const slide = {
      id: crypto.randomUUID(),
      layout: 'title',
      transition: 'none',
      elements: [
        {
          id: 'h1',
          type: 'heading',
          position: { x: 10, y: 30, width: 80, height: 20 },
          content: 'My Title',
          level: 1,
        },
        {
          id: 't1',
          type: 'text',
          position: { x: 15, y: 55, width: 70, height: 10 },
          content: 'My Subtitle',
        },
      ],
    };

    const result = SlideSchema.parse(slide);
    expect(result.layout).toBe('title');
    expect(result.elements).toHaveLength(2);
  });

  it('accepts slide with empty elements', () => {
    const slide = {
      id: crypto.randomUUID(),
      layout: 'freestyle',
      transition: 'none',
      elements: [],
    };

    const result = SlideSchema.parse(slide);
    expect(result.layout).toBe('freestyle');
    expect(result.elements).toHaveLength(0);
  });

  it('accepts blank layout', () => {
    const slide = {
      id: crypto.randomUUID(),
      layout: 'blank',
      transition: 'none',
      elements: [],
    };

    const result = SlideSchema.parse(slide);
    expect(result.layout).toBe('blank');
  });

  it('accepts slide with notes', () => {
    const slide = {
      id: crypto.randomUUID(),
      layout: 'title',
      transition: 'fade',
      elements: [],
      notes: 'Speaker notes here',
    };

    const result = SlideSchema.parse(slide);
    expect(result.notes).toBe('Speaker notes here');
  });

  it('defaults transition to none', () => {
    const slide = {
      id: crypto.randomUUID(),
      layout: 'title',
      elements: [],
    };

    const result = SlideSchema.parse(slide);
    expect(result.transition).toBe('none');
  });

  it('rejects slide with invalid layout', () => {
    const invalidSlide = {
      id: crypto.randomUUID(),
      layout: 'nonexistent',
      transition: 'none',
      elements: [],
    };
    expect(() => SlideSchema.parse(invalidSlide)).toThrow();
  });

  it('rejects slide without elements array', () => {
    const invalidSlide = {
      id: crypto.randomUUID(),
      layout: 'title',
      transition: 'none',
    };
    expect(() => SlideSchema.parse(invalidSlide)).toThrow();
  });

  it('accepts all layout presets', () => {
    const layouts = ['title', 'two-column', 'code-block', 'full-bleed-media', 'title-list', 'media-anywhere', 'freestyle', 'blank'];
    for (const layout of layouts) {
      const slide = {
        id: crypto.randomUUID(),
        layout,
        transition: 'none',
        elements: [],
      };
      expect(() => SlideSchema.parse(slide)).not.toThrow();
    }
  });
});

// ============================================================================
// LayoutPreset Tests
// ============================================================================

describe('LayoutPresetSchema', () => {
  it('accepts all valid layout presets', () => {
    const valid = ['title', 'two-column', 'code-block', 'full-bleed-media', 'title-list', 'media-anywhere', 'freestyle', 'blank'];
    for (const layout of valid) {
      expect(() => LayoutPresetSchema.parse(layout)).not.toThrow();
    }
  });

  it('rejects invalid layout preset', () => {
    expect(() => LayoutPresetSchema.parse('invalid')).toThrow();
  });
});

// ============================================================================
// Presentation Schema Tests
// ============================================================================

describe('PresentationSchema', () => {
  it('accepts valid presentation with new slide format', () => {
    const presentation = {
      schemaVersion: '1.0',
      id: crypto.randomUUID(),
      title: 'My Presentation',
      theme: 'default',
      slides: [
        {
          id: crypto.randomUUID(),
          layout: 'title',
          transition: 'none',
          elements: [
            {
              id: 'h1',
              type: 'heading',
              position: { x: 10, y: 30, width: 80, height: 20 },
              content: 'Hello',
              level: 1,
            },
          ],
        },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const result = PresentationSchema.parse(presentation);
    expect(result.schemaVersion).toBe('1.0');
    expect(result.slides).toHaveLength(1);
  });

  it('rejects presentation without required fields', () => {
    const invalidPresentation = {
      title: 'My Presentation',
      theme: 'default',
      slides: [],
    };

    expect(() => PresentationSchema.parse(invalidPresentation)).toThrow();
  });
});

// ============================================================================
// Validation Tests
// ============================================================================

describe('validatePresentation', () => {
  it('throws on invalid data', () => {
    const invalidData = { title: 'Only title' };
    expect(() => validatePresentation(invalidData)).toThrow();
  });

  it('returns valid presentation on valid data', () => {
    const validData = {
      schemaVersion: '1.0',
      id: crypto.randomUUID(),
      title: 'Test',
      theme: 'default',
      slides: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const result = validatePresentation(validData);
    expect(result.title).toBe('Test');
  });
});

describe('safeValidatePresentation', () => {
  it('returns success: false on invalid data', () => {
    const invalidData = { title: 'Only title' };
    const result = safeValidatePresentation(invalidData);
    expect(result.success).toBe(false);
  });

  it('returns success: true on valid data', () => {
    const validData = {
      schemaVersion: '1.0',
      id: crypto.randomUUID(),
      title: 'Test',
      theme: 'default',
      slides: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const result = safeValidatePresentation(validData);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.title).toBe('Test');
    }
  });
});

// ============================================================================
// Factory Tests
// ============================================================================

describe('createPresentation', () => {
  it('produces valid presentation passing schema validation', () => {
    const presentation = createPresentation();
    expect(() => PresentationSchema.parse(presentation)).not.toThrow();
    expect(presentation.schemaVersion).toBe('1.1');
    expect(presentation.slides).toEqual([]);
  });

  it('generates unique IDs', () => {
    const p1 = createPresentation();
    const p2 = createPresentation();
    expect(p1.id).not.toBe(p2.id);
  });
});

// ============================================================================
// Element Type Guard Tests
// ============================================================================

describe('Element type guards', () => {
  const heading: SlideElement = {
    id: 'h', type: 'heading', position: { x: 0, y: 0, width: 100, height: 20 }, content: 'Title', level: 1,
  };
  const text: SlideElement = {
    id: 't', type: 'text', position: { x: 0, y: 0, width: 100, height: 20 }, content: 'Text',
  };
  const list: SlideElement = {
    id: 'l', type: 'list', position: { x: 0, y: 0, width: 100, height: 20 }, items: ['A'], ordered: false,
  };
  const code: SlideElement = {
    id: 'c', type: 'code', position: { x: 0, y: 0, width: 100, height: 20 }, code: 'x', language: 'js',
  };
  const image: SlideElement = {
    id: 'i', type: 'image', position: { x: 0, y: 0, width: 100, height: 20 }, url: 'img.jpg',
  };
  const video: SlideElement = {
    id: 'v', type: 'video', position: { x: 0, y: 0, width: 100, height: 20 }, url: 'vid.mp4',
  };

  it('isHeadingElement correctly identifies heading elements', () => {
    expect(isHeadingElement(heading)).toBe(true);
    expect(isHeadingElement(text)).toBe(false);
  });

  it('isTextElement correctly identifies text elements', () => {
    expect(isTextElement(text)).toBe(true);
    expect(isTextElement(heading)).toBe(false);
  });

  it('isListElement correctly identifies list elements', () => {
    expect(isListElement(list)).toBe(true);
    expect(isListElement(heading)).toBe(false);
  });

  it('isCodeElement correctly identifies code elements', () => {
    expect(isCodeElement(code)).toBe(true);
    expect(isCodeElement(heading)).toBe(false);
  });

  it('isImageElement correctly identifies image elements', () => {
    expect(isImageElement(image)).toBe(true);
    expect(isImageElement(heading)).toBe(false);
  });

  it('isVideoElement correctly identifies video elements', () => {
    expect(isVideoElement(video)).toBe(true);
    expect(isVideoElement(heading)).toBe(false);
  });
});

// ============================================================================
// Shape Element Tests
// ============================================================================

describe('Shape Elements', () => {
  it('accepts valid RectangleElement', () => {
    const el = {
      id: 'r1',
      type: 'rectangle',
      position: { x: 10, y: 10, width: 50, height: 30 },
      fill: '#FF0000',
      stroke: '#000000',
      strokeWidth: 2,
      cornerRadius: 8,
    };
    const result = SlideElementSchema.parse(el);
    expect(result.type).toBe('rectangle');
    expect(result).toMatchObject(el);
  });

  it('accepts RectangleElement with only required fields', () => {
    const el = {
      id: 'r2',
      type: 'rectangle',
      position: { x: 5, y: 5, width: 20, height: 15 },
    };
    const result = SlideElementSchema.parse(el);
    expect(result.type).toBe('rectangle');
    expect(result.id).toBe('r2');
  });

  it('accepts valid CircleElement', () => {
    const el = {
      id: 'c1',
      type: 'circle',
      position: { x: 25, y: 25, width: 40, height: 40 },
      fill: '#00FF00',
      stroke: '#333333',
      strokeWidth: 3,
    };
    const result = SlideElementSchema.parse(el);
    expect(result.type).toBe('circle');
    expect(result).toMatchObject(el);
  });

  it('accepts CircleElement with only required fields', () => {
    const el = {
      id: 'c2',
      type: 'circle',
      position: { x: 0, y: 0, width: 50, height: 50 },
    };
    const result = SlideElementSchema.parse(el);
    expect(result.type).toBe('circle');
    expect(result.id).toBe('c2');
  });

  it('accepts valid LineElement', () => {
    const el = {
      id: 'l1',
      type: 'line',
      position: { x: 10, y: 10, width: 80, height: 5 },
      stroke: '#0000FF',
      strokeWidth: 4,
    };
    const result = SlideElementSchema.parse(el);
    expect(result.type).toBe('line');
    expect(result).toMatchObject(el);
  });

  it('accepts LineElement with only required fields', () => {
    const el = {
      id: 'l2',
      type: 'line',
      position: { x: 0, y: 50, width: 100, height: 1 },
    };
    const result = SlideElementSchema.parse(el);
    expect(result.type).toBe('line');
    expect(result.id).toBe('l2');
  });
});

// ============================================================================
// Shape Type Guard Tests
// ============================================================================

describe('Shape type guards', () => {
  const rectangle: SlideElement = {
    id: 'r',
    type: 'rectangle',
    position: { x: 0, y: 0, width: 100, height: 50 },
    fill: '#FF0000',
  };
  const circle: SlideElement = {
    id: 'c',
    type: 'circle',
    position: { x: 0, y: 0, width: 50, height: 50 },
    stroke: '#00FF00',
  };
  const line: SlideElement = {
    id: 'l',
    type: 'line',
    position: { x: 0, y: 0, width: 100, height: 2 },
    stroke: '#0000FF',
  };
  const heading: SlideElement = {
    id: 'h',
    type: 'heading',
    position: { x: 0, y: 0, width: 100, height: 20 },
    content: 'Title',
    level: 1,
  };

  it('isRectangleElement correctly identifies rectangle elements', () => {
    expect(isRectangleElement(rectangle)).toBe(true);
    expect(isRectangleElement(circle)).toBe(false);
    expect(isRectangleElement(heading)).toBe(false);
  });

  it('isCircleElement correctly identifies circle elements', () => {
    expect(isCircleElement(circle)).toBe(true);
    expect(isCircleElement(rectangle)).toBe(false);
    expect(isCircleElement(heading)).toBe(false);
  });

  it('isLineElement correctly identifies line elements', () => {
    expect(isLineElement(line)).toBe(true);
    expect(isLineElement(rectangle)).toBe(false);
    expect(isLineElement(heading)).toBe(false);
  });
});
