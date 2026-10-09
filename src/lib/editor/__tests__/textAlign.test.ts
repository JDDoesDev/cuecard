/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { elementToHTML } from '../slideToTiptap';
import { tiptapToSlide } from '../tiptapToSlide';
import { getElementTextAlign, textAlignUpdates } from '../textAlign';
import type { Slide, SlideElement } from '@/types/slide';

const pos = { x: 10, y: 10, width: 80, height: 20 };

function slideWith(el: SlideElement): Slide {
  return { id: 's', layout: 'freestyle', transition: 'none', elements: [el] };
}

function convert(html: string, el: SlideElement): SlideElement {
  return tiptapToSlide(html, slideWith(el), 0).elements[0];
}

const heading = (extra: Record<string, unknown> = {}): SlideElement =>
  ({ id: 'h', type: 'heading', position: pos, content: 'Title', level: 1, ...extra }) as SlideElement;
const text = (content: string, extra: Record<string, unknown> = {}): SlideElement =>
  ({ id: 't', type: 'text', position: pos, content, ...extra }) as SlideElement;
const list = (items: string[], extra: Record<string, unknown> = {}): SlideElement =>
  ({ id: 'l', type: 'list', position: pos, items, ordered: false, ...extra }) as SlideElement;

describe('tiptapToSlide keeps alignment', () => {
  it('heading: centered heading stores textAlign on the element', () => {
    const result = convert('<h1 style="text-align: center">Title</h1>', heading());
    expect(getElementTextAlign(result)).toBe('center');
    expect(result.type === 'heading' && result.content).toBe('Title');
  });

  it('heading: left alignment clears the field', () => {
    const result = convert('<h1 style="text-align: left">Title</h1>', heading({ textAlign: 'center' }));
    expect(getElementTextAlign(result)).toBe('left');
    expect('textAlign' in result).toBe(false);
  });

  it('text: uniformly centered paragraphs collapse to the element field', () => {
    const result = convert(
      '<p style="text-align: center">Line 1</p><p style="text-align: center">Line 2</p>',
      text('Line 1\nLine 2')
    );
    expect(getElementTextAlign(result)).toBe('center');
    expect(result.type === 'text' && result.content).toBe('<p>Line 1</p><p>Line 2</p>');
  });

  it('text: mixed per-paragraph alignment is kept in the HTML', () => {
    const result = convert(
      '<p style="text-align: center">A</p><p>B</p>',
      text('A\nB')
    );
    expect(getElementTextAlign(result)).toBe('left');
    expect(result.type === 'text' && result.content).toBe('<p style="text-align: center">A</p><p>B</p>');
  });

  it('text: non-paragraph blocks are no longer dropped', () => {
    const result = convert('<p>Intro</p><ul><li><p>Point</p></li></ul>', text('Intro'));
    expect(result.type === 'text' && result.content).toContain('<ul>');
    expect(result.type === 'text' && result.content).toContain('Intro');
  });

  it('list: alignment on item paragraphs is stored on the element', () => {
    const result = convert(
      '<ul><li><p style="text-align: right">A</p></li><li><p style="text-align: right">B</p></li></ul>',
      list(['A', 'B'])
    );
    expect(getElementTextAlign(result)).toBe('right');
    expect(result.type === 'list' && result.items).toEqual(['A', 'B']);
  });

  it('heading: clear-formatting (heading -> paragraph) keeps the text', () => {
    const result = convert('<p>Title</p>', heading());
    expect(result.type === 'heading' && result.content).toBe('Title');
  });

  it('list: list converted to paragraphs keeps items', () => {
    const result = convert('<p>A</p><p>B</p>', list(['A', 'B']));
    expect(result.type === 'list' && result.items).toEqual(['A', 'B']);
  });
});

describe('slideToTiptap expands element alignment', () => {
  it('heading', () => {
    expect(elementToHTML(heading({ textAlign: 'center' }))).toBe('<h1 style="text-align: center">Title</h1>');
  });

  it('markdown paragraphs', () => {
    expect(elementToHTML(text('A\n\nB', { textAlign: 'right' }))).toBe(
      '<p style="text-align: right">A</p><p style="text-align: right">B</p>'
    );
  });

  it('block HTML text keeps explicit per-paragraph alignment', () => {
    const html = elementToHTML(text('<p style="text-align: right">A</p><p>B</p>', { textAlign: 'center' }));
    expect(html).toMatch(/<p style="text-align: right;?">A<\/p>/);
    expect(html).toMatch(/<p style="text-align: center;?">B<\/p>/);
  });

  it('list items', () => {
    expect(elementToHTML(list(['A'], { textAlign: 'center' }))).toBe(
      '<ul><li><p style="text-align: center">A</p></li></ul>'
    );
  });

  it('no alignment produces the original markup', () => {
    expect(elementToHTML(heading())).toBe('<h1>Title</h1>');
    expect(elementToHTML(text('A'))).toBe('<p>A</p>');
  });
});

describe('round trip', () => {
  it.each([
    ['heading', heading({ textAlign: 'center' })],
    ['text', text('<p>One</p><p>Two</p>', { textAlign: 'justify' })],
    ['list', list(['x', 'y'], { textAlign: 'right' })],
  ])('%s alignment survives editor -> store -> editor', (_name, el) => {
    const html = elementToHTML(el);
    const back = convert(html, el);
    expect(getElementTextAlign(back)).toBe(getElementTextAlign(el));
    expect(back).toEqual(el);
  });
});

describe('textAlignUpdates (whole element, outside edit mode)', () => {
  it('sets the field and strips conflicting paragraph alignment from text', () => {
    const el = text('<p style="text-align: right">A</p><p>B</p>');
    const updates = textAlignUpdates(el, 'center');
    expect((updates as { textAlign?: string }).textAlign).toBe('center');
    expect((updates as { content?: string }).content).toBe('<p>A</p><p>B</p>');
  });

  it('left clears the field', () => {
    const updates = textAlignUpdates(heading({ textAlign: 'center' }), 'left');
    expect((updates as { textAlign?: string }).textAlign).toBeUndefined();
  });

  it('ignores non-text elements', () => {
    const img = { id: 'i', type: 'image', position: pos, url: 'a.png' } as SlideElement;
    expect(textAlignUpdates(img, 'center')).toEqual({});
  });
});

describe('list alignment uses the majority of items', () => {
  it('two of three centered items -> center', () => {
    const result = convert(
      '<ul><li><p>A</p></li><li><p style="text-align: center">B</p></li><li><p style="text-align: center">C</p></li></ul>',
      list(['A', 'B', 'C'])
    );
    expect(getElementTextAlign(result)).toBe('center');
  });

  it('a tie prefers the newly applied alignment', () => {
    const result = convert(
      '<ul><li><p style="text-align: right">A</p></li><li><p>B</p></li></ul>',
      list(['A', 'B'])
    );
    expect(getElementTextAlign(result)).toBe('right');
  });
});

describe('getTextAlignState', () => {
  it('reports mixed per-paragraph alignment', async () => {
    const { getTextAlignState } = await import('../textAlign');
    expect(getTextAlignState(text('<p style="text-align: center">A</p><p>B</p>'))).toBe('mixed');
    expect(getTextAlignState(text('<p>A</p>', { textAlign: 'right' }))).toBe('right');
  });
});
