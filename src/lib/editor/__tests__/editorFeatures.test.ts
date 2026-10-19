/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach } from 'vitest';
import { Editor } from '@tiptap/core';
import { getEditorExtensions } from '../tiptapSchema';
import { elementToHTML } from '../slideToTiptap';
import { tiptapToSlide } from '../tiptapToSlide';
import { normalizeLinkHref, isAllowedLinkHref } from '../links';
import { htmlToRichMarkdown, richMarkdownToHtml } from '../richTextMarkdown';
import * as cmd from '../editorCommands';
import { sanitizeHtml } from '@/lib/security/sanitize';
import { collectPresentationFonts } from '@/lib/fonts/presentationFonts';
import { createPresentation } from '@/types/presentation';
import type { HeadingElement, ListElement, Slide, SlideElement, TextElement } from '@/types/slide';

const pos = { x: 0, y: 0, width: 50, height: 50 };
const text = (content: string, extra: Partial<TextElement> = {}): TextElement => ({ id: 't', type: 'text', position: pos, content, ...extra });
const heading = (content: string, extra: Partial<HeadingElement> = {}): HeadingElement => ({ id: 'h', type: 'heading', position: pos, content, level: 1, ...extra });
const list = (items: string[], extra: Partial<ListElement> = {}): ListElement => ({ id: 'l', type: 'list', position: pos, items, ordered: false, ...extra });
const slideOf = (el: SlideElement): Slide => ({ id: 's', layout: 'freestyle', transition: 'none', elements: [el] });

let editor: Editor | null = null;
afterEach(() => {
  editor?.destroy();
  editor = null;
});

function open(el: SlideElement): Editor {
  const elementType = el.type === 'heading' || el.type === 'list' ? el.type : 'text';
  editor = new Editor({ extensions: getEditorExtensions('', { elementType }), content: elementToHTML(el) });
  return editor;
}

function save<T extends SlideElement>(e: Editor, el: T): T {
  return tiptapToSlide(e.getHTML(), slideOf(el), 0).elements[0] as T;
}

/** Find the document position right after the first occurrence of `needle`. */
function posOf(e: Editor, needle: string, offset = 0): number {
  let found = -1;
  e.state.doc.descendants((node, p) => {
    if (found >= 0) return false;
    if (node.isText && node.text!.includes(needle)) found = p + node.text!.indexOf(needle) + offset;
    return true;
  });
  if (found < 0) throw new Error(`text not found: ${needle}`);
  return found;
}

/** Dispatch a real keydown through the editor's keymaps (keeps selection-only changes). */
function press(e: Editor, key: string, shiftKey = false): boolean {
  const event = new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true });
  return e.view.someProp('handleKeyDown', (f) => f(e.view, event)) ?? false;
}

function select(e: Editor, needle: string): void {
  const from = posOf(e, needle);
  e.commands.setTextSelection({ from, to: from + needle.length });
}

/** Load stored content into a fresh editor and save it again: must be unchanged. */
function expectStable<T extends SlideElement>(el: T): void {
  const again = save(open(el), el);
  expect(again).toEqual(el);
}

// ============================================================================
// Links
// ============================================================================

