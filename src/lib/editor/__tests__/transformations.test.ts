/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { slideToTiptap, elementToHTML } from '../slideToTiptap';
import { tiptapToSlide } from '../tiptapToSlide';
import type { Slide, SlideElement } from '@/types/slide';

// ============================================================================
// Test Helpers
// ============================================================================

function sid() {
  return crypto.randomUUID();
}

function makeSlide(elements: SlideElement[], layout: Slide['layout'] = 'freestyle'): Slide {
  return {
    id: sid(),
    layout,
    transition: 'none',
    elements,
  };
}

// ============================================================================
// slideToTiptap (element → HTML) Tests
// ============================================================================

describe('slideToTiptap (element to HTML)', () => {
  it('converts heading element to HTML heading', () => {
    const element: SlideElement = {
      id: sid(), type: 'heading',
      position: { x: 10, y: 30, width: 80, height: 20 },
      content: 'Welcome', level: 1,
    };

    const html = elementToHTML(element);

    expect(html).toBe('<h1>Welcome</h1>');
  });

  it('converts heading with level 3', () => {
    const element: SlideElement = {
      id: sid(), type: 'heading',
      position: { x: 10, y: 30, width: 80, height: 20 },
      content: 'Section', level: 3,
    };

    const html = elementToHTML(element);

    expect(html).toBe('<h3>Section</h3>');
  });

  it('converts text element to HTML paragraphs', () => {
    const element: SlideElement = {
      id: sid(), type: 'text',
      position: { x: 15, y: 55, width: 70, height: 10 },
      content: 'Hello world',
    };

    const html = elementToHTML(element);

    expect(html).toBe('<p>Hello world</p>');
  });

  it('splits blank-line separated markdown into paragraphs (single newline = soft break)', () => {
    const element: SlideElement = {
      id: sid(), type: 'text',
      position: { x: 10, y: 20, width: 80, height: 40 },
      content: 'Line 1\n\nLine 2\nLine 3',
    };

    const html = elementToHTML(element);

    // The newline stays inside the paragraph; the editor collapses it to a space
    expect(html).toBe('<p>Line 1</p><p>Line 2\nLine 3</p>');
  });

  it('converts markdown formatting in imported text instead of showing it literally', () => {
    const element: SlideElement = {
      id: sid(), type: 'text',
      position: { x: 10, y: 20, width: 80, height: 40 },
      content: 'Plain hooks in `.module` raise *nothing* on **11.4.8**\n\n- one\n- two',
    };

    expect(elementToHTML(element)).toBe(
      '<p>Plain hooks in <code>.module</code> raise <em>nothing</em> on <strong>11.4.8</strong></p>' +
        '<ul><li>one</li><li>two</li></ul>'
    );
  });

  it('converts markdown formatting in headings and list items', () => {
    const heading: SlideElement = {
      id: sid(), type: 'heading', level: 2,
      position: { x: 10, y: 10, width: 80, height: 10 },
      content: 'Use `<ul>` *now*',
    };
    const list: SlideElement = {
      id: sid(), type: 'list',
      position: { x: 10, y: 25, width: 80, height: 70 },
      items: ['**Bold** item', 'Has `code`'], ordered: false,
    };

    expect(elementToHTML(heading)).toBe('<h2>Use <code>&lt;ul&gt;</code> <em>now</em></h2>');
    expect(elementToHTML(list)).toBe(
      '<ul><li><p><strong>Bold</strong> item</p></li><li><p>Has <code>code</code></p></li></ul>'
    );
  });

  it('passes through HTML content in text elements', () => {
    const element: SlideElement = {
      id: sid(), type: 'text',
      position: { x: 10, y: 20, width: 80, height: 40 },
      content: '<p>Hello <strong>bold</strong></p>',
    };

    const html = elementToHTML(element);

    expect(html).toBe('<p>Hello <strong>bold</strong></p>');
  });

  it('converts unordered list to HTML', () => {
    const element: SlideElement = {
      id: sid(), type: 'list',
      position: { x: 10, y: 25, width: 80, height: 70 },
      items: ['Item A', 'Item B'], ordered: false,
    };

    const html = elementToHTML(element);

    expect(html).toContain('<ul>');
    expect(html).toContain('<li><p>Item A</p></li>');
    expect(html).toContain('<li><p>Item B</p></li>');
  });

  it('converts ordered list to HTML', () => {
    const element: SlideElement = {
      id: sid(), type: 'list',
      position: { x: 10, y: 25, width: 80, height: 70 },
      items: ['First', 'Second'], ordered: true,
    };

    const html = elementToHTML(element);

    expect(html).toContain('<ol>');
  });

  it('returns empty paragraph for missing element', () => {
    const slide = makeSlide([
      { id: 'h1', type: 'heading', position: { x: 10, y: 30, width: 80, height: 20 }, content: 'Title', level: 1 },
    ]);

    const html = slideToTiptap(slide, 5);

    expect(html).toBe('<p></p>');
  });
});

// ============================================================================
// tiptapToSlide (HTML → element) Tests
// ============================================================================

