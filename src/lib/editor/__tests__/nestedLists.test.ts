/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach } from 'vitest';
import { Editor } from '@tiptap/core';
import { getEditorExtensions } from '../tiptapSchema';
import { elementToHTML } from '../slideToTiptap';
import { tiptapToSlide } from '../tiptapToSlide';
import { normalizeListItem, splitListItem } from '../listItems';
import type { ListElement, Slide } from '@/types/slide';
import { slideToMarkdown } from '@/lib/serializer/slideToMarkdown';

const list = (items: string[], ordered: boolean, extra: Partial<ListElement> = {}): ListElement => ({
  id: 'l1', type: 'list', position: { x: 0, y: 0, width: 50, height: 50 }, items, ordered, ...extra,
});
const slideOf = (el: ListElement): Slide => ({ id: 's1', layout: 'freestyle', transition: 'none', elements: [el] });

let editor: Editor | null = null;
afterEach(() => {
  editor?.destroy();
  editor = null;
});

/** Load an element into a real Tiptap editor and convert its HTML back. */
function throughEditor(el: ListElement, edit?: (e: Editor) => void): ListElement {
  editor = new Editor({ extensions: getEditorExtensions(), content: elementToHTML(el) });
  edit?.(editor);
  return tiptapToSlide(editor.getHTML(), slideOf(el), 0).elements[0] as ListElement;
}

describe('listItems helpers', () => {
  it('splits item text from nested lists', () => {
    expect(splitListItem('a<ol start="2"><li>b</li></ol>')).toMatchObject({ text: 'a', nested: '<ol start="2"><li>b</li></ol>' });
    expect(splitListItem('**plain**')).toEqual({ text: '**plain**', nested: '', lists: null });
  });

  it('normalizes Tiptap <p> wrappers in nested items (idempotent)', () => {
    const once = normalizeListItem('a<ul><li><p style="text-align: center">b</p><ol><li><p>c</p></li></ol></li></ul>');
    expect(once).toBe('a<ul><li>b<ol><li>c</li></ol></li></ul>');
    expect(normalizeListItem(once)).toBe(once);
    expect(normalizeListItem('<p>x</p>')).toBe('<p>x</p>');
  });
});

describe('nested lists through Tiptap', () => {
  it('preserves nesting, mixed list types, start and inline formatting', () => {
    const el = list(
      [
        '<strong>Top</strong> <em>i</em><ul><li><a href="https://x">link</a> <code>c</code><ol start="3"><li>deep</li><li>deeper</li></ol></li><li>sib</li></ul>',
        'Second',
      ],
      true,
      { start: 4 },
    );
    const html = elementToHTML(el);
    expect(html.startsWith('<ol start="4">')).toBe(true);
    const out = throughEditor(el);
    expect(out.ordered).toBe(true);
    expect(out.start).toBe(4);
    expect(out.items).toHaveLength(2);
    expect(out.items[0]).toBe(el.items[0]);
    expect(out.items[1]).toBe('Second');
  });

  it('round-trips canonical nested items unchanged', () => {
    const el = list(['a<ul><li>b<ul><li>c</li></ul></li></ul>', 'd'], false);
    expect(throughEditor(el).items).toEqual(el.items);
  });

  it('Tab nests the current item (sinkListItem) and Shift-Tab lifts it back', () => {
    const el = list(['one', 'two'], false);
    const out = throughEditor(el, (e) => {
      // Cursor inside "two"
      let pos = 0;
      e.state.doc.descendants((node, p) => {
        if (node.isText && node.text === 'two') pos = p + 1;
      });
      e.commands.setTextSelection(pos);
      expect(e.commands.sinkListItem('listItem')).toBe(true);
    });
    expect(out.items).toEqual(['one<ul><li>two</li></ul>']);

    const back = throughEditor(out, (e) => {
      let pos = 0;
      e.state.doc.descendants((node, p) => {
        if (node.isText && node.text === 'two') pos = p + 1;
      });
      e.commands.setTextSelection(pos);
      expect(e.commands.liftListItem('listItem')).toBe(true);
    });
    expect(back.items).toEqual(['one', 'two']);
  });

  it('drops start when the list becomes a bullet list', () => {
    const el = list(['a', 'b'], true, { start: 5 });
    const out = throughEditor(el, (e) => {
      e.commands.selectAll();
      e.commands.toggleBulletList();
    });
    expect(out.ordered).toBe(false);
    expect(out.start).toBeUndefined();
  });

  it('keeps start=1 implicit and reads start from the top <ol>', () => {
    const el = list(['a'], true);
    expect(elementToHTML(el)).toBe('<ol><li><p>a</p></li></ol>');
    const out = tiptapToSlide('<ol start="0"><li><p>a</p></li></ol>', slideOf(el), 0).elements[0] as ListElement;
    expect(out.start).toBe(0);
  });
});