describe('links', () => {
  it('normalizes and validates link input', () => {
    expect(normalizeLinkHref('example.com')).toBe('https://example.com');
    expect(normalizeLinkHref(' www.example.com/a?b=1 ')).toBe('https://www.example.com/a?b=1');
    expect(normalizeLinkHref('http://x.org')).toBe('http://x.org');
    expect(normalizeLinkHref('me@example.com')).toBe('mailto:me@example.com');
    expect(normalizeLinkHref('mailto:me@example.com')).toBe('mailto:me@example.com');
    for (const bad of ['javascript:alert(1)', ' JaVaScRiPt:alert(1)', 'java\nscript:alert(1)', 'data:text/html,<b>x</b>', 'ftp://x.org', 'vbscript:x', '', 'not a url', 'file:///etc/passwd']) {
      expect(normalizeLinkHref(bad)).toBeNull();
    }
    expect(isAllowedLinkHref('javascript:alert(1)')).toBe(false);
    expect(isAllowedLinkHref('https://ok.com')).toBe(true);
  });

  it('setLink / getLinkAtSelection / unsetLink', () => {
    const el = text('<p>hello world</p>');
    const e = open(el);
    select(e, 'hello');
    expect(cmd.setLink(e, 'example.com')).toBe(true);
    expect(cmd.getLinkAtSelection(e)).toEqual({ href: 'https://example.com' });
    const saved = save(e, el);
    // Tiptap's default target/rel are not stored
    expect(saved.content).toBe('<p><a href="https://example.com">hello</a> world</p>');

    expect(cmd.setLink(e, 'javascript:alert(1)')).toBe(false);
    expect(cmd.getLinkAtSelection(e)).toEqual({ href: 'https://example.com' });

    e.commands.setTextSelection(posOf(e, 'ell'));
    expect(cmd.unsetLink(e)).toBe(true);
    expect(cmd.getLinkAtSelection(e)).toBeNull();
    expect(save(e, el).content).toBe('<p>hello world</p>');
  });

  it('inserts the URL as linked text at a collapsed cursor', () => {
    const el = text('<p>see</p>');
    const e = open(el);
    e.commands.setTextSelection(e.state.doc.content.size - 1);
    expect(cmd.setLink(e, 'docs.example.com')).toBe(true);
    expect(save(e, el).content).toBe('<p>see<a href="https://docs.example.com">https://docs.example.com</a></p>');
  });

  it('never loads javascript: links into the editor', () => {
    const el = text('<p><a href="javascript:alert(1)">x</a> <a href="https://ok.com">ok</a></p>');
    const saved = save(open(el), el);
    expect(saved.content).not.toMatch(/javascript/i);
    expect(saved.content).toContain('<a href="https://ok.com">ok</a>');
  });

  it('does not navigate on click while editing', () => {
    const e = open(text('<p>x</p>'));
    const linkExt = e.extensionManager.extensions.find((ext) => ext.name === 'link');
    expect(linkExt?.options.openOnClick).toBe(false);
    expect(linkExt?.options.autolink).toBe(true);
    expect(linkExt?.options.linkOnPaste).toBe(true);
  });
});

// ============================================================================
// Tables
// ============================================================================

