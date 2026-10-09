import { describe, it, expect } from 'vitest';
import { rehypeSanitizeRaw } from '../rehypeSanitizeRaw';

describe('rehypeSanitizeRaw', () => {
  it('strips event handlers, scripts and javascript: urls', () => {
    const tree = {
      type: 'root',
      children: [
        { type: 'element', tagName: 'img', properties: { src: 'x', onError: 'alert(1)' }, children: [] },
        { type: 'element', tagName: 'script', properties: {}, children: [] },
        { type: 'element', tagName: 'a', properties: { href: 'javascript:alert(1)' }, children: [{ type: 'text' }] },
        { type: 'element', tagName: 'a', properties: { href: 'https://ok.example' }, children: [] },
      ],
    };
    rehypeSanitizeRaw()(tree);
    expect(tree.children).toHaveLength(3);
    expect(tree.children[0].properties).toEqual({ src: 'x' });
    expect(tree.children[1].properties).toEqual({});
    expect(tree.children[2].properties).toEqual({ href: 'https://ok.example' });
  });
});
