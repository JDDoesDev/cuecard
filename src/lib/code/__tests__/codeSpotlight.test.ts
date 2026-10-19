// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { applyCodeSpotlight, sameSpotlight, spotlightAtPointer, SPOTLIGHT_ATTR } from '../codeSpotlight';

/** A slide with one code block (lines 1-3) and one heading, like UniversalSlide renders. */
function slide(): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML = `
    <div data-element-type="heading" data-element-id="h1"><h2>Title</h2></div>
    <div data-element-type="code" data-element-id="c1">
      <pre id="pre"><code>
        <span data-line="1"><span class="linenumber">1</span><span id="tok1">a</span></span>
        <span data-line="2"><span id="tok2">b</span></span>
        <span data-line="3"><span id="tok3">c</span></span>
      </code></pre>
    </div>`;
  document.body.replaceChildren(root);
  return root;
}

const byId = (id: string) => document.getElementById(id);

describe('spotlightAtPointer', () => {
  beforeEach(() => {
    slide();
  });

  it('returns the line under the pointer (incl. its tokens and line number)', () => {
    expect(spotlightAtPointer(byId('tok2'), null)).toEqual({ elementId: 'c1', line: 2 });
    expect(spotlightAtPointer(document.querySelector('.linenumber'), null)).toEqual({ elementId: 'c1', line: 1 });
  });

  it('moves to the line the pointer moves to', () => {
    const current = { elementId: 'c1', line: 2 };
    expect(spotlightAtPointer(byId('tok3'), current)).toEqual({ elementId: 'c1', line: 3 });
  });

  it('keeps the current line between lines inside the block', () => {
    const current = { elementId: 'c1', line: 2 };
    expect(spotlightAtPointer(byId('pre'), current)).toBe(current);
    expect(spotlightAtPointer(byId('pre'), null)).toBeNull();
  });

  it('clears outside the code block', () => {
    const current = { elementId: 'c1', line: 2 };
    expect(spotlightAtPointer(document.querySelector('h2'), current)).toBeNull();
    expect(spotlightAtPointer(null, current)).toBeNull();
  });
});

describe('applyCodeSpotlight', () => {
  it('marks only the spotlit line and clears it again', () => {
    const root = slide();
    const marked = () => Array.from(root.querySelectorAll(`[${SPOTLIGHT_ATTR}]`)).map((el) => el.getAttribute('data-line'));
    applyCodeSpotlight(root, { elementId: 'c1', line: 2 });
    expect(marked()).toEqual(['2']);
    applyCodeSpotlight(root, { elementId: 'c1', line: 3 });
    expect(marked()).toEqual(['3']);
    applyCodeSpotlight(root, { elementId: 'other', line: 1 });
    expect(marked()).toEqual([]);
    applyCodeSpotlight(root, { elementId: 'c1', line: 1 });
    applyCodeSpotlight(root, null);
    expect(marked()).toEqual([]);
  });
});

describe('sameSpotlight', () => {
  it('compares by element and line', () => {
    expect(sameSpotlight(null, null)).toBe(true);
    expect(sameSpotlight({ elementId: 'a', line: 1 }, { elementId: 'a', line: 1 })).toBe(true);
    expect(sameSpotlight({ elementId: 'a', line: 1 }, { elementId: 'a', line: 2 })).toBe(false);
    expect(sameSpotlight({ elementId: 'a', line: 1 }, null)).toBe(false);
  });
});