describe('tables', () => {
  function tableEditor(): Editor {
    const e = open(text('<p>intro</p>'));
    e.commands.setTextSelection(posOf(e, 'intro', 5));
    expect(cmd.insertTable(e, 2, 2, true)).toBe(true);
    return e;
  }

  it('inserts a table with a header row and stores canonical HTML', () => {
    const el = text('<p>intro</p>');
    const e = tableEditor();
    expect(cmd.isInTable(e)).toBe(true);
    e.commands.insertContent('Name');
    press(e, 'Tab');
    e.commands.insertContent('Qty');
    press(e, 'Tab');
    e.commands.insertContent('Apples');
    const saved = save(e, el);
    expect(saved.content).toBe(
      '<p>intro</p><table><tbody><tr><th>Name</th><th>Qty</th></tr><tr><td>Apples</td><td></td></tr></tbody></table>',
    );
    expectStable(saved);
  });

  it('row / column / header commands', () => {
    const el = text('<p>intro</p>');
    const e = tableEditor();
    expect(cmd.addRowAfter(e)).toBe(true);
    expect(cmd.addColumnAfter(e)).toBe(true);
    let html = save(e, el).content;
    expect(html.match(/<tr>/g)).toHaveLength(3);
    expect(html.match(/<th>/g)).toHaveLength(3);
    expect(cmd.addRowBefore(e)).toBe(true);
    expect(cmd.addColumnBefore(e)).toBe(true);
    expect(cmd.deleteRow(e)).toBe(true);
    expect(cmd.deleteColumn(e)).toBe(true);
    html = save(e, el).content;
    expect(html.match(/<tr>/g)).toHaveLength(3);
    // Toggles the FIRST row whatever row the cursor is in
    const hadHeader = html.startsWith('<p>intro</p><table><tbody><tr><th>');
    expect(cmd.toggleHeaderRow(e)).toBe(true);
    expect(save(e, el).content.startsWith('<p>intro</p><table><tbody><tr><th>')).toBe(!hadHeader);
    expect(cmd.toggleHeaderRow(e)).toBe(true);
    expect(save(e, el).content.startsWith('<p>intro</p><table><tbody><tr><th>')).toBe(hadHeader);
    expect(save(e, el).content.match(/<th>/g)?.length ?? 0).toBe(hadHeader ? 3 : 0);
    expect(cmd.deleteTable(e)).toBe(true);
    expect(cmd.isInTable(e)).toBe(false);
    expect(save(e, el).content).toBe('<p>intro</p>');
  });

  it('Tab moves between cells; indent is unavailable inside tables', () => {
    const e = tableEditor();
    expect(cmd.canIndent(e)).toBe(false);
    const before = e.state.selection.from;
    press(e, 'Tab');
    expect(e.state.selection.from).toBeGreaterThan(before);
    expect(cmd.isInTable(e)).toBe(true);
  });

  it('is only available in text elements', () => {
    for (const el of [heading('Title'), list(['a'])]) {
      const e = open(el);
      expect(cmd.canInsertTable(e)).toBe(false);
      expect(cmd.insertTable(e, 2, 2)).toBe(false);
      expect(cmd.getActiveFormats(e).tablesAvailable).toBe(false);
      e.destroy();
      editor = null;
    }
  });

  it('keeps merged cells and loads complex tables stably', () => {
    const el = text('<table><tbody><tr><th colspan="2">Wide</th></tr><tr><td>a</td><td><p>p1</p><p>p2</p></td></tr></tbody></table>');
    expectStable(el);
  });
});

// ============================================================================
// Font family
// ============================================================================

describe('font family', () => {
  it('sets, reads, clears and reloads stably', () => {
    const el = text('<p>plain fancy</p>');
    const e = open(el);
    select(e, 'fancy');
    expect(cmd.setFontFamily(e, 'Playfair Display')).toBe(true);
    expect(cmd.getFontFamily(e)).toBe('Playfair Display');
    const saved = save(e, el);
    expect(saved.content).toBe('<p>plain <span style="font-family: &quot;Playfair Display&quot;, serif;">fancy</span></p>');
    expectStable(saved);

    select(e, 'fancy');
    expect(cmd.setFontFamily(e, null)).toBe(true);
    expect(cmd.getFontFamily(e)).toBeNull();
    expect(save(e, el).content).toBe('<p>plain fancy</p>');
  });

  it('is collected for presentation font loading and kept by the sanitizer', () => {
    const el = text('<p>a <span style="font-family: &quot;Lobster&quot;, sans-serif;">b</span></p>');
    const p = { ...createPresentation(), slides: [slideOf(el)] };
    expect(collectPresentationFonts(p)).toEqual(['Lobster']);
    expect(sanitizeHtml(el.content)).toContain('font-family: &quot;Lobster&quot;, sans-serif;');
  });
});

// ============================================================================
// Line height
// ============================================================================