describe('links edited in Tiptap', () => {
  it('are stored without Tiptap target/rel and export as markdown links', () => {
    const el = list(['see <a href="https://x.dev">docs</a><ul><li><a href="https://y.dev">y</a></li></ul>'], false);
    const html = (() => {
      editor = new Editor({ extensions: getEditorExtensions(), content: elementToHTML(el) });
      return editor.getHTML();
    })();
    expect(html).toContain('target="_blank"');
    const out = tiptapToSlide(html, slideOf(el), 0).elements[0] as ListElement;
    expect(out.items).toEqual(el.items);
    const md = slideToMarkdown(slideOf(out));
    expect(md).toContain('- see [docs](https://x.dev)\n  - [y](https://y.dev)');
  });

  it('keeps custom rel/target values', () => {
    const el = list(['x'], false);
    const out = tiptapToSlide('<ul><li><p><a href="/a" target="_self" rel="external">a</a></p></li></ul>', slideOf(el), 0)
      .elements[0] as ListElement;
    expect(out.items).toEqual(['<a href="/a" target="_self" rel="external">a</a>']);
  });
});

describe('review regressions', () => {
  const codeItems = [
    'Use `<ul>` and `<p>` tags',
    'Use `<ul><li>x</li></ul>` literally',
    'Use <code>&lt;ul&gt;</code> and <code><ul><li><p>x</p></li></ul></code>',
    'a<ul><li>b</li></ul> trailing text',
    'a<ol type="a"><li><p>b</p></li></ol>',
  ];

  it('never splits or rewrites list markup inside code / non-trailing blocks', () => {
    for (const item of codeItems) {
      expect(splitListItem(item).lists).toBeNull();
      expect(normalizeListItem(item)).toBe(item);
    }
  });

  it('elementToHTML keeps such items in one paragraph', () => {
    expect(elementToHTML(list(['Use `<ul>` and `<p>` tags'], false))).toBe('<ul><li><p>Use `<ul>` and `<p>` tags</p></li></ul>');
  });

  it('joins several paragraphs of a nested item with <br>', () => {
    expect(normalizeListItem('a<ul><li><p>A</p><p>B</p><ol start="1"><li><p>c</p></li></ol></li></ul>'))
      .toBe('a<ul><li>A<br>B<ol><li>c</li></ol></li></ul>');
    const out = tiptapToSlide('<ul><li><p>A</p><p>B</p></li></ul>', slideOf(list(['x'], false)), 0).elements[0] as ListElement;
    expect(out.items).toEqual(['A<br>B']);
  });

  it('keeps target/rel unless they are exactly Tiptap\'s default pair', () => {
    const el = list(['x'], false);
    const read = (a: string) => (tiptapToSlide(`<ul><li><p>${a}</p></li></ul>`, slideOf(el), 0).elements[0] as ListElement).items[0];
    expect(read('<a target="_blank" rel="noopener noreferrer nofollow" href="https://x">x</a>')).toBe('<a href="https://x">x</a>');
    expect(read('<a target="_blank" rel="nofollow" href="https://x">x</a>')).toBe('<a target="_blank" rel="nofollow" href="https://x">x</a>');
  });

  it('ignores a non-integer start', () => {
    expect(elementToHTML(list(['a'], true, { start: 2.5 }))).toBe('<ol><li><p>a</p></li></ol>');
  });
});
