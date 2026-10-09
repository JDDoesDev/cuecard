import { describe, it, expect } from 'vitest';
import { migratePresentation } from '../migrateSlide';
import { CURRENT_SCHEMA_VERSION } from '@/types/presentation';

function deck(schemaVersion: string | undefined, content: string) {
  return {
    ...(schemaVersion ? { schemaVersion } : {}),
    id: 'p1',
    title: 'T',
    theme: 'default',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    slides: [
      {
        id: 's1',
        layout: 'freestyle',
        elements: [{ id: 'e1', type: 'text', position: { x: 0, y: 0, width: 50, height: 20 }, content }],
      },
    ],
  };
}

function textOf(p: ReturnType<typeof migratePresentation>) {
  const el = p.slides[0].elements[0];
  return el.type === 'text' ? el.content : '';
}

describe('migratePresentation legacy text content', () => {
  it('converts 1.0 newline-separated text so lines stay separate paragraphs', () => {
    const p = migratePresentation(deck('1.0', 'Line 1\nLine 2'));
    expect(textOf(p)).not.toBe('Line 1\nLine 2');
    expect(p.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });

  it('treats a missing schemaVersion as legacy', () => {
    const p = migratePresentation(deck(undefined, 'a\nb'));
    expect(textOf(p)).not.toBe('a\nb');
  });

  it('leaves current-version content untouched', () => {
    const p = migratePresentation(deck(CURRENT_SCHEMA_VERSION, 'soft\nbreak'));
    expect(textOf(p)).toBe('soft\nbreak');
  });

  it('is a no-op for rich HTML content', () => {
    const html = '<p>One</p><p>Two</p>';
    expect(textOf(migratePresentation(deck('1.0', html)))).toBe(html);
  });
});

describe('migratePresentation nested list items', () => {
  it('drops Tiptap <p> wrappers inside nested list items, keeping other items intact', () => {
    const raw = deck(CURRENT_SCHEMA_VERSION, 'x');
    raw.slides[0].elements.push({
      id: 'e2', type: 'list', position: { x: 0, y: 0, width: 50, height: 20 },
      items: ['a<ul><li><p>b</p><ol start="2"><li><p>c</p></li></ol></li></ul>', '<strong>plain</strong>'], ordered: false,
    } as never);
    const el = migratePresentation(raw).slides[0].elements[1];
    expect(el.type === 'list' && el.items).toEqual(['a<ul><li>b<ol start="2"><li>c</li></ol></li></ul>', '<strong>plain</strong>']);
  });
});