describe('line height', () => {
  it('per paragraph in text elements', () => {
    const el = text('<p>one</p><p>two</p>', { lineHeight: 1.2 });
    const e = open(el);
    e.commands.setTextSelection(posOf(e, 'two'));
    expect(cmd.setLineHeight(e, 1.5)).toBe(true);
    expect(cmd.getLineHeight(e)).toBe(1.5);
    const saved = save(e, el);
    // Block value is stored in the HTML; the element value is untouched
    expect(saved.content).toBe('<p>one</p><p style="line-height: 1.5;">two</p>');
    expect(saved.lineHeight).toBe(1.2);
    expectStable(saved);

    expect(cmd.setLineHeight(e, 'abc')).toBe(false);
    expect(cmd.setLineHeight(e, null)).toBe(true);
    expect(cmd.getLineHeight(e)).toBeNull();
    expect(save(e, el).content).toBe('<p>one</p><p>two</p>');
  });

  it('element-level changes clear per-paragraph overrides', () => {
    const el = text('<p style="line-height: 2; text-align: center;">a</p><p style="line-height: 1.5;">b</p>', { lineHeight: 1.2 });
    expect(cmd.lineHeightUpdates(el, 1.8)).toEqual({ lineHeight: 1.8, content: '<p style="text-align: center;">a</p><p>b</p>' });
    expect(cmd.lineHeightUpdates(heading('x'), undefined)).toEqual({ lineHeight: undefined });
  });

  it('headings and lists store it on the element', () => {
    const h = heading('Title', { lineHeight: 1.1 });
    let e = open(h);
    expect(cmd.getLineHeight(e)).toBe(1.1);
    expectStable(h);
    e = open(h);
    expect(cmd.setLineHeight(e, 2)).toBe(true);
    expect(save(e, h)).toMatchObject({ content: 'Title', lineHeight: 2 });
    expect(cmd.setLineHeight(e, null)).toBe(true);
    expect('lineHeight' in save(e, h)).toBe(false);
    e.destroy();

    const l = list(['a', 'b'], { lineHeight: 1.4 });
    expectStable(l);
    e = open(l);
    e.commands.setTextSelection(posOf(e, 'b'));
    expect(cmd.setLineHeight(e, 1.8)).toBe(true);
    expect(save(e, l)).toMatchObject({ items: ['a', 'b'], lineHeight: 1.8 });
  });
});

// ============================================================================
// Indent / outdent
// ============================================================================

describe('indent / outdent', () => {
  it('paragraph indent levels 0-6 via commands and Tab / Shift-Tab', () => {
    const el = text('<p>one</p><p>two</p>');
    const e = open(el);
    e.commands.setTextSelection(posOf(e, 'two'));
    expect(cmd.canOutdent(e)).toBe(false);
    expect(cmd.indent(e)).toBe(true);
    press(e, 'Tab');
    let saved = save(e, el);
    expect(saved.content).toBe('<p>one</p><p data-indent="2" style="margin-left: 2em;">two</p>');
    expectStable(saved);
    press(e, 'Tab', true);
    expect(save(e, el).content).toBe('<p>one</p><p data-indent="1" style="margin-left: 1em;">two</p>');
    for (let i = 0; i < 10; i++) cmd.indent(e);
    expect(cmd.canIndent(e)).toBe(false);
    saved = save(e, el);
    expect(saved.content).toContain('data-indent="6"');
    for (let i = 0; i < 10; i++) cmd.outdent(e);
    expect(save(e, el).content).toBe('<p>one</p><p>two</p>');
  });

  it('combines with alignment and line height on the same paragraph', () => {
    const el = text('<p>a</p><p data-indent="1" style="text-align: center; line-height: 2; margin-left: 1em;">b</p>');
    const saved = save(open(el), el);
    expect(saved.content).toContain('data-indent="1"');
    expect(saved.content).toContain('line-height: 2');
    expect(saved.content).toContain('text-align: center');
    expectStable(saved);
  });

  it('Tab is left to the browser in headings', () => {
    const e = open(heading('Title'));
    expect(press(e, 'Tab')).toBe(false);
    expect(cmd.canIndent(e)).toBe(false);
  });

  it('sinks and lifts list items (Tab / Shift-Tab)', () => {
    const el = list(['a', 'b']);
    const e = open(el);
    e.commands.setTextSelection(posOf(e, 'b'));
    expect(cmd.canIndent(e)).toBe(true);
    press(e, 'Tab');
    expect(save(e, el).items).toEqual(['a<ul><li>b</li></ul>']);
    expect(cmd.canOutdent(e)).toBe(true);
    expect(cmd.outdent(e)).toBe(true);
    expect(save(e, el).items).toEqual(['a', 'b']);
  });
});

