// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ElementRenderer } from '../ElementRenderer';
import { parsePresentationSync } from '@/lib/parser/parsePresentation';
import type { CodeElement } from '@/types/slide';

// vs2015 colors keywords with this, so its presence means grammar-aware highlighting ran.
const KEYWORD = 'style="color:#569CD6"';

function renderFence(lang: string, code: string): string {
  const { presentation } = parsePresentationSync(`## Example\n\n\`\`\`${lang}\n${code}\n\`\`\`\n`);
  const el = presentation.slides[0].elements.find((e) => e.type === 'code') as CodeElement;
  expect(el.language).toBe(lang);
  return renderToStaticMarkup(<ElementRenderer element={el} />);
}

describe('fenced code block highlighting', () => {
  it('highlights ```php with the PHP grammar', () => {
    const html = renderFence('php', '<?php\nfunction greet($name) { return "Hi"; }');
    expect(html).toContain('class="language-php"');
    expect(html).toContain(`<span ${KEYWORD}>function</span>`);
    expect(html).toContain('$name</span>');
  });

  it('highlights ```javascript and its ```js alias the same way', () => {
    const code = 'const x = async () => await fetch(url);';
    const full = renderFence('javascript', code);
    const alias = renderFence('js', code);
    expect(full).toContain(`<span ${KEYWORD}>const</span>`);
    expect(alias.replace('language-javascript', '')).toBe(full.replace('language-javascript', ''));
  });

  it.each([
    ['ts', 'interface A { x: number }', 'interface'],
    ['PHP', 'echo $x;', 'echo'],
    ['java', 'public class A {}', 'public'],
    ['csharp', 'public class A {}', 'public'],
    ['ruby', 'def hi; end', 'def'],
    ['yml', 'key: true', 'true'],
    ['sh', 'if [ -f x ]; then echo; fi', 'if'],
  ])('highlights ```%s', (lang, code, keyword) => {
    expect(renderFence(lang, code)).toMatch(new RegExp(`<span style="color:#[0-9A-F]{6}">${keyword}</span>`));
  });

  it('renders unknown languages as plain text instead of guessing', () => {
    const html = renderFence('brainfuck', 'const x = function() {}');
    expect(html).not.toContain(KEYWORD);
    expect(html).toContain('const x = function() {}');
  });
});
