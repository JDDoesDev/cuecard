// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { sanitizeHtml, filterInlineStyle, isSafeCssColor } from '../sanitize';
import { ElementRenderer } from '@/components/layouts/ElementRenderer';
import type { SlideElement } from '@/types/slide';

const OVERLAY = '<p style="position:fixed;inset:0;z-index:99999;background:url(https://tracker.example/p.gif)">gotcha</p>';

describe('inline style policy', () => {
  it('blocks the overlay / tracking repro', () => {
    expect(sanitizeHtml(OVERLAY)).toBe('<p>gotcha</p>');
    expect(sanitizeHtml('<p style="color: red; position: fixed; top: 0">x</p>')).toBe('<p style="color: red;">x</p>');
  });

  it('keeps the properties text features use', () => {
    const html =
      '<p data-indent="2" style="text-align: center; line-height: 1.5; margin-left: 2em;"><span style="font-family: &quot;Lato&quot;, sans-serif; font-size: 3.2cqw; color: #ff0000;">a</span><mark data-color="#ff0" style="background-color: #ff0; color: inherit;">b</mark></p>';
    expect(sanitizeHtml(html)).toBe(html);
  });

  it('rejects url(), escapes, comments, smuggled declarations and !important', () => {
    expect(filterInlineStyle('color: red; background-color: url(x)')).toBe('');
    expect(filterInlineStyle('color: re\\64')).toBe('');
    expect(filterInlineStyle('color: red /* x */')).toBe('');
    expect(filterInlineStyle('font-family: "a;position:fixed"')).toBe('');
    expect(filterInlineStyle('color: red !important; line-height: 2')).toBe('color: red; line-height: 2;');
    expect(filterInlineStyle('color: yellow;position:fixed;top:0')).toBe('color: yellow;');
  });

  it('clamps indent margins to 6em and only allows em', () => {
    expect(filterInlineStyle('margin-left: 99em')).toBe('margin-left: 6em;');
    expect(filterInlineStyle('margin-left: -5000px')).toBe('');
  });

  it('validates colors', () => {
    for (const ok of ['#abc', '#aabbcc80', 'rgb(1, 2, 3)', 'hsla(10, 50%, 50%, 0.5)', 'yellow', 'var(--color-accent)']) expect(isSafeCssColor(ok)).toBe(true);
    for (const bad of ['yellow;position:fixed', 'url(x)', 'red}', 'expression(alert(1))', '']) expect(isSafeCssColor(bad)).toBe(false);
  });

  it('applies to raw HTML in markdown text too', () => {
    const el = { id: 't', type: 'text', content: `Hello ${OVERLAY.replace('<p', '<span').replace('</p>', '</span>')}`, position: { x: 0, y: 0, width: 1, height: 1 } } as SlideElement;
    const html = renderToStaticMarkup(createElement(ElementRenderer, { element: el }));
    expect(html).not.toMatch(/position|z-index|tracker/);
    expect(html).toContain('gotcha');
  });
});