// ============================================================================
// Active formats snapshot
// ============================================================================

describe('getActiveFormats', () => {
  it('reports marks, link, fonts, block formats and table state', () => {
    const el = text(
      '<p style="line-height: 1.5;"><a href="https://x.com"><strong><span style="font-family: &quot;Lato&quot;, sans-serif; color: #ff0000; font-size: 3.2cqw;">rich</span></strong></a></p>',
      { textAlign: 'center' },
    );
    const e = open(el);
    e.commands.setTextSelection(posOf(e, 'rich', 2));
    expect(cmd.getActiveFormats(e)).toEqual({
      bold: true,
      italic: false,
      underline: false,
      strike: false,
      code: false,
      subscript: false,
      superscript: false,
      link: { href: 'https://x.com' },
      fontFamily: 'Lato',
      fontSize: '32px',
      renderedFontSize: null, // not mounted in a slide container
      color: '#ff0000',
      highlight: null,
      lineHeight: 1.5,
      textAlign: 'center',
      listType: null,
      inTable: false,
      tablesAvailable: true,
      canIndent: true,
      canOutdent: false,
    });
  });
});

// ============================================================================
// Rich text <-> markdown
// ============================================================================

describe('rich text markdown', () => {
  const cases: Array<[string, string]> = [
    ['<p>Hello <strong>bold</strong> <em>it</em> <s>gone</s> <code>x|y</code></p>', 'Hello **bold** *it* ~~gone~~ `x|y`'],
    ['<p><a href="https://example.com">a link</a></p><p>two</p>', '[a link](https://example.com)\n\ntwo'],
    ['<p>line<br>break</p>', 'line\\\nbreak'],
    ['<p># not heading * star_ 1. x</p>', '\\# not heading \\* star\\_ 1. x'],
    ['<p>1. not a list</p>', '1\\. not a list'],
    [
      '<table><tbody><tr><th>A</th><th>B | C</th></tr><tr><td><strong>1</strong></td><td><code>p|q</code></td></tr><tr><td></td><td>x</td></tr></tbody></table>',
      '| A | B \\| C |\n| --- | --- |\n| **1** | `p\\|q` |\n|  | x |',
    ],
  ];
  for (const [html, md] of cases) {
    it(`converts ${JSON.stringify(html)}`, () => {
      expect(htmlToRichMarkdown(html)).toBe(md);
      expect(richMarkdownToHtml(md)).toBe(html);
    });
  }

  it('rejects HTML markdown cannot express', () => {
    for (const html of [
      '<p style="text-align: center">x</p>',
      '<p><u>u</u></p>',
      '<p><span style="color: red">x</span></p>',
      '<p></p>',
      '<p data-indent="1" style="margin-left: 1em;">x</p>',
      '<table><tbody><tr><td>no header</td></tr></tbody></table>',
      '<table><tbody><tr><th colspan="2">merged</th></tr></tbody></table>',
      '<ul><li>list</li></ul>',
    ]) {
      expect(htmlToRichMarkdown(html)).toBeNull();
    }
  });
});

