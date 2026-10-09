// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ElementRenderer, isRichTextHtml } from '../ElementRenderer';
import type { SlideElement } from '@/types/slide';

const text = (content: string) =>
  ({ id: 't', type: 'text', content, position: { x: 0, y: 0, width: 10, height: 10 } }) as SlideElement;

describe('text element rendering', () => {
  it('detects Tiptap HTML by leading block tag only', () => {
    expect(isRichTextHtml('<p>Hello</p>')).toBe(true);
    expect(isRichTextHtml('Some **md** with <span style="color:red">html</span>')).toBe(false);
  });

  it('renders GFM tables from markdown source', () => {
    const html = renderToStaticMarkup(<ElementRenderer element={text('| a | b |\n|---|---|\n| 1 | 2 |')} />);
    expect(html).toContain('<table>');
    expect(html).toContain('<td>2</td>');
  });

  it('treats single newlines as soft breaks, blank lines as paragraphs', () => {
    const html = renderToStaticMarkup(<ElementRenderer element={text('line one\nline two\n\npara two')} />);
    expect(html.match(/<p>/g)).toHaveLength(2);
  });

  it('sanitizes raw HTML in markdown and Tiptap HTML', () => {
    const md = renderToStaticMarkup(<ElementRenderer element={text('hi <img src="x" onerror="alert(1)"> [x](javascript:alert(1))')} />);
    expect(md).not.toMatch(/onerror|javascript:/i);
    const rich = renderToStaticMarkup(<ElementRenderer element={text('<p>hi<img src="x" onerror="alert(1)"></p>')} />);
    expect(rich).not.toMatch(/onerror/i);
  });
});
