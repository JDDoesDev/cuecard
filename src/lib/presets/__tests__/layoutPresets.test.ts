import { describe, it, expect } from 'vitest';
import { createPresetElements } from '../layoutPresets';
import { SlideElementSchema, type LayoutPreset } from '@/types/slide';

describe('createPresetElements', () => {
  it('title preset creates heading and text elements', () => {
    const elements = createPresetElements('title');
    expect(elements).toHaveLength(2);
    expect(elements[0].type).toBe('heading');
    expect(elements[1].type).toBe('text');

    if (elements[0].type === 'heading') {
      expect(elements[0].level).toBe(1);
    }
  });

  it('two-column preset creates heading and two text elements', () => {
    const elements = createPresetElements('two-column');
    expect(elements).toHaveLength(3);
    expect(elements[0].type).toBe('heading');
    expect(elements[1].type).toBe('text');
    expect(elements[2].type).toBe('text');
  });

  it('code-block preset creates heading, code, and text elements', () => {
    const elements = createPresetElements('code-block');
    expect(elements).toHaveLength(3);
    expect(elements[0].type).toBe('heading');
    expect(elements[1].type).toBe('code');
    expect(elements[2].type).toBe('text');

    if (elements[0].type === 'heading') {
      expect(elements[0].level).toBe(2);
    }
  });

  it('full-bleed-media preset creates image and text elements', () => {
    const elements = createPresetElements('full-bleed-media');
    expect(elements).toHaveLength(2);
    expect(elements[0].type).toBe('image');
    expect(elements[1].type).toBe('text');

    if (elements[0].type === 'image') {
      expect(elements[0].objectFit).toBe('cover');
      expect(elements[0].position).toEqual({ x: 0, y: 0, width: 100, height: 100 });
    }
  });

  it('title-list preset creates heading and list elements', () => {
    const elements = createPresetElements('title-list');
    expect(elements).toHaveLength(2);
    expect(elements[0].type).toBe('heading');
    expect(elements[1].type).toBe('list');

    if (elements[1].type === 'list') {
      expect(elements[1].items).toEqual([]);
      expect(elements[1].ordered).toBe(false);
    }
  });

  it('media-anywhere preset creates text and image elements', () => {
    const elements = createPresetElements('media-anywhere');
    expect(elements).toHaveLength(2);
    expect(elements[0].type).toBe('text');
    expect(elements[1].type).toBe('image');
  });

  it('freestyle preset creates empty elements array', () => {
    const elements = createPresetElements('freestyle');
    expect(elements).toHaveLength(0);
  });

  it('blank preset creates empty elements array', () => {
    const elements = createPresetElements('blank');
    expect(elements).toHaveLength(0);
  });

  it('all preset elements pass schema validation', () => {
    const layouts: LayoutPreset[] = [
      'title', 'two-column', 'code-block', 'full-bleed-media',
      'title-list', 'media-anywhere', 'freestyle', 'blank',
    ];

    for (const layout of layouts) {
      const elements = createPresetElements(layout);
      for (const el of elements) {
        expect(() => SlideElementSchema.parse(el)).not.toThrow();
      }
    }
  });

  it('all preset elements have unique IDs', () => {
    const elements = createPresetElements('two-column');
    const ids = elements.map((el) => el.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('positions are within 0-100 range', () => {
    const layouts: LayoutPreset[] = [
      'title', 'two-column', 'code-block', 'full-bleed-media',
      'title-list', 'media-anywhere',
    ];

    for (const layout of layouts) {
      const elements = createPresetElements(layout);
      for (const el of elements) {
        expect(el.position.x).toBeGreaterThanOrEqual(0);
        expect(el.position.x).toBeLessThanOrEqual(100);
        expect(el.position.y).toBeGreaterThanOrEqual(0);
        expect(el.position.y).toBeLessThanOrEqual(100);
        expect(el.position.width).toBeGreaterThan(0);
        expect(el.position.width).toBeLessThanOrEqual(100);
        expect(el.position.height).toBeGreaterThan(0);
        expect(el.position.height).toBeLessThanOrEqual(100);
      }
    }
  });
});