describe('style attribute injection through marks', () => {
  it('invalid highlight / color values never reach the HTML', () => {
    const el = text('<p><mark data-color="yellow;position:fixed;inset:0">a</mark> <span style="color: red">b</span></p>');
    const e = open(el);
    select(e, 'b');
    e.chain().setColor('red;position:fixed').run();
    select(e, 'a');
    e.chain().setHighlight({ color: 'x;background:url(https://t.example)' }).run();
    const html = save(e, el).content;
    expect(html).not.toMatch(/position|url\(|t\.example/);
  });
});

describe('list and heading elements never drop content', () => {
  it('backspace at the start of the first item (lifted out of the list)', () => {
    const el = list(['alpha', 'beta']);
    const e = open(el);
    e.commands.setTextSelection(posOf(e, 'alpha'));
    press(e, 'Backspace');
    expect(e.getHTML()).toMatch(/^<p>alpha<\/p><ul>/);
    expect(save(e, el).items).toEqual(['alpha', 'beta']);
  });

  it('paragraphs before, between and after lists become items; lists merge in order', () => {
    const out = tiptapToSlide(
      '<p>intro <strong>b</strong></p><ul><li><p>a</p><ul><li><p>a1</p></li></ul></li></ul><h2>mid</h2><ol><li><p>c</p></li></ol><p>end</p><p></p>',
      slideOf(list(['x'])), 0,
    ).elements[0] as ListElement;
    expect(out.items).toEqual(['intro <strong>b</strong>', 'a<ul><li>a1</li></ul>', 'mid', 'c', 'end']);
    expect(out.ordered).toBe(false);
  });

  it('pasting mixed paragraphs into a list element keeps them', () => {
    const el = list(['one']);
    const e = open(el);
    e.commands.setTextSelection(posOf(e, 'one', 3));
    e.commands.insertContent('<p>p1</p><p>p2</p>');
    const items = save(e, el).items.join('|');
    expect(items).toContain('one');
    expect(items).toContain('p1');
    expect(items).toContain('p2');
  });

  it('partial selection deletes across items keep the remaining text', () => {
    const el = list(['alpha', 'beta', 'gamma']);
    const e = open(el);
    e.commands.setTextSelection({ from: posOf(e, 'pha'), to: posOf(e, 'ta') });
    e.commands.deleteSelection();
    expect(save(e, el).items).toEqual(['alta', 'gamma']);
  });

  it('headings: several blocks are joined with <br>; trailing breaks are stripped', () => {
    const h = heading('x');
    expect(tiptapToSlide('<h1>Hi<br></h1>', slideOf(h), 0).elements[0]).toMatchObject({ content: 'Hi' });
    expect(tiptapToSlide('<h1>One</h1><p>two</p><p></p>', slideOf(h), 0).elements[0]).toMatchObject({ content: 'One<br>two' });
    expect(tiptapToSlide('<p>a<br><br></p>', slideOf(text('')), 0).elements[0]).toMatchObject({ content: '<p>a<br><br></p>' });
  });
});

describe('editing imported markdown text', () => {
  it('keeps inline formatting through an edit', () => {
    const el = text('Plain hooks in `.module` raise *nothing*');
    const saved = save(open(el), el);
    expect(saved.content).toBe('<p>Plain hooks in <code>.module</code> raise <em>nothing</em></p>');
  });

  it('keeps element alignment when the text holds a list or quote', () => {
    for (const content of ['Intro\n\n- a\n- b', '- a\n- b', 'Intro\n\n> quoted']) {
      const el = text(content, { textAlign: 'center' });
      const saved = save(open(el), el);
      expect(saved.textAlign).toBe('center');
      expect(saved.content).not.toMatch(/text-align/);
    }
  });

  it('keeps mixed alignment inside a list as per-paragraph styles', () => {
    const el = text('<p style="text-align: center">A</p><ul><li><p>b</p></li></ul>');
    const saved = save(open(el), el);
    expect(saved.textAlign).toBeUndefined();
    expect(saved.content).toMatch(/<p style="text-align: center;?">A<\/p>/);
  });

  it('keeps an inline image as its markdown source instead of dropping it', () => {
    const el = text('See ![chart](a.png) below');
    const saved = save(open(el), el);
    expect(saved.content).toBe('<p>See ![chart](a.png) below</p>');
  });
});