describe('tiptapToSlide (HTML to element)', () => {
  it('extracts heading content from HTML', () => {
    const slide = makeSlide([
      { id: 'h1', type: 'heading', position: { x: 10, y: 30, width: 80, height: 20 }, content: 'Old', level: 1 },
    ]);

    const result = tiptapToSlide('<h1>New Title</h1>', slide, 0);

    if (result.elements[0].type === 'heading') {
      expect(result.elements[0].content).toBe('New Title');
      expect(result.elements[0].level).toBe(1);
    }
  });

  it('preserves heading rich text formatting', () => {
    const slide = makeSlide([
      { id: 'h1', type: 'heading', position: { x: 10, y: 30, width: 80, height: 20 }, content: 'Old', level: 2 },
    ]);

    const result = tiptapToSlide('<h2>Hello <strong>bold</strong> world</h2>', slide, 0);

    if (result.elements[0].type === 'heading') {
      expect(result.elements[0].content).toBe('Hello <strong>bold</strong> world');
    }
  });

  it('extracts text paragraphs from HTML', () => {
    const slide = makeSlide([
      { id: 't1', type: 'text', position: { x: 15, y: 55, width: 70, height: 10 }, content: 'Old' },
    ]);

    const result = tiptapToSlide('<p>Line 1</p><p>Line 2</p>', slide, 0);

    if (result.elements[0].type === 'text') {
      expect(result.elements[0].content).toBe('<p>Line 1</p><p>Line 2</p>');
    }
  });

  it('preserves text formatting in paragraphs', () => {
    const slide = makeSlide([
      { id: 't1', type: 'text', position: { x: 15, y: 55, width: 70, height: 10 }, content: 'Old' },
    ]);

    const result = tiptapToSlide('<p>Hello <em>italic</em> and <u>underline</u></p>', slide, 0);

    if (result.elements[0].type === 'text') {
      expect(result.elements[0].content).toBe('<p>Hello <em>italic</em> and <u>underline</u></p>');
    }
  });

  it('extracts list items from HTML', () => {
    const slide = makeSlide([
      { id: 'l1', type: 'list', position: { x: 10, y: 25, width: 80, height: 70 }, items: ['Old'], ordered: false },
    ]);

    const result = tiptapToSlide('<ul><li><p>Item A</p></li><li><p>Item B</p></li></ul>', slide, 0);

    if (result.elements[0].type === 'list') {
      expect(result.elements[0].items).toEqual(['Item A', 'Item B']);
      expect(result.elements[0].ordered).toBe(false);
    }
  });

  it('detects ordered list from HTML', () => {
    const slide = makeSlide([
      { id: 'l1', type: 'list', position: { x: 10, y: 25, width: 80, height: 70 }, items: ['Old'], ordered: false },
    ]);

    const result = tiptapToSlide('<ol><li><p>First</p></li><li><p>Second</p></li></ol>', slide, 0);

    if (result.elements[0].type === 'list') {
      expect(result.elements[0].ordered).toBe(true);
    }
  });

  it('preserves position and id', () => {
    const slide = makeSlide([
      { id: 'pos-test', type: 'heading', position: { x: 5, y: 5, width: 90, height: 12 }, content: 'Title', level: 1 },
    ]);

    const result = tiptapToSlide('<h1>New</h1>', slide, 0);

    expect(result.elements[0].id).toBe('pos-test');
    expect(result.elements[0].position).toEqual({ x: 5, y: 5, width: 90, height: 12 });
  });

  it('editing one element does not affect other elements', () => {
    const slide = makeSlide([
      { id: 'h1', type: 'heading', position: { x: 10, y: 30, width: 80, height: 20 }, content: 'Title', level: 1 },
      { id: 't1', type: 'text', position: { x: 15, y: 55, width: 70, height: 10 }, content: 'Subtitle' },
    ], 'title');

    const result = tiptapToSlide('<h1>New Title</h1>', slide, 0);

    if (result.elements[0].type === 'heading') {
      expect(result.elements[0].content).toBe('New Title');
    }
    if (result.elements[1].type === 'text') {
      expect(result.elements[1].content).toBe('Subtitle');
    }
  });

  it('returns original slide for out-of-bounds elementIndex', () => {
    const slide = makeSlide([
      { id: 'h1', type: 'heading', position: { x: 10, y: 30, width: 80, height: 20 }, content: 'Title', level: 1 },
    ]);

    const result = tiptapToSlide('<h1>New</h1>', slide, 5);

    expect(result).toEqual(slide);
  });
});

// ============================================================================
// Metadata Preservation Tests
// ============================================================================

describe('Metadata preservation', () => {
  it('preserves slide id, layout, transition', () => {
    const slide: Slide = {
      id: 'meta-test',
      layout: 'title',
      transition: 'zoom',
      elements: [
        { id: 'h1', type: 'heading', position: { x: 10, y: 30, width: 80, height: 20 }, content: 'Test', level: 1 },
      ],
    };

    const result = tiptapToSlide('<h1>Test</h1>', slide, 0);

    expect(result.id).toBe('meta-test');
    expect(result.layout).toBe('title');
    expect(result.transition).toBe('zoom');
  });

  it('preserves notes', () => {
    const slide: Slide = {
      id: 'notes-test',
      layout: 'title',
      transition: 'none',
      elements: [
        { id: 'h1', type: 'heading', position: { x: 10, y: 30, width: 80, height: 20 }, content: 'Test', level: 1 },
      ],
      notes: 'Important speaker notes',
    };

    const result = tiptapToSlide('<h1>Test</h1>', slide, 0);

    expect(result.notes).toBe('Important speaker notes');
  });
});
