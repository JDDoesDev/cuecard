import { describe, it, expect } from 'vitest';
import { migrateSlide } from '../migrateSlide';
import { SlideSchema, type LegacySlide } from '@/types/slide';

describe('migrateSlide', () => {
  describe('TitleSlide migration', () => {
    it('migrates title slide with title and subtitle', () => {
      const legacy: LegacySlide = {
        id: 'title-1',
        layout: 'title',
        transition: 'fade',
        title: 'Welcome',
        subtitle: 'Intro text',
        notes: 'Speaker notes',
      };

      const result = migrateSlide(legacy);

      expect(result.id).toBe('title-1');
      expect(result.layout).toBe('title');
      expect(result.transition).toBe('fade');
      expect(result.notes).toBe('Speaker notes');
      expect(result.elements).toHaveLength(2);

      const heading = result.elements[0];
      expect(heading.type).toBe('heading');
      if (heading.type === 'heading') {
        expect(heading.content).toBe('Welcome');
        expect(heading.level).toBe(1);
      }

      const subtitle = result.elements[1];
      expect(subtitle.type).toBe('text');
      if (subtitle.type === 'text') {
        expect(subtitle.content).toBe('Intro text');
      }
    });

    it('migrates title slide without subtitle', () => {
      const legacy: LegacySlide = {
        id: 'title-2',
        layout: 'title',
        transition: 'none',
        title: 'Title Only',
      };

      const result = migrateSlide(legacy);

      expect(result.elements).toHaveLength(1);
      expect(result.elements[0].type).toBe('heading');
    });

    it('produces valid Slide schema output', () => {
      const legacy: LegacySlide = {
        id: 'title-v',
        layout: 'title',
        transition: 'none',
        title: 'Validate Me',
        subtitle: 'Sub',
      };

      const result = migrateSlide(legacy);
      expect(() => SlideSchema.parse(result)).not.toThrow();
    });
  });

  describe('TwoColumnSlide migration', () => {
    it('migrates two-column slide with title', () => {
      const legacy: LegacySlide = {
        id: 'twocol-1',
        layout: 'two-column',
        transition: 'slide',
        title: 'Comparison',
        leftContent: 'Left side',
        rightContent: 'Right side',
        notes: 'Compare these',
      };

      const result = migrateSlide(legacy);

      expect(result.layout).toBe('two-column');
      expect(result.elements).toHaveLength(3);
      expect(result.elements[0].type).toBe('heading');
      expect(result.elements[1].type).toBe('text');
      expect(result.elements[2].type).toBe('text');

      if (result.elements[1].type === 'text') {
        expect(result.elements[1].content).toBe('Left side');
      }
      if (result.elements[2].type === 'text') {
        expect(result.elements[2].content).toBe('Right side');
      }
    });

    it('migrates two-column slide without title', () => {
      const legacy: LegacySlide = {
        id: 'twocol-2',
        layout: 'two-column',
        transition: 'none',
        leftContent: 'L',
        rightContent: 'R',
      };

      const result = migrateSlide(legacy);

      expect(result.elements).toHaveLength(2);
      expect(result.elements[0].type).toBe('text');
      expect(result.elements[1].type).toBe('text');
    });
  });

  describe('CodeBlockSlide migration', () => {
    it('migrates code-block slide with all fields', () => {
      const legacy: LegacySlide = {
        id: 'code-1',
        layout: 'code-block',
        transition: 'zoom',
        title: 'Example',
        code: 'const x = 1;',
        language: 'typescript',
        caption: 'Simple var',
        notes: 'Explain syntax',
      };

      const result = migrateSlide(legacy);

      expect(result.layout).toBe('code-block');
      expect(result.elements).toHaveLength(3);

      expect(result.elements[0].type).toBe('heading');
      if (result.elements[0].type === 'heading') {
        expect(result.elements[0].content).toBe('Example');
        expect(result.elements[0].level).toBe(2);
      }

      expect(result.elements[1].type).toBe('code');
      if (result.elements[1].type === 'code') {
        expect(result.elements[1].code).toBe('const x = 1;');
        expect(result.elements[1].language).toBe('typescript');
      }

      expect(result.elements[2].type).toBe('text');
      if (result.elements[2].type === 'text') {
        expect(result.elements[2].content).toBe('Simple var');
      }
    });

    it('migrates code-block slide without optional fields', () => {
      const legacy: LegacySlide = {
        id: 'code-2',
        layout: 'code-block',
        transition: 'none',
        code: 'print("hi")',
        language: 'python',
      };

      const result = migrateSlide(legacy);

      expect(result.elements).toHaveLength(1);
      expect(result.elements[0].type).toBe('code');
    });
  });

  describe('FullBleedMediaSlide migration', () => {
    it('migrates full-bleed image slide', () => {
      const legacy: LegacySlide = {
        id: 'media-1',
        layout: 'full-bleed-media',
        transition: 'none',
        mediaUrl: 'bg.jpg',
        mediaType: 'image',
        caption: 'Background',
      };

      const result = migrateSlide(legacy);

      expect(result.layout).toBe('full-bleed-media');
      expect(result.elements).toHaveLength(2);

      expect(result.elements[0].type).toBe('image');
      if (result.elements[0].type === 'image') {
        expect(result.elements[0].url).toBe('bg.jpg');
        expect(result.elements[0].objectFit).toBe('cover');
        expect(result.elements[0].position).toEqual({ x: 0, y: 0, width: 100, height: 100 });
      }

      expect(result.elements[1].type).toBe('text');
      if (result.elements[1].type === 'text') {
        expect(result.elements[1].content).toBe('Background');
      }
    });

    it('migrates full-bleed video slide', () => {
      const legacy: LegacySlide = {
        id: 'media-2',
        layout: 'full-bleed-media',
        transition: 'none',
        mediaUrl: 'video.mp4',
        mediaType: 'video',
      };

      const result = migrateSlide(legacy);

      expect(result.elements).toHaveLength(1);
      expect(result.elements[0].type).toBe('video');
      if (result.elements[0].type === 'video') {
        expect(result.elements[0].url).toBe('video.mp4');
      }
    });
  });

  describe('TitleListSlide migration', () => {
    it('migrates title-list slide', () => {
      const legacy: LegacySlide = {
        id: 'list-1',
        layout: 'title-list',
        transition: 'none',
        title: 'Agenda',
        items: ['Intro', 'Main', 'Q&A'],
      };

      const result = migrateSlide(legacy);

      expect(result.layout).toBe('title-list');
      expect(result.elements).toHaveLength(2);

      expect(result.elements[0].type).toBe('heading');
      if (result.elements[0].type === 'heading') {
        expect(result.elements[0].content).toBe('Agenda');
      }

      expect(result.elements[1].type).toBe('list');
      if (result.elements[1].type === 'list') {
        expect(result.elements[1].items).toEqual(['Intro', 'Main', 'Q&A']);
        expect(result.elements[1].ordered).toBe(false);
      }
    });
  });

  describe('MediaAnywhereSlide migration', () => {
    it('migrates media-anywhere slide with image', () => {
      const legacy: LegacySlide = {
        id: 'ma-1',
        layout: 'media-anywhere',
        transition: 'fade',
        content: 'Description',
        media: {
          url: 'photo.jpg',
          type: 'image',
          position: { x: 58, y: 10, width: 38, height: 60 },
        },
        notes: 'Show photo',
      };

      const result = migrateSlide(legacy);

      expect(result.layout).toBe('media-anywhere');
      expect(result.notes).toBe('Show photo');
      expect(result.elements).toHaveLength(2);

      expect(result.elements[0].type).toBe('text');
      if (result.elements[0].type === 'text') {
        expect(result.elements[0].content).toBe('Description');
      }

      expect(result.elements[1].type).toBe('image');
      if (result.elements[1].type === 'image') {
        expect(result.elements[1].url).toBe('photo.jpg');
        expect(result.elements[1].position).toEqual({ x: 58, y: 10, width: 38, height: 60 });
      }
    });

    it('migrates media-anywhere slide with video', () => {
      const legacy: LegacySlide = {
        id: 'ma-2',
        layout: 'media-anywhere',
        transition: 'none',
        content: 'Video content',
        media: {
          url: 'clip.mp4',
          type: 'video',
          position: { x: 10, y: 10, width: 50, height: 50 },
        },
      };

      const result = migrateSlide(legacy);

      expect(result.elements[1].type).toBe('video');
      if (result.elements[1].type === 'video') {
        expect(result.elements[1].url).toBe('clip.mp4');
      }
    });
  });

  describe('FreestyleSlide migration', () => {
    it('migrates freestyle slide with text elements', () => {
      const legacy: LegacySlide = {
        id: 'fs-1',
        layout: 'freestyle',
        transition: 'zoom',
        elements: [
          {
            id: 'el-1',
            type: 'text',
            content: 'First',
            position: { x: 10, y: 10, width: 30, height: 20 },
          },
          {
            id: 'el-2',
            type: 'text',
            content: 'Second',
            position: { x: 50, y: 50, width: 40, height: 25 },
          },
        ],
        notes: 'Custom layout',
      };

      const result = migrateSlide(legacy);

      expect(result.layout).toBe('freestyle');
      expect(result.notes).toBe('Custom layout');
      expect(result.elements).toHaveLength(2);

      expect(result.elements[0].type).toBe('text');
      if (result.elements[0].type === 'text') {
        expect(result.elements[0].id).toBe('el-1');
        expect(result.elements[0].content).toBe('First');
        expect(result.elements[0].position).toEqual({ x: 10, y: 10, width: 30, height: 20 });
      }
    });

    it('migrates freestyle slide with empty elements', () => {
      const legacy: LegacySlide = {
        id: 'fs-2',
        layout: 'freestyle',
        transition: 'none',
        elements: [],
      };

      const result = migrateSlide(legacy);

      expect(result.elements).toHaveLength(0);
    });
  });

  describe('Schema validation', () => {
    it('all migrated slides pass SlideSchema validation', () => {
      const legacySlides: LegacySlide[] = [
        { id: 'v1', layout: 'title', transition: 'none', title: 'T', subtitle: 'S' },
        { id: 'v2', layout: 'two-column', transition: 'none', title: 'T', leftContent: 'L', rightContent: 'R' },
        { id: 'v3', layout: 'code-block', transition: 'none', title: 'T', code: 'c', language: 'js', caption: 'Cap' },
        { id: 'v4', layout: 'full-bleed-media', transition: 'none', mediaUrl: 'u', mediaType: 'image', caption: 'C' },
        { id: 'v5', layout: 'title-list', transition: 'none', title: 'T', items: ['A'] },
        { id: 'v6', layout: 'media-anywhere', transition: 'none', content: 'C', media: { url: 'u', type: 'image', position: { x: 0, y: 0, width: 50, height: 50 } } },
        { id: 'v7', layout: 'freestyle', transition: 'none', elements: [{ id: 'e', type: 'text', content: 'T', position: { x: 0, y: 0, width: 10, height: 10 } }] },
      ];

      for (const legacy of legacySlides) {
        const result = migrateSlide(legacy);
        expect(() => SlideSchema.parse(result)).not.toThrow();
      }
    });
  });
});
