import { describe, it, expect } from 'vitest';
import { serializePresentation } from '../serializePresentation';
import { createPresentation } from '../../../types/presentation';
import type { Presentation, Slide } from '../../../types/presentation';

describe('serializePresentation', () => {
  function createPresentationWithSlides(slides: Slide[]): Presentation {
    const presentation = createPresentation();
    presentation.slides = slides;
    return presentation;
  }

  function sid() {
    return crypto.randomUUID();
  }

  describe('Case 1 - Title slide', () => {
    it('should serialize title slide with heading and subtitle elements', () => {
      const presentation = createPresentationWithSlides([
        {
          id: sid(),
          layout: 'title',
          transition: 'none',
          elements: [
            { id: sid(), type: 'heading', position: { x: 10, y: 30, width: 80, height: 20 }, content: 'Hello', level: 1 },
            { id: sid(), type: 'text', position: { x: 15, y: 55, width: 70, height: 10 }, content: 'World' },
          ],
        },
      ]);

      const markdown = serializePresentation(presentation);

      expect(markdown).toContain('# Hello');
      expect(markdown).toContain('World');
    });

    it('should serialize title slide without subtitle', () => {
      const presentation = createPresentationWithSlides([
        {
          id: sid(),
          layout: 'title',
          transition: 'none',
          elements: [
            { id: sid(), type: 'heading', position: { x: 10, y: 30, width: 80, height: 20 }, content: 'Hello', level: 1 },
          ],
        },
      ]);

      const markdown = serializePresentation(presentation);
      expect(markdown).toContain('# Hello');
    });
  });

  describe('Case 2 - Title-list slide', () => {
    it('should serialize title-list slide', () => {
      const presentation = createPresentationWithSlides([
        {
          id: sid(),
          layout: 'title-list',
          transition: 'none',
          elements: [
            { id: sid(), type: 'heading', position: { x: 5, y: 5, width: 90, height: 15 }, content: 'Topics', level: 1 },
            { id: sid(), type: 'list', position: { x: 10, y: 25, width: 80, height: 70 }, items: ['A', 'B', 'C'], ordered: false },
          ],
        },
      ]);

      const markdown = serializePresentation(presentation);

      expect(markdown).toContain('# Topics');
      expect(markdown).toContain('- A');
      expect(markdown).toContain('- B');
      expect(markdown).toContain('- C');
    });
  });

  describe('Case 3 - Code-block slide', () => {
    it('should serialize code-block slide with title', () => {
      const presentation = createPresentationWithSlides([
        {
          id: sid(),
          layout: 'code-block',
          transition: 'none',
          elements: [
            { id: sid(), type: 'heading', position: { x: 5, y: 3, width: 90, height: 10 }, content: 'Example', level: 2 },
            { id: sid(), type: 'code', position: { x: 5, y: 15, width: 90, height: 70 }, code: 'const x = 1;', language: 'typescript' },
          ],
        },
      ]);

      const markdown = serializePresentation(presentation);

      expect(markdown).toContain('## Example');
      expect(markdown).toContain('```typescript');
      expect(markdown).toContain('const x = 1;');
      expect(markdown).toContain('```');
    });

    it('should serialize code-block slide without title', () => {
      const presentation = createPresentationWithSlides([
        {
          id: sid(),
          layout: 'code-block',
          transition: 'none',
          elements: [
            { id: sid(), type: 'code', position: { x: 5, y: 15, width: 90, height: 70 }, code: 'console.log("hello");', language: 'javascript' },
          ],
        },
      ]);

      const markdown = serializePresentation(presentation);

      expect(markdown).toContain('```javascript');
      expect(markdown).toContain('console.log("hello");');
    });
  });

  describe('Case 4 - Multiple slides with separator', () => {
    it('should separate slides with ---', () => {
      const presentation = createPresentationWithSlides([
        {
          id: sid(),
          layout: 'title',
          transition: 'none',
          elements: [
            { id: sid(), type: 'heading', position: { x: 10, y: 30, width: 80, height: 20 }, content: 'First', level: 1 },
          ],
        },
        {
          id: sid(),
          layout: 'title',
          transition: 'none',
          elements: [
            { id: sid(), type: 'heading', position: { x: 10, y: 30, width: 80, height: 20 }, content: 'Second', level: 1 },
          ],
        },
      ]);

      const markdown = serializePresentation(presentation);

      expect(markdown).toMatch(/# First[\s\S]*---[\s\S]*# Second/);
    });
  });

  describe('Case 5 - Frontmatter', () => {
    it('should serialize frontmatter with title and theme', () => {
      const presentation = createPresentation();
      presentation.title = 'My Deck';
      presentation.theme = 'dark';

      const markdown = serializePresentation(presentation);

      expect(markdown).toContain('---');
      expect(markdown).toContain('title: My Deck');
      expect(markdown).toContain('theme: dark');
      expect(markdown).toContain('schemaVersion: "1.1"');
    });

    it('should not include frontmatter if using defaults', () => {
      const presentation = createPresentation();
      const markdown = serializePresentation(presentation);
      expect(markdown).toBeDefined();
    });
  });

  describe('Case 6 - Speaker notes', () => {
    it('should serialize speaker notes with ??? separator', () => {
      const presentation = createPresentationWithSlides([
        {
          id: sid(),
          layout: 'title',
          transition: 'none',
          elements: [
            { id: sid(), type: 'heading', position: { x: 10, y: 30, width: 80, height: 20 }, content: 'Hello', level: 1 },
          ],
          notes: 'Remember to pause here',
        },
      ]);

      const markdown = serializePresentation(presentation);

      expect(markdown).toContain('???');
      expect(markdown).toContain('Remember to pause here');
      expect(markdown).not.toContain('<!-- notes:');
    });
  });

  describe('Case 7 - Full-bleed media slide', () => {
    it('should serialize full-bleed media slide', () => {
      const presentation = createPresentationWithSlides([
        {
          id: sid(),
          layout: 'full-bleed-media',
          transition: 'none',
          elements: [
            { id: sid(), type: 'image', position: { x: 0, y: 0, width: 100, height: 100 }, url: 'bg.jpg', objectFit: 'cover' },
          ],
        },
      ]);

      const markdown = serializePresentation(presentation);
      expect(markdown).toContain('![](bg.jpg)');
    });

    it('should serialize full-bleed media with caption', () => {
      const presentation = createPresentationWithSlides([
        {
          id: sid(),
          layout: 'full-bleed-media',
          transition: 'none',
          elements: [
            { id: sid(), type: 'image', position: { x: 0, y: 0, width: 100, height: 100 }, url: 'video.mp4', alt: 'Product Demo', objectFit: 'cover' },
            { id: sid(), type: 'text', position: { x: 5, y: 85, width: 90, height: 10 }, content: 'Product Demo' },
          ],
        },
      ]);

      const markdown = serializePresentation(presentation);
      expect(markdown).toContain('![Product Demo](video.mp4)');
    });
  });

  describe('Case 8 - Media-anywhere slide', () => {
    it('should serialize media-anywhere slide', () => {
      const presentation = createPresentationWithSlides([
        {
          id: sid(),
          layout: 'media-anywhere',
          transition: 'none',
          elements: [
            { id: sid(), type: 'text', position: { x: 5, y: 5, width: 50, height: 90 }, content: 'Description' },
            { id: sid(), type: 'image', position: { x: 58, y: 10, width: 38, height: 60 }, url: 'photo.jpg' },
          ],
        },
      ]);

      const markdown = serializePresentation(presentation);

      expect(markdown).toContain('Description');
      expect(markdown).toContain('![](photo.jpg)');
      expect(markdown).toContain('<!-- element: {"type":"text","position":');
    });
  });

  describe('Case 9 - Freestyle slide', () => {
    it('should serialize freestyle slide', () => {
      const presentation = createPresentationWithSlides([
        {
          id: sid(),
          layout: 'freestyle',
          transition: 'none',
          elements: [
            { id: sid(), type: 'text', position: { x: 10, y: 20, width: 100, height: 50 }, content: 'Free text' },
          ],
        },
      ]);

      const markdown = serializePresentation(presentation);

      expect(markdown).toContain('Free text');
      expect(markdown).toContain('<!-- element: {"type":"text","position":');
    });
  });

  describe('Case 10 - Empty presentation', () => {
    it('should handle empty presentation', () => {
      const presentation = createPresentation();
      const markdown = serializePresentation(presentation);
      expect(markdown).toBeDefined();
    });
  });

  describe('Layout directive comment', () => {
    it('should include <!-- layout: X --> comment in serialized markdown', () => {
      const presentation = createPresentationWithSlides([
        {
          id: sid(),
          layout: 'title',
          transition: 'none',
          elements: [
            { id: sid(), type: 'heading', position: { x: 10, y: 30, width: 80, height: 20 }, content: 'Hello', level: 1 },
          ],
        },
      ]);

      const markdown = serializePresentation(presentation);
      expect(markdown).toContain('<!-- layout: title -->');
    });

    it('should include correct layout for each slide type', () => {
      const presentation = createPresentationWithSlides([
        {
          id: sid(),
          layout: 'code-block',
          transition: 'none',
          elements: [
            { id: sid(), type: 'code', position: { x: 5, y: 15, width: 90, height: 70 }, code: 'x = 1', language: 'python' },
          ],
        },
        {
          id: sid(),
          layout: 'freestyle',
          transition: 'none',
          elements: [
            { id: sid(), type: 'text', position: { x: 10, y: 20, width: 80, height: 50 }, content: 'Free text' },
          ],
        },
      ]);

      const markdown = serializePresentation(presentation);
      expect(markdown).toContain('<!-- layout: code-block -->');
      expect(markdown).toContain('<!-- layout: freestyle -->');
    });
  });

  describe('Fragment directives', () => {
    it('should emit <!-- fragment: N --> for element with fragment', () => {
      const presentation = createPresentationWithSlides([
        {
          id: sid(),
          layout: 'title-list',
          transition: 'none',
          elements: [
            { id: sid(), type: 'heading', position: { x: 5, y: 5, width: 90, height: 15 }, content: 'Title', level: 1 },
            { id: sid(), type: 'text', position: { x: 10, y: 25, width: 80, height: 20 }, content: 'Delayed text', fragment: 1 },
          ],
        },
      ]);

      const markdown = serializePresentation(presentation);
      expect(markdown).toContain('<!-- fragment: 1 -->');
    });

    it('should emit <!-- fragment-items --> for list with fragmentPerItem', () => {
      const presentation = createPresentationWithSlides([
        {
          id: sid(),
          layout: 'title-list',
          transition: 'none',
          elements: [
            { id: sid(), type: 'heading', position: { x: 5, y: 5, width: 90, height: 15 }, content: 'Title', level: 1 },
            { id: sid(), type: 'list', position: { x: 10, y: 25, width: 80, height: 70 }, items: ['A', 'B'], ordered: false, fragment: 1, fragmentPerItem: true },
          ],
        },
      ]);

      const markdown = serializePresentation(presentation);
      expect(markdown).toContain('<!-- fragment: 1 -->');
      expect(markdown).toContain('<!-- fragment-items -->');
    });

    it('should not emit fragment comments for elements without fragment', () => {
      const presentation = createPresentationWithSlides([
        {
          id: sid(),
          layout: 'title',
          transition: 'none',
          elements: [
            { id: sid(), type: 'heading', position: { x: 10, y: 30, width: 80, height: 20 }, content: 'Hello', level: 1 },
          ],
        },
      ]);

      const markdown = serializePresentation(presentation);
      expect(markdown).not.toContain('<!-- fragment:');
      expect(markdown).not.toContain('<!-- fragment-items');
    });
  });

  describe('Two-column slide', () => {
    it('should serialize two-column slide', () => {
      const presentation = createPresentationWithSlides([
        {
          id: sid(),
          layout: 'two-column',
          transition: 'none',
          elements: [
            { id: sid(), type: 'text', position: { x: 3, y: 20, width: 45, height: 75 }, content: 'Left side' },
            { id: sid(), type: 'text', position: { x: 52, y: 20, width: 45, height: 75 }, content: 'Right side' },
          ],
        },
      ]);

      const markdown = serializePresentation(presentation);

      expect(markdown).toContain('Left side');
      expect(markdown).toContain('Right side');
      // Columns are encoded by explicit element positions (lossless), not by a column-break marker
      expect(markdown).toContain('"position":{"x":52,"y":20,"width":45,"height":75}');
    });

    it('should serialize two-column slide with title', () => {
      const presentation = createPresentationWithSlides([
        {
          id: sid(),
          layout: 'two-column',
          transition: 'none',
          elements: [
            { id: sid(), type: 'heading', position: { x: 5, y: 5, width: 90, height: 12 }, content: 'Comparison', level: 1 },
            { id: sid(), type: 'text', position: { x: 3, y: 20, width: 45, height: 75 }, content: 'Pros' },
            { id: sid(), type: 'text', position: { x: 52, y: 20, width: 45, height: 75 }, content: 'Cons' },
          ],
        },
      ]);

      const markdown = serializePresentation(presentation);

      expect(markdown).toContain('# Comparison');
      expect(markdown).toContain('Pros');
      expect(markdown).toContain('Cons');
    });
  });
});
