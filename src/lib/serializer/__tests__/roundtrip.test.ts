import { describe, it, expect } from 'vitest';
import { parsePresentation } from '../../parser/parsePresentation';
import { serializePresentation } from '../serializePresentation';
import { createPresentation } from '../../../types/presentation';
import type { Presentation, Slide } from '../../../types/presentation';

/**
 * Round-trip tests prove lossless bidirectional transformation:
 * - RT-1: markdown -> JSON -> markdown -> JSON (content-stable)
 * - RT-2: JSON -> markdown -> JSON (content-stable)
 */

describe('Round-trip tests', () => {
  // Normalize volatile fields (IDs, timestamps) for comparison
  function normalizePresentation(p: Presentation): any {
    return {
      ...p,
      id: 'NORMALIZED',
      createdAt: 'NORMALIZED',
      updatedAt: 'NORMALIZED',
      metadata: p.metadata || undefined,
      slides: p.slides.map((s) => ({
        ...s,
        id: 'NORMALIZED',
        elements: s.elements.map((el) => ({
          ...el,
          id: 'NORMALIZED',
        })),
      })),
    };
  }

  function sid() {
    return crypto.randomUUID();
  }

  describe('RT-1: Markdown -> JSON -> Markdown -> JSON', () => {
    it('should preserve content through parse-serialize-parse cycle', async () => {
      const originalMarkdown = `---
title: Test Deck
theme: dark
---

# Welcome

Introduction slide

---

# Topics

- Point 1
- Point 2
- Point 3`;

      const presentation = await parsePresentation(originalMarkdown);
      const serialized = serializePresentation(presentation);
      const reparsed = await parsePresentation(serialized);

      expect(normalizePresentation(reparsed)).toEqual(normalizePresentation(presentation));
    });
  });

  describe('RT-2: JSON -> Markdown -> JSON', () => {
    it('should preserve content through serialize-parse cycle', async () => {
      const originalPresentation = createPresentation();
      originalPresentation.title = 'Test Deck';
      originalPresentation.theme = 'light';
      originalPresentation.slides = [
        {
          id: sid(),
          layout: 'title',
          transition: 'none',
          elements: [
            { id: sid(), type: 'heading', position: { x: 10, y: 30, width: 80, height: 20 }, content: 'Welcome', level: 1 },
            { id: sid(), type: 'text', position: { x: 15, y: 55, width: 70, height: 10 }, content: 'Introduction' },
          ],
        },
        {
          id: sid(),
          layout: 'title-list',
          transition: 'fade',
          elements: [
            { id: sid(), type: 'heading', position: { x: 5, y: 5, width: 90, height: 15 }, content: 'Topics', level: 1 },
            { id: sid(), type: 'list', position: { x: 10, y: 25, width: 80, height: 70 }, items: ['A', 'B', 'C'], ordered: false },
          ],
        },
      ];

      const markdown = serializePresentation(originalPresentation);
      const parsed = await parsePresentation(markdown);

      expect(normalizePresentation(parsed)).toEqual(normalizePresentation(originalPresentation));
    });
  });

  describe('RT-3: Each layout round-trips', () => {
    it('should round-trip title slide', async () => {
      const presentation = createPresentation();
      presentation.slides = [
        {
          id: sid(),
          layout: 'title',
          transition: 'none',
          elements: [
            { id: sid(), type: 'heading', position: { x: 10, y: 30, width: 80, height: 20 }, content: 'Hello', level: 1 },
            { id: sid(), type: 'text', position: { x: 15, y: 55, width: 70, height: 10 }, content: 'World' },
          ],
        },
      ];

      const markdown = serializePresentation(presentation);
      const parsed = await parsePresentation(markdown);
      expect(normalizePresentation(parsed)).toEqual(normalizePresentation(presentation));
    });

    it('should round-trip title-list slide', async () => {
      const presentation = createPresentation();
      presentation.slides = [
        {
          id: sid(),
          layout: 'title-list',
          transition: 'none',
          elements: [
            { id: sid(), type: 'heading', position: { x: 5, y: 5, width: 90, height: 15 }, content: 'Topics', level: 1 },
            { id: sid(), type: 'list', position: { x: 10, y: 25, width: 80, height: 70 }, items: ['A', 'B', 'C'], ordered: false },
          ],
        },
      ];

      const markdown = serializePresentation(presentation);
      const parsed = await parsePresentation(markdown);
      expect(normalizePresentation(parsed)).toEqual(normalizePresentation(presentation));
    });

    it('should round-trip code-block slide', async () => {
      const presentation = createPresentation();
      presentation.slides = [
        {
          id: sid(),
          layout: 'code-block',
          transition: 'none',
          elements: [
            { id: sid(), type: 'heading', position: { x: 5, y: 3, width: 90, height: 10 }, content: 'Example', level: 2 },
            { id: sid(), type: 'code', position: { x: 5, y: 15, width: 90, height: 70 }, code: 'const x = 1;', language: 'typescript' },
          ],
        },
      ];

      const markdown = serializePresentation(presentation);
      const parsed = await parsePresentation(markdown);
      expect(normalizePresentation(parsed)).toEqual(normalizePresentation(presentation));
    });

    it('should round-trip full-bleed-media slide', async () => {
      const presentation = createPresentation();
      presentation.slides = [
        {
          id: sid(),
          layout: 'full-bleed-media',
          transition: 'none',
          elements: [
            { id: sid(), type: 'image', position: { x: 0, y: 0, width: 100, height: 100 }, url: 'bg.jpg', objectFit: 'cover' },
          ],
        },
      ];

      const markdown = serializePresentation(presentation);
      const parsed = await parsePresentation(markdown);
      expect(normalizePresentation(parsed)).toEqual(normalizePresentation(presentation));
    });

    it('should round-trip two-column slide', async () => {
      const presentation = createPresentation();
      presentation.slides = [
        {
          id: sid(),
          layout: 'two-column',
          transition: 'none',
          elements: [
            { id: sid(), type: 'heading', position: { x: 5, y: 5, width: 90, height: 12 }, content: 'Comparison', level: 1 },
            { id: sid(), type: 'text', position: { x: 3, y: 20, width: 45, height: 75 }, content: 'Left' },
            { id: sid(), type: 'text', position: { x: 52, y: 20, width: 45, height: 75 }, content: 'Right' },
          ],
        },
      ];

      const markdown = serializePresentation(presentation);
      const parsed = await parsePresentation(markdown);
      expect(normalizePresentation(parsed)).toEqual(normalizePresentation(presentation));
    });

    it('should round-trip media-anywhere slide', async () => {
      const presentation = createPresentation();
      presentation.slides = [
        {
          id: sid(),
          layout: 'media-anywhere',
          transition: 'none',
          elements: [
            { id: sid(), type: 'text', position: { x: 5, y: 5, width: 50, height: 90 }, content: 'Description' },
            { id: sid(), type: 'image', position: { x: 58, y: 10, width: 38, height: 60 }, url: 'photo.jpg' },
          ],
        },
      ];

      const markdown = serializePresentation(presentation);
      const parsed = await parsePresentation(markdown);
      expect(normalizePresentation(parsed)).toEqual(normalizePresentation(presentation));
    });

    it('should round-trip freestyle slide', async () => {
      const presentation = createPresentation();
      presentation.slides = [
        {
          id: sid(),
          layout: 'freestyle',
          transition: 'none',
          elements: [
            { id: sid(), type: 'text', position: { x: 10, y: 20, width: 100, height: 50 }, content: 'Free text' },
          ],
        },
      ];

      const markdown = serializePresentation(presentation);
      const parsed = await parsePresentation(markdown);
      expect(normalizePresentation(parsed)).toEqual(normalizePresentation(presentation));
    });
  });

  describe('RT-4: Speaker notes survive round-trip', () => {
    it('should preserve simple speaker notes', async () => {
      const presentation = createPresentation();
      presentation.slides = [
        {
          id: sid(),
          layout: 'title',
          transition: 'none',
          elements: [
            { id: sid(), type: 'heading', position: { x: 10, y: 30, width: 80, height: 20 }, content: 'Hello', level: 1 },
          ],
          notes: 'Remember to pause here',
        },
      ];

      const markdown = serializePresentation(presentation);
      const parsed = await parsePresentation(markdown);
      expect(normalizePresentation(parsed)).toEqual(normalizePresentation(presentation));
    });

    it('should preserve multi-line speaker notes with lists', async () => {
      const notes = `- Remember to mention X
- Don't forget **Y**

More detailed notes here`;
      const presentation = createPresentation();
      presentation.slides = [
        {
          id: sid(),
          layout: 'title',
          transition: 'none',
          elements: [
            { id: sid(), type: 'heading', position: { x: 10, y: 30, width: 80, height: 20 }, content: 'Hello', level: 1 },
          ],
          notes,
        },
      ];

      const markdown = serializePresentation(presentation);
      expect(markdown).toContain('???');

      const parsed = await parsePresentation(markdown);
      expect(parsed.slides[0].notes).toContain('Remember to mention X');
      expect(parsed.slides[0].notes).toContain("Don't forget **Y**");
      expect(parsed.slides[0].notes).toContain('More detailed notes here');
    });
  });

  describe('RT-5: Frontmatter survives round-trip', () => {
    it('should preserve title and theme', async () => {
      const presentation = createPresentation();
      presentation.title = 'My Deck';
      presentation.theme = 'dark';

      const markdown = serializePresentation(presentation);
      const parsed = await parsePresentation(markdown);

      expect(parsed.title).toBe('My Deck');
      expect(parsed.theme).toBe('dark');
    });
  });
});
