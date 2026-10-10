// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ElementRenderer } from '../ElementRenderer';
import type { SlideElement } from '@/types/slide';

const text = (content: string, extra: Record<string, unknown> = {}) =>
  ({ id: 't', type: 'text', content, position: { x: 0, y: 0, width: 10, height: 10 }, ...extra }) as SlideElement;

describe('rich text editor features render', () => {
  it('tables with merged cells and column widths', () => {
    const html = renderToStaticMarkup(
      <ElementRenderer element={text('<table><tbody><tr><th colspan="2" colwidth="120,80">H</th></tr><tr><td rowspan="1">a</td><td>b</td></tr></tbody></table>')} />,
    );
    expect(html).toContain('<table><tbody><tr><th colspan="2" colwidth="120,80">H</th></tr><tr><td rowspan="1">a</td><td>b</td></tr></tbody></table>');
  });

  it('links (http/mailto kept, javascript: removed, external links open in a new tab)', () => {
    const html = renderToStaticMarkup(
      <ElementRenderer element={text('<p><a href="https://x.org">x</a> <a href="mailto:a@b.co">m</a> <a href="javascript:alert(1)">bad</a></p>')} />,
    );
    expect(html).toContain('<a href="https://x.org" target="_blank" rel="noopener noreferrer">x</a>');
    expect(html).toContain('<a href="mailto:a@b.co">m</a>');
    expect(html).not.toMatch(/javascript:/i);
  });

  it('font family spans, block line height (overriding the element) and indent', () => {
    const html = renderToStaticMarkup(
      <ElementRenderer
        element={text(
          '<p><span style="font-family: &quot;Lato&quot;, sans-serif;">f</span></p><p style="line-height: 2;">lh</p><p data-indent="3" style="margin-left: 3em;">in</p>',
          { lineHeight: 1.2 },
        )}
      />,
    );
    expect(html).toContain('style="line-height:1.2"');
    expect(html).toContain('<span style="font-family: &quot;Lato&quot;, sans-serif;">f</span>');
    expect(html).toContain('<p style="line-height: 2;">lh</p>');
    expect(html).toContain('<p data-indent="3" style="margin-left: 3em;">in</p>');
  });
});
