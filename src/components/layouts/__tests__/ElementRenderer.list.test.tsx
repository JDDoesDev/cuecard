// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ElementRenderer, withExternalLinkTargets } from '../ElementRenderer';
import type { ListElement } from '@/types/slide';

const list = (items: string[], ordered: boolean, extra: Partial<ListElement> = {}): ListElement => ({
  id: 'l', type: 'list', position: { x: 0, y: 0, width: 10, height: 10 }, items, ordered, ...extra,
});

function render(el: ListElement, visibleFragment?: number): HTMLElement {
  const host = document.createElement('div');
  host.innerHTML = renderToStaticMarkup(<ElementRenderer element={el} visibleFragment={visibleFragment} />);
  return host.firstElementChild as HTMLElement;
}

describe('list element rendering', () => {
  it('renders nested sub-lists inside top-level items', () => {
    const root = render(list(['a<ul><li>b<ol start="3"><li>c</li></ol></li></ul>', 'd'], false));
    expect(root.tagName).toBe('UL');
    const top = Array.from(root.children);
    expect(top.map((li) => li.tagName)).toEqual(['LI', 'LI']);
    expect(top[0].querySelector(':scope > ul > li > ol')?.getAttribute('start')).toBe('3');
    expect(top[0].querySelector('ol > li')?.textContent).toBe('c');
  });

  it('renders <ol start> for ordered lists not starting at 1', () => {
    expect(render(list(['a'], true, { start: 4 })).getAttribute('start')).toBe('4');
    expect(render(list(['a'], true)).hasAttribute('start')).toBe(false);
    expect(render(list(['a'], false, { start: 4 })).hasAttribute('start')).toBe(false);
  });

  it('reveals fragments per top-level item only (nested items follow their parent)', () => {
    const root = render(list(['a<ul><li>a1</li><li>a2</li></ul>', 'b'], false, { fragment: 1, fragmentPerItem: true }), 1);
    const top = Array.from(root.children) as HTMLElement[];
    expect(top).toHaveLength(2);
    expect(top[0].className).not.toMatch(/Hidden/);
    expect(top[1].className).toMatch(/Hidden/);
  });
});

describe('external link targets', () => {
  it('opens external links in a new tab at render time only', () => {
    const root = render(list(['<a href="https://x.dev">x</a><ul><li><a href="#local">l</a></li></ul>'], false));
    const [ext, local] = Array.from(root.querySelectorAll('a'));
    expect(ext.getAttribute('target')).toBe('_blank');
    expect(ext.getAttribute('rel')).toBe('noopener noreferrer');
    expect(local.hasAttribute('target')).toBe(false);
  });

  it('leaves links with an explicit target alone', () => {
    const html = '<a target="_self" href="https://x">x</a>';
    expect(withExternalLinkTargets(html)).toBe(html);
  });
});

describe('external link targets (DOM based)', () => {
  it('handles ">" and "target=" inside other attributes', () => {
    const out = withExternalLinkTargets('<a title="a > b target=x" data-href="https://y" href="https://x">x</a> <a data-href="https://z">z</a>');
    const host = document.createElement('div');
    host.innerHTML = out;
    const [a, b] = Array.from(host.querySelectorAll('a'));
    expect(a.getAttribute('target')).toBe('_blank');
    expect(a.getAttribute('title')).toBe('a > b target=x');
    expect(b.hasAttribute('target')).toBe(false);
  });

  it('renders backtick text mentioning <ul> without a nested list', () => {
    const root = render(list(['Use `<ul>` tags'], false));
    expect(root.querySelectorAll('ul ul, li ul')).toHaveLength(0);
  });
});
